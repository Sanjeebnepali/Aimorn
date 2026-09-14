import { fetchCouple } from './api';
import { refreshCoupleGeofence, startCoupleLocation, stopCoupleLocation } from './location';
import { syncLocationErrorBanner } from './locationConsent';
import { stopCoupleLiveTracking } from './liveTracking';
import { connectCoupleSocket } from './socket';
import { useCoupleStore } from './store';
import { applyProximityWallpaper, precacheActiveCouplePack } from './wallpaper';

/**
 * Couple-proximity feature bootstrap. Call `bootstrapCoupleFeature(userId)`
 * once auth resolves (see src/app/_layout.tsx's RootNavigator) and
 * `teardownCoupleFeature()` on sign-out. Idempotent for the same user id.
 *
 * Adapted from the source feature's lib/coupleBootstrap.ts: the shape is the
 * same (hydrate → open the push channel → react to store changes with
 * start/stop location + wallpaper re-apply), but the auth trigger is
 * simpler — Amora gates auth through Clerk hooks in a component, not a
 * Zustand auth store this module could subscribe to at module scope, so
 * the caller (a `useEffect` keyed on Clerk's `userId`) drives entry/exit
 * instead of this file watching auth itself.
 */

const RESILIENCE_POLL_MS = 30_000;

let bootedForUserId: string | null = null;
let disconnectSocket: (() => void) | null = null;
let resilienceTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeStore: (() => void) | null = null;
/** Dedup guard for the location/wallpaper side-effects — "participating"
 *  means paired AND this account has picked a role (see location.ts's
 *  isParticipating for why pairing alone isn't enough here). */
let participating = false;

export async function bootstrapCoupleFeature(userId: string): Promise<void> {
  if (bootedForUserId === userId) return;
  await teardownCoupleFeature();
  bootedForUserId = userId;

  wireStoreEffects();
  await hydrate();
}

export async function teardownCoupleFeature(): Promise<void> {
  bootedForUserId = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  disconnectSocket?.();
  disconnectSocket = null;
  if (resilienceTimer) {
    clearInterval(resilienceTimer);
    resilienceTimer = null;
  }
  participating = false;
  stopCoupleLiveTracking();
  await stopCoupleLocation();
  useCoupleStore.getState().reset();
}

/**
 * Re-fetch GET /couple and push it into the store — exported so a screen
 * can call it right after a mutation (setCoupleRole, setCoupleSettings,
 * unlinkCouple) instead of hand-rolling the same store patch, or waiting
 * for the next socket event / resilience poll to pick it up.
 */
export async function refreshCoupleState(): Promise<void> {
  await hydrate();
}

/** Fetch GET /couple and push it into the store. Also the re-sync path for
 *  a socket 'linked'/'unlinked' event and the resilience poll below — one
 *  function, one shape, so every path that learns "something changed"
 *  ends up at the same authoritative read. */
async function hydrate(): Promise<void> {
  const couple = await fetchCouple();
  useCoupleStore.getState().setCoupleState({
    hasPartner: couple?.hasPartner ?? false,
    partner: couple?.partner ?? null,
    myRole: couple?.myRole ?? null,
    partnerRole: couple?.partnerRole ?? null,
    packId: couple?.packId ?? null,
    customPackTogetherUrl: couple?.customPackTogetherUrl ?? null,
    customPackAUrl: couple?.customPackAUrl ?? null,
    customPackBUrl: couple?.customPackBUrl ?? null,
    paused: couple?.paused ?? false,
    thresholdM: couple?.thresholdM ?? 100,
  });
  if (couple?.partnerLocation) {
    useCoupleStore
      .getState()
      .setPartnerLocation(
        couple.partnerLocation.lat,
        couple.partnerLocation.lng,
        new Date(couple.partnerLocation.updatedAt).getTime(),
        couple.partnerLocation.accuracyM,
      );
  }
  useCoupleStore.getState().setHydrated(true);

  if (couple?.hasPartner && !disconnectSocket) {
    disconnectSocket = connectCoupleSocket({ onLinked: () => void hydrate(), onUnlinked: () => void hydrate() });
    startResiliencePoll();
  }
}

