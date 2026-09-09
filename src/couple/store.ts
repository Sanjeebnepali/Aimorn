import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Actions, State } from './types';
import { recomputeDistance } from './geo';

/**
 * Couple proximity feature — state for the UI, mostly in-memory.
 * `amora/server` (Neon Postgres) is the source of truth for persistence
 * (the Couple + CoupleLocation tables); this store's own `hydrated` flag
 * means "has bootstrap.ts's GET /couple fetch landed", NOT the disk
 * persistence described below — those are two different concepts that just
 * happen to want the same word, see the store creation below for the
 * disk-persistence one (`useCoupleStore.persist.*`).
 *
 * Adapted from the source feature's store/couple.ts — same shape and
 * lifecycle, minus the code/isCreator/LinkStatus fields that don't apply
 * here (pairing is already handled by onboarding; see types.ts).
 *
 * BUG FOUND 2026-09-08 (live two-account testing, no second device — see
 * `server/scripts/simulate-partner.ts`): this store used to be pure
 * in-memory (a bare `create()`, no persistence at all). That's fine while
 * the app process is alive, including backgrounded — but `location.ts`'s
 * background location + geofence tasks (`TaskManager.defineTask`) can also
 * run in a HEADLESS JS context Android spins up after the app process is
 * fully killed, which re-evaluates this module fresh with NO React tree
 * ever mounting — meaning `bootstrap.ts`'s hydrate() (the thing that
 * normally populates this store from the server) never runs. Confirmed
 * live: force-stopped the app, waited 40+ seconds (4x the task's 10s
 * cadence), pushed a new far-away partner location via
 * simulate-partner.ts — the device's own location never got pushed again
 * (checked the real `CoupleLocation` row's timestamp: unchanged) and the
 * home-screen wallpaper never updated, even though "switches your
 * wallpaper... even when the app is closed" is this feature's own
 * onboarding pitch. Root cause: `isParticipating()` in location.ts reads
 * `hasPartner`/`myRole` from this store, which — with no persistence and no
 * bootstrap effect to hydrate it — sat at `INITIAL` (`hasPartner: false`)
 * in that headless context, so the task bailed out immediately every time.
 *
 * Fix: persist just the slice a headless task needs (see `partialize`
 * below) to AsyncStorage, and have location.ts's two task handlers
 * explicitly await rehydration (`waitForCoupleStoreHydration`, exported
 * below) before reading store state — persist's own auto-rehydration on
 * store creation is async and isn't guaranteed to have finished by the time
 * a freshly-spun-up headless task's callback runs. This closes the "my own
 * movement while the app is fully closed" gap. It does NOT close "partner
 * moves while I'm fully closed" — this device has no live channel to learn
 * that without the app running (the WS in socket.ts is a live-process
 * connection, not something a headless task can hold open); catching that
 * case too would need a server-sent push (FCM/Expo push) waking a headless
 * handler, which is a real, separate feature this session didn't add.
 */

export type { PartnerProfile, ProximityState } from './types';
export { getBufferZone, haversineMeters } from './geo';

const INITIAL: State = {
  hydrated: false,
  hasPartner: false,
  partner: null,
  myRole: null,
  partnerRole: null,
  myLat: null,
  myLng: null,
  myUpdatedAt: null,
  myAccuracy: null,
  partnerLat: null,
  partnerLng: null,
  partnerUpdatedAt: null,
  partnerAccuracy: null,
  partnerDistanceM: null,
  proximity: 'unknown',
  packId: null,
  paused: false,
  thresholdM: 100,
  error: null,
};

