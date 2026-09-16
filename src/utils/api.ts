/**
 * Thin fetch wrapper for amora/server, bound to the current Clerk session.
 * A hook (not a plain export) because every call needs a fresh token via
 * getToken(), and that's only available from useAuth() inside a component.
 */
import { useAuth } from '@clerk/expo';

import type {
  UsageMode,
  ProfileResponse,
  CoupleRole,
  GenerationStatus,
  GenerationResponse,
  PostAuthor,
  PostResponse,
  CoupleResponse,
} from './apiTypes';
import { request } from './apiClient';
import { buildAdminApi } from './adminApi';
import { buildCoupleApi } from './coupleApi';
import { buildNotificationsApi } from './notificationsApi';

// Re-exported so every existing `import { ProfileResponse } from '.../utils/api'`
// keeps working — the types themselves now live in apiTypes.ts (split out
// 2026-09-11 to keep this file under the workspace's 350-line module limit).
export type { UsageMode, ProfileResponse, CoupleRole, GenerationStatus, GenerationResponse, PostAuthor, PostResponse, CoupleResponse };

export function useApi() {
  const { getToken } = useAuth();

  return {
    getProfile(): Promise<ProfileResponse> {
      return getToken().then((token) => request<ProfileResponse>('/profile/me', token));
    },
    submitOnboarding(input: {
      displayName: string;
      avatarKey?: string;
      stylePreference: string;
      usageMode: UsageMode;
    }): Promise<ProfileResponse> {
      return getToken().then((token) =>
        request<ProfileResponse>('/profile/onboarding', token, { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    redeemPairingCode(code: string): Promise<ProfileResponse> {
      return getToken().then((token) =>
        request<ProfileResponse>('/profile/pair', token, { method: 'POST', body: JSON.stringify({ code }) }),
      );
    },

    // ─── AI generation ──────────────────────────────────────────────────
    /**
     * Uploads one local photo (a `file://` URI from `pickImageSafely`) to
     * object storage and returns the key `createGeneration` needs. Two
     * requests, not one: `/uploads/presign` gets a short-lived S3 PUT URL
     * (see server/src/lib/storage.ts), then the photo bytes go straight
     * there — our own server never sees them, only the resulting key.
     * `fetch(localUri).then(r => r.blob())` is the standard Expo/RN way to
     * turn a local file URI into upload-able bytes.
     */
    async uploadPhoto(localUri: string): Promise<string> {
      const contentType = localUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const token = await getToken();
      const { key, uploadUrl } = await request<{ key: string; uploadUrl: string }>('/uploads/presign', token, {
        method: 'POST',
        body: JSON.stringify({ contentType }),
      });
      const bytes = await (await fetch(localUri)).blob();
      // Presigned with this exact Content-Type baked into the signature — a
      // mismatched header here fails the PUT with a signature error, not a
      // silent wrong-type upload.
      const putResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
      if (!putResponse.ok) throw new Error(`Photo upload failed (${putResponse.status})`);
      return key;
    },
    /**
     * Checked right after `uploadPhoto`, BEFORE calling `createGeneration`
     * — added 2026-09-12, real complaint: a blurry/low-quality photo was
     * silently burning a credit on a generation that was never going to
     * look like the person. Server-side (server's lib/ai/photoQuality.ts)
     * since real blur/face detection needs an actual vision model, not
     * something worth a native RN module for. Fails open server-side, so
     * this never throws for a normal transient error — only `usable: false`
     * with a real, specific `reason` should ever block the caller.
     */
    checkPhotoQuality(key: string): Promise<{ usable: boolean; reason: string }> {
      return getToken().then((token) =>
        request<{ usable: boolean; reason: string }>('/uploads/quality-check', token, {
          method: 'POST',
          body: JSON.stringify({ key }),
        }),
      );
    },
    createGeneration(input: {
      templateId?: string;
      styleKey: string;
      subjectMode: UsageMode;
      description?: string;
      /** One or more storage keys — different angles of the SAME "You"
       * person. Changed from a single key 2026-09-12 for multi-angle
       * identity lock (real complaint: "output unrecognizable, completely
       * different from the original") — see server's promptBuilder.ts
       * PromptInput.photoACount doc comment for the research this is
       * built against. Always ≥1 entry. */
      photoAKeys: string[];
      /** Same idea as photoAKeys, for "Partner". Absent for SOLO. */
      photoBKeys?: string[];
      /** Set when generating via a post's "Recreate" button — see
       * src/app/post/[id].tsx. Feeds that post's regenerationCount/points
       * (server/src/routes/generations.ts's awardPointsForRegeneration). */
      sourcePostId?: string;
      /** Set by the "General" create mode (freeform-form.tsx) — see
       * server's promptBuilder.ts PromptInput.freeform doc comment. Only
       * ever sent alongside subjectMode: 'SOLO' and no templateId, the one
       * combination the server's own zod refine actually accepts it for. */
      freeform?: boolean;
    }): Promise<GenerationResponse> {
      return getToken().then((token) =>
        request<GenerationResponse>('/generations', token, { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    getGeneration(id: string): Promise<GenerationResponse> {
      return getToken().then((token) => request<GenerationResponse>(`/generations/${id}`, token));
    },
    /** Every one of the caller's own generations, most recent first — the
     * real source of truth for Gallery, the Couple Dashboard's "your
     * creations" picker, and (indirectly, via /profile/me) Profile's
     * wallpaper count. See server/src/routes/generations.ts's doc comment. */
    listGenerations(): Promise<GenerationResponse[]> {
      return getToken().then((token) => request<GenerationResponse[]>('/generations', token));
    },
    /** Permanently deletes one of the caller's own generations (and its
     * public post, if it had one) — the real server call result/[id].tsx's
     * Delete button needs. Previously that button only ever called
     * gallery-store.ts's local `deleteCreation`, which is why a "deleted"
     * wallpaper came back the next time the app re-synced Gallery from the
     * server (see generations.ts's DELETE /generations/:id doc comment). */
    deleteGeneration(id: string): Promise<void> {
      return getToken().then((token) => request(`/generations/${id}`, token, { method: 'DELETE' }));
    },
    /** Redoes ONE image of an already-complete couple/solo session — the
     * real ask: not liking one of a couple session's 3 images shouldn't
     * mean paying for and waiting on all 3 again. Costs 1 credit (one real
     * image), server-side (server/src/routes/generationsRegenerate.ts).
     * The OTHER two slots' URLs come back unchanged/plain; only the
     * regenerated slot's URL carries a cache-busting query string, since
     * it's the only one whose actual bytes changed — see that route's own
     * doc comment for why the key itself stays the same. */
    regenerateGenerationPart(
      id: string,
      part: 'together' | 'a' | 'b',
      prompt?: string,
      overrides?: { overridePhotoAKey?: string; overridePhotoBKey?: string },
    ): Promise<GenerationResponse> {
      return getToken().then((token) =>
        request<GenerationResponse>(`/generations/${id}/regenerate`, token, {
          method: 'POST',
          body: JSON.stringify({
            part,
            prompt: prompt?.trim() || undefined,
            ...overrides,
          }),
        }),
      );
    },

    // ─── Community posts ────────────────────────────────────────────────
    createPost(input: { generationId: string; title?: string; caption?: string }): Promise<PostResponse> {
      return getToken().then((token) =>
        request<PostResponse>('/posts', token, { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    /** Public feed, most recent first — Home's "Recent Post" section. Pass
     * back a previous call's `nextCursor` to load the next page; a null
     * `nextCursor` means there's nothing more to load. */
    listPosts(cursor?: string | null): Promise<{ posts: PostResponse[]; nextCursor: string | null }> {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return getToken().then((token) =>
        request<{ posts: PostResponse[]; nextCursor: string | null }>(`/posts${query}`, token),
      );
    },
    /** The caller's own shared posts — "My Posts" (src/app/manage-posts). */
    listMyPosts(): Promise<PostResponse[]> {
      return getToken().then((token) => request<PostResponse[]>('/posts/mine', token));
    },
    /** Top 5 by regeneration count — Home's "Trending Creations" section. */
    listTrendingPosts(): Promise<PostResponse[]> {
      return getToken().then((token) => request<PostResponse[]>('/posts/trending', token));
    },
    getPost(id: string): Promise<PostResponse> {
      return getToken().then((token) => request<PostResponse>(`/posts/${id}`, token));
    },
    deletePost(id: string): Promise<void> {
      return getToken().then((token) => request(`/posts/${id}`, token, { method: 'DELETE' }));
    },
    /** Records one view of a post — src/app/post/[id].tsx calls this once
     * per open. The live-updating count while the screen stays open comes
     * from src/posts/socket.ts instead, not from this response. */
    recordPostView(id: string): Promise<{ viewCount: number }> {
      return getToken().then((token) => request(`/posts/${id}/view`, token, { method: 'POST' }));
    },
    /** Converts earned points into spendable credits, 1:1. Omit `amount` to
     * redeem everything available. */
    redeemPoints(amount?: number): Promise<{ credits: number; points: number }> {
      return getToken().then((token) =>
        request('/profile/redeem-points', token, { method: 'POST', body: JSON.stringify({ amount }) }),
      );
    },
    /** Grants +1 credit when watching a rewarded video ad. Capped at 5/day —
     * a 429 with `error`/`adWatchesToday` means today's cap is already hit. */
    /** `addedCredits` is 0 on a "watched, but not this one" call — the
     * reward only fires every AD_WATCHES_PER_CREDIT-th watch (see
     * creditsConfig.ts). `adsUntilNextCredit` is what the UI shows on a
     * 0-credit response so watching still feels like it counted toward
     * something, not just a silent no-op. */
    claimAdReward(): Promise<{
      success: boolean;
      addedCredits: number;
      adWatchesToday: number;
      adsUntilNextCredit: number;
      profile: ProfileResponse;
    }> {
      return getToken().then((token) => request('/profile/ad-reward', token, { method: 'POST' }));
    },
    /** Counts one watched ad toward unlocking the one-time 3-day free trial.
     * `activated: true` on the response means this was the ad that crossed
     * the threshold — the trial is live and `addedCredits`/`trialExpiresAt`
     * are populated; otherwise it's just progress (`adsWatched`/`adsRequired`). */
    watchTrialAd(): Promise<{
      success: boolean;
      activated: boolean;
      adsWatched: number;
      adsRequired: number;
      addedCredits: number;
      trialExpiresAt: string | null;
      profile: ProfileResponse;
    }> {
      return getToken().then((token) => request('/profile/trial/watch-ad', token, { method: 'POST' }));
    },
    /** Grants 2 free daily check-in credits every 24h. */
    claimDailyCheckin(): Promise<{ success: boolean; claimed: boolean; addedCredits: number; profile: ProfileResponse }> {
      return getToken().then((token) => request('/profile/daily-checkin', token, { method: 'POST' }));
    },
    /** Mock-billing path, same as `subscribe` below — paywall-modal.tsx now
     * buys real consumable packs via `Purchases.purchasePackage()` +
     * `syncIap()` instead (see src/iap/usePaywallPurchases.ts). Left in
     * place (server route included) as a manual/admin credit-grant escape
     * hatch, not wired to any UI. */
    buyCreditPack(packId: 'STARTER' | 'VALUE' | 'MEGA'): Promise<{ success: boolean; addedCredits: number; profile: ProfileResponse }> {
      return getToken().then((token) =>
        request('/profile/buy-credits', token, { method: 'POST', body: JSON.stringify({ packId }) }),
      );
    },
    /** Mock-billing path (server just grants credits directly, no real
     * store purchase) — kept only for whatever hasn't migrated to real
     * RevenueCat purchases yet. Prefer `syncIap` after a real
     * `Purchases.purchasePackage()` call (see paywall-modal.tsx). */
    subscribe(tier: 'PRO' | 'ULTRA', duration: 'WEEKLY' | 'MONTHLY'): Promise<{ success: boolean; tier: string; expiresAt: string; addedCredits: number; profile: ProfileResponse }> {
      return getToken().then((token) =>
        request('/profile/subscribe', token, { method: 'POST', body: JSON.stringify({ tier, duration }) }),
      );
    },
    /** Reconciles this account against RevenueCat's own authoritative
     * purchase record right after a real purchase completes client-side
     * (paywall-modal.tsx, immediately following `Purchases.purchasePackage()`)
     * — see server/src/routes/iapSync.ts's doc comment for why this doesn't
     * just trust whatever the client itself thinks it bought. Safe to call
     * any time, not only right after a purchase (e.g. app resume), since
     * it's idempotent against a purchase already applied. */
    syncIap(): Promise<ProfileResponse> {
      return getToken().then((token) => request<ProfileResponse>('/iap/sync', token, { method: 'POST' }));
    },

    // ─── Push notifications ─────────────────────────────────────────────
    /** Registers this device's real FCM token — see server's push.ts doc
     * comment. Called from src/notifications/register.ts right after a
     * real permission grant, and again on every sign-in (a token can
     * rotate at any time per FCM's own docs). */
    registerPushToken(token: string): Promise<void> {
      return getToken().then((authToken) =>
        request('/profile/push-token', authToken, { method: 'PATCH', body: JSON.stringify({ token }) }),
      );
    },
    /** The real on/off switch behind Profile → Notifications. */
    updateNotificationSettings(enabled: boolean): Promise<ProfileResponse> {
      return getToken().then((authToken) =>
        request<ProfileResponse>('/profile/notification-settings', authToken, {
          method: 'PATCH',
          body: JSON.stringify({ enabled }),
        }),
      );
    },

    // ─── Couple proximity ────────────────────────────────────────────────
    // Split into its own builder 2026-09-14 — this file was already at the
    // workspace's 350-line module cap before account deletion (below) needed
    // room too. See coupleApi.ts's own doc comment.
    ...buildCoupleApi(getToken),
    // ─── Admin (app-owner only) ─────────────────────────────────────────
    ...buildAdminApi(getToken),
    // ─── Notification History ───────────────────────────────────────────
    ...buildNotificationsApi(getToken),

    // ─── Account ────────────────────────────────────────────────────────
    /**
     * Permanently deletes the caller's account and everything tied to it —
     * see server/src/routes/accountDelete.ts's own doc comment for exactly
     * what that covers (generations, posts, R2 objects, couple link, the
     * Clerk identity itself). Irreversible; the confirmation UI lives in
     * src/app/delete-account/index.tsx, not here — this is just the wire.
     */
    deleteAccount(): Promise<void> {
      return getToken().then((token) => request('/account', token, { method: 'DELETE' }));
    },
  };
}