function startResiliencePoll(): void {
  if (resilienceTimer) return;
  // Low-frequency backstop for a missed socket push (backgrounded, briefly
  // disconnected while reconnecting) — re-runs the same authoritative read
  // `hydrate()` does, so it self-corrects location AND settings/role drift,
  // not just position.
  resilienceTimer = setInterval(() => {
    if (useCoupleStore.getState().hasPartner) void hydrate();
  }, RESILIENCE_POLL_MS);
}

function wireStoreEffects(): void {
  unsubscribeStore = useCoupleStore.subscribe((state, prev) => {
    const shouldParticipate = state.hasPartner && state.myRole !== null;
    if (shouldParticipate !== participating) {
      participating = shouldParticipate;
      if (shouldParticipate) void enterParticipating();
      else void exitParticipating();
    }

    // The geofence has to follow the partner's pin. Caught, not just
    // `void`-ed: geofencing needs background permission and throws without
    // it (a real, expected case — role-pick doesn't require granting
    // location first) — an uncaught rejection here would otherwise abort
    // silently with no visible effect beyond a logged warning.
    if (participating && (state.partnerLat !== prev.partnerLat || state.partnerLng !== prev.partnerLng)) {
      refreshCoupleGeofence().catch(() => {
        /* geofence is a battery optimization, not load-bearing */
      });
    }
    // Proximity flipped, or our role changed — the on-screen wallpaper is
    // stale until re-applied. (Also re-runs inside the location task on
    // every tick — this catches the "partner moved across our threshold"
    // case that arrives via the socket instead.)
    if (state.proximity !== prev.proximity || state.myRole !== prev.myRole) {
      void applyProximityWallpaper();
    }
    // Pack swap → precache the new images AND apply immediately. Also
    // fires on a same-packId URL change, not just a packId change: a
    // regenerate of one image in the couple's ALREADY-active custom pack
    // (server/src/routes/generationsRegenerate.ts) pushes a fresh
    // customPack*Url over this same 'settings' channel without ever
    // touching packId itself (the generation id doesn't change, only its
    // bytes/URL do — see that route's own doc comment). Comparing packId
    // alone missed exactly that case: the store update landed, but nothing
    // re-read it into the actual displayed/applied wallpaper until the next
    // unrelated proximity tick, which could be minutes away or never if the
    // user stayed still — the literal "regeneration doesn't actually update
    // the file" bug this whole block exists to prevent.
    if (
      state.packId !== prev.packId ||
      state.customPackTogetherUrl !== prev.customPackTogetherUrl ||
      state.customPackAUrl !== prev.customPackAUrl ||
      state.customPackBUrl !== prev.customPackBUrl
    ) {
      void precacheActiveCouplePack();
      void applyProximityWallpaper();
    }
  });
}

async function enterParticipating(): Promise<void> {
  void precacheActiveCouplePack();

  // READ-ONLY — this runs from an automatic path (hydration, a socket
  // event), never a fresh user tap, so it must never itself trigger the OS
  // permission dialog. The preview screen's explicit "pick a side" action
  // goes through locationConsent.ts's disclosure-gated request instead.
  const perm = await syncLocationErrorBanner();

  if (perm !== 'denied') {
    await startCoupleLocation();
  }

  try {
    await refreshCoupleGeofence();
  } catch {
    /* geofence is a battery optimization, not load-bearing */
  }
  await applyProximityWallpaper();
}

async function exitParticipating(): Promise<void> {
  // Safety net — the dashboard screen itself stops live tracking on blur,
  // this just guarantees it can't outlive an unlink/sign-out either.
  stopCoupleLiveTracking();
  await stopCoupleLocation();
}