export const useCoupleStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setHydrated: (v) => set({ hydrated: v }),

      setCoupleState: (s) => {
        set({
          hasPartner: s.hasPartner,
          partner: s.partner,
          myRole: s.myRole,
          partnerRole: s.partnerRole,
          packId: s.packId,
          paused: s.paused,
          thresholdM: s.thresholdM,
        });
        // Clear partner-side location state whenever the link/pairing itself
        // isn't there, so a stale pin can't follow into a future pairing.
        if (!s.hasPartner) {
          set({
            partnerLat: null,
            partnerLng: null,
            partnerUpdatedAt: null,
            partnerAccuracy: null,
            partnerDistanceM: null,
            proximity: 'unknown',
          });
        } else {
          recomputeDistance(get(), set);
        }
      },

      setMyLocation: (lat, lng, accuracy = null) => {
        set({ myLat: lat, myLng: lng, myUpdatedAt: Date.now(), myAccuracy: accuracy });
        recomputeDistance(get(), set);
      },

      setPartnerLocation: (lat, lng, updatedAt, accuracy = null) => {
        set({
          partnerLat: lat,
          partnerLng: lng,
          partnerUpdatedAt: updatedAt,
          partnerAccuracy: accuracy,
        });
        recomputeDistance(get(), set);
      },

      setSettings: (s) => {
        set((prev) => ({
          packId: s.packId !== undefined ? s.packId : prev.packId,
          paused: s.paused !== undefined ? s.paused : prev.paused,
          thresholdM: s.thresholdM !== undefined ? s.thresholdM : prev.thresholdM,
        }));
        recomputeDistance(get(), set);
      },

      setError: (msg) => set({ error: msg }),
      clearError: () => set({ error: null }),

      // Also wipes the persisted disk copy (not just in-memory) — without
      // this, a sign-out/unlink on a shared device could leave a PREVIOUS
      // account's hasPartner/partnerLat/packId sitting in AsyncStorage for a
      // headless background task to pick up and wrongly act on after a
      // different account signs in (see this file's doc comment for why a
      // headless task trusts persisted storage over a hydrate() that never
      // gets to run). void — persist.clearStorage() is fire-and-forget here,
      // same as every other teardown step in bootstrap.ts's
      // teardownCoupleFeature().
      reset: () => {
        set({ ...INITIAL, hydrated: true });
        void useCoupleStore.persist.clearStorage();
      },
    }),
    {
      name: 'amora-couple',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the slice a killed-app background task needs (see this file's
      // doc comment) — NOT the live-session-only fields: `hydrated` and
      // `error` should never come back stale-true/stale-set on a fresh
      // launch, and `myLat/myLng/myUpdatedAt/myAccuracy`/`partnerDistanceM`/
      // `proximity` are all recomputed fresh from a real GPS fix the moment
      // one arrives (recomputeDistance), so persisting them would only risk
      // shipping a stale number for the split-second before that happens.
      partialize: (s) => ({
        hasPartner: s.hasPartner,
        partner: s.partner,
        myRole: s.myRole,
        partnerRole: s.partnerRole,
        packId: s.packId,
        paused: s.paused,
        thresholdM: s.thresholdM,
        partnerLat: s.partnerLat,
        partnerLng: s.partnerLng,
        partnerUpdatedAt: s.partnerUpdatedAt,
        partnerAccuracy: s.partnerAccuracy,
      }),
    },
  ),
);

/**
 * Await this before reading `useCoupleStore.getState()` from a context that
 * might be a freshly-spun-up Android headless JS task (see this file's doc
 * comment) — persist's own rehydration-on-init is async and racy against a
 * task callback that can start running as soon as this module evaluates.
 * A no-op await once the store is already hydrated (the normal in-app case:
 * hydration finishes long before a user could tap anything), so safe to
 * call unconditionally.
 */
export async function waitForCoupleStoreHydration(): Promise<void> {
  if (useCoupleStore.persist.hasHydrated()) return;
  await useCoupleStore.persist.rehydrate();
}

// ─── Selectors ───────────────────────────────────────────────────────────
// Narrow selectors so subscribers re-render only when the slice they care
// about changes (Zustand re-runs every subscriber per setState unless
// selectors return shallowly-equal values).

export const useCoupleProximity = () => useCoupleStore((s) => s.proximity);
export const useCoupleDistance = () => useCoupleStore((s) => s.partnerDistanceM);
export const useCouplePaused = () => useCoupleStore((s) => s.paused);
export const useCouplePackId = () => useCoupleStore((s) => s.packId);
export const useMyRole = () => useCoupleStore((s) => s.myRole);
