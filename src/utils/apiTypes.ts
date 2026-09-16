/**
 * Response shapes for amora/server's API — split out of api.ts 2026-09-11 to
 * keep that file under the workspace's 350-line module limit. Pure types,
 * no behavior; api.ts re-exports every one of these so existing imports
 * (`import { ProfileResponse } from '../../utils/api'`) keep working
 * unchanged.
 */

// GROUP added 2026-09-12 — 2-4 DISTINCT people fused into one photo
// together (real request: "three faces in one photo"), separate from
// COUPLE's fixed 2-person + individual-solos design. See server's
// prisma/schema.prisma SubjectMode enum doc comment for the full story.
export type UsageMode = 'SOLO' | 'COUPLE' | 'GROUP';

export type ProfileResponse = {
  id: string;
  displayName: string | null;
  avatarKey: string | null;
  stylePreference: string | null;
  usageMode: UsageMode | null;
  username: string | null;
  pairingCode: string | null;
  hasPartner: boolean;
  onboarded: boolean;
  /** Spendable balance — one generation costs 1 (SOLO) or 3 (COUPLE), see
   * generations.ts. Real server value as of 2026-09-11; Profile used to show
   * a hardcoded "6" here regardless of the account's actual balance. */
  credits: number;
  /** Earned separately from `credits` — see PostResponse.regenerationCount
   * and POST /profile/redeem-points below for how these accrue and convert. */
  points: number;
  /** Real count of this account's COMPLETE generations — Profile used to
   * show a hardcoded "18" here regardless of how many wallpapers exist. */
  generationCount: number;
  subscriptionTier?: 'FREE' | 'TRIAL' | 'PRO' | 'ULTRA';
  subscriptionExpiresAt?: string | null;
  isSubscribed?: boolean;
  adWatchesToday?: number;
  lastDailyCreditReset?: string | null;
  /** Progress toward the one-time 3-day free trial — see POST
   * /profile/trial/watch-ad. `trialEligible` false means it's already been
   * used (ever), regardless of whether it's still active. */
  trialAdsWatched?: number;
  trialAdsRequired?: number;
  trialEligible?: boolean;
  /** Real user-controlled push-notification preference (Profile →
   * Notifications) — see server's User.notificationsEnabled doc comment for
   * why this is separate from the OS-level permission check. */
  notificationsEnabled?: boolean;
};

export type CoupleRole = 'A' | 'B';

export type GenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export type GenerationResponse = {
  id: string;
  status: GenerationStatus;
  subjectMode: UsageMode;
  templateId: string | null;
  styleKey: string;
  description: string | null;
  errorMessage: string | null;
  createdAt: string;
  /** "Together" shot for COUPLE, the only image for SOLO. */
  outputUrl: string | null;
  /** Solo portrait of the "You" photo — COUPLE only, null for SOLO. */
  outputUrlA: string | null;
  /** Solo portrait of the "Partner" photo — COUPLE only, null for SOLO. */
  outputUrlB: string | null;
};

export type PostAuthor = { id: string; displayName: string | null; avatarUrl: string | null };

export type PostResponse = {
  id: string;
  title: string | null;
  caption: string | null;
  regenerationCount: number;
  /** How many times this post's detail screen has been opened — see
   * src/app/post/[id].tsx and src/posts/socket.ts for the live-updating
   * counterpart of this same number. */
  viewCount: number;
  createdAt: string;
  subjectMode: UsageMode;
  styleKey: string;
  templateId: string | null;
  // Deliberately only the together shot — never the per-person solo halves
  // (GenerationResponse.outputUrlA/outputUrlB), even for a COUPLE post.
  // Those are private previews for the couple-dashboard/gallery pickers
  // (your own reference photos, your own generations); publicly sharing
  // one partner's solo close-up without the other person in frame is a
  // real consent problem the server (posts.ts) doesn't even fetch the data
  // for anymore. A solo photo IS still shareable — just as its own real
  // SOLO-mode generation/post, never bundled in from a couple session.
  outputUrl: string | null;
  author: PostAuthor;
};

export type CoupleResponse = {
  hasPartner: boolean;
  partner: { id: string; displayName: string | null; avatarKey: string | null } | null;
  myRole: CoupleRole | null;
  partnerRole: CoupleRole | null;
  /** Matches a CouplePack.id (bundled) or a Generation.id (AI-generated —
   *  see customPackTogetherUrl below). */
  packId: string | null;
  /** Non-null together (and only together) when packId refers to a real
   *  AI-generated couple session rather than one of the 3 bundled packs. */
  customPackTogetherUrl: string | null;
  customPackAUrl: string | null;
  customPackBUrl: string | null;
  paused: boolean;
  thresholdM: number;
  partnerLocation: { lat: number; lng: number; accuracyM: number | null; updatedAt: string } | null;
};
