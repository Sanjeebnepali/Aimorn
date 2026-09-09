import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getBufferZone, useCoupleStore, waitForCoupleStoreHydration } from './store';
import { recordMyFix } from './myFix';
import { resetMyFix } from './gpsFilter';
import { applyProximityWallpaper } from './wallpaper';

/**
 * Battery-efficient background GPS for the couple proximity feature.
 * Adapted from the source feature's lib/coupleLocation.ts — the location/
 * geofence mechanics are pure Expo APIs with no backend coupling, so this
 * ported near-verbatim; only the "are we actively participating" gate
 * changed (see the comment on `isParticipating` below).
 *
 * Strategy:
 *   1. A TaskManager-defined task receives Location updates from
 *      `Location.startLocationUpdatesAsync` on a ~10 s wall-clock cadence
 *      so the distance stays live even when both phones are stationary. The
 *      OS throttles further under Doze when the screen is off, bounding the
 *      cost to active use.
 *   2. Each update pushes to the server (see myFix.ts → api.ts) and updates
 *      the local store. The store's `setMyLocation` re-computes Haversine
 *      distance against the last known partner GPS, which drives the
 *      proximity-state machine in geo.ts.
 *   3. A geofence around the partner's last known position lets the OS
 *      wake us on enter/exit instead of polling — that's the real battery
 *      win. Geofence radius = proximity threshold (default 100 m).
 */

export const COUPLE_LOCATION_TASK = 'amora.couple.location.v1';
export const COUPLE_GEOFENCE_TASK = 'amora.couple.geofence.v1';

/** We're "linked" for the purposes of location tracking once paired AND
 *  once this account has actually opted in by picking a role (preview.tsx)
 *  — unlike the source feature, pairing (onboarding) and opting into
 *  proximity tracking (preview.tsx) happen at completely different times
 *  here, so `hasPartner` alone would start tracking for every paired couple
 *  whether or not they ever turned this feature on. */
function isParticipating(): boolean {
  const s = useCoupleStore.getState();
  return s.hasPartner && s.myRole !== null;
}

type LocationTaskPayload = {
  data?: { locations?: Location.LocationObject[] };
  error?: TaskManager.TaskManagerError | null;
};

if (!TaskManager.isTaskDefined(COUPLE_LOCATION_TASK)) {
  TaskManager.defineTask(COUPLE_LOCATION_TASK, async ({ data, error }: LocationTaskPayload) => {
    if (error) return;
    const loc = data?.locations?.[0];
    if (!loc) return;
    // MUST come before any store read — this callback can be the FIRST code
    // to run in a fresh headless JS context (app fully killed), where the
    // store's own auto-rehydration-on-init may still be in flight. Without
    // this, isParticipating() below reads the unhydrated INITIAL state
    // (hasPartner: false) and bails out every time — confirmed live, see
    // store.ts's doc comment for the full bug writeup.
    await waitForCoupleStoreHydration();
    if (!isParticipating()) return;
    if (useCoupleStore.getState().paused) return;

    const { latitude, longitude, accuracy, speed } = loc.coords;
    // Smooth (Kalman) + store + push via the shared funnel. The smoothed
    // accuracy still feeds the dynamic buffer band in the store; `speed`
    // adapts the smoothing so a moving phone tracks with little lag.
    await recordMyFix(latitude, longitude, accuracy ?? null, speed ?? null);
    // Re-arm the geofence on every local tick so its radius tracks the
    // LATEST accuracy band — if OUR accuracy degrades (e.g. walking
    // indoors) the band should widen. Geofencing requires background
    // ("Always") permission — on a foreground-only grant it throws; that
    // must never abort the wallpaper apply below, since the geofence is a
    // battery optimization, not load-bearing for proximity.
    try {
      await refreshCoupleGeofence();
    } catch {
      /* geofence is a battery optimization, not load-bearing */
    }
    await applyProximityWallpaper();
  });
}

type GeofenceTaskPayload = {
  data?: { eventType?: Location.GeofencingEventType; region?: Location.LocationRegion };
  error?: TaskManager.TaskManagerError | null;
};

if (!TaskManager.isTaskDefined(COUPLE_GEOFENCE_TASK)) {
  TaskManager.defineTask(COUPLE_GEOFENCE_TASK, async ({ error }: GeofenceTaskPayload) => {
    if (error) return;
    // Same reasoning as COUPLE_LOCATION_TASK above — must come first.
    await waitForCoupleStoreHydration();
    // Defence-in-depth: applyProximityWallpaper already forces 'far' when
    // paused, but short-circuiting here means a geofence wake can't even
    // trigger a re-evaluation while sharing is off.
    if (useCoupleStore.getState().paused) return;
    // The near/far decision happens entirely from store state — just
    // trigger a fresh apply. OS-driven wakes are the whole point of the
    // geofence (no polling).
    await applyProximityWallpaper();
  });
}

// ─── Public start / stop / refresh ───────────────────────────────────────

/**
 * PROMPTING — shows the OS permission dialog. Only call this from an
 * explicit user action that has ALREADY shown the location-disclosure
 * modal and gotten "Allow" (Play/Apple policy requires the disclosure
 * before the OS dialog). Returns the actual granted status so the caller
 * can show "Background location denied — open Settings" if the user said
 * "Only this time."
 */
export async function ensureBackgroundLocationPermission(): Promise<'granted' | 'foreground-only' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.granted) return 'granted';
    return 'foreground-only';
  } catch {
    // Confirmed live (2026-09-08): a stale native build missing the
    // ACCESS_BACKGROUND_LOCATION manifest entry makes this REJECT instead of
    // resolving {granted:false} — an uncaught rejection here silently aborted
    // the whole consent flow, so startCoupleLocation() below never ran and
    // the diagnostics banner never updated, even though foreground access
    // (just granted, above) was fine. The manifest gap is fixed by keeping
    // `android/` in sync via `npx expo prebuild`, but this stays as a
    // defensive fallback — foreground already succeeded, so degrade to that
    // instead of failing the whole request.
    return 'foreground-only';
  }
}

/**
 * READ-ONLY — never shows an OS dialog. Use this for every automatic code
 * path (cold-launch rehydration, the store subscriber reacting to a state
 * change that wasn't a fresh user tap) so a background-permission dialog
 * can never appear without the disclosure modal having been shown first.
 */
export async function getBackgroundLocationPermissionStatus(): Promise<'granted' | 'foreground-only' | 'denied'> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foreground-only';
}

/** Start streaming location updates to the task. Safe to call repeatedly —
 *  short-circuits if the task is already running. */
export async function startCoupleLocation(): Promise<boolean> {
  if (!isParticipating()) return false;

  const already = await Location.hasStartedLocationUpdatesAsync(COUPLE_LOCATION_TASK);
  if (already) return true;

  await Location.startLocationUpdatesAsync(COUPLE_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // ~10 s cadence, well above the 5 s firehose that would drain the
    // battery on an always-on linked session. distanceInterval: 0 is
    // deliberate: it keeps a STATIONARY phone emitting instead of
    // freezing — sitting together at "4 m" must keep refreshing.
    timeInterval: 10_000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: 'Couple proximity',
      notificationBody: 'Sharing location with your partner',
      notificationColor: '#fd7277',
    },
    // Keep delivering fixes even when stationary — some OEMs otherwise
    // pause updates on a still phone, and the distance would never appear.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
  });

  // Seed an IMMEDIATE position so the dashboard shows a distance right away
  // instead of waiting for the stream's first emit. Fire-and-forget so it
  // never blocks startup; try a fresh fix, fall back to last-known.
  void (async () => {
    try {
      const pos =
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)) ??
        (await Location.getLastKnownPositionAsync());
      if (!pos || !isParticipating()) return;
      const { latitude, longitude, accuracy, speed } = pos.coords;
      await recordMyFix(latitude, longitude, accuracy ?? null, speed ?? null);
      await applyProximityWallpaper();
    } catch {
      /* best-effort seed — the stream + geofence still drive updates */
    }
  })();

  return true;
}

/**
 * Called unconditionally on every teardown (sign-out, unlink, a fresh
 * bootstrap resetting prior state) — including when location permission was
 * NEVER granted at all, e.g. right after a clean install. On Android,
 * `hasStartedLocationUpdatesAsync`/`hasStartedGeofencingAsync` don't just
 * return false in that case — they REJECT with "Not authorized to use
 * background location services" (confirmed on-device: this was surfacing as
 * an unhandled promise rejection that aborted bootstrapCoupleFeature() before
 * it ever reached hydrate(), leaving the Couple tab stuck un-hydrated).
 * "Not authorized" unambiguously means nothing could be running, so it's
 * caught and treated the same as "already stopped" rather than propagated.
 */
export async function stopCoupleLocation(): Promise<void> {
  // Drop the smoothing state so the next pairing starts from a clean fix
  // instead of inheriting the old location's filter estimate.
  resetMyFix();
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(COUPLE_LOCATION_TASK);
    if (already) await Location.stopLocationUpdatesAsync(COUPLE_LOCATION_TASK);
  } catch {
    /* no permission ⇒ nothing was started */
  }
  try {
    const geofenced = await Location.hasStartedGeofencingAsync(COUPLE_GEOFENCE_TASK);
    if (geofenced) await Location.stopGeofencingAsync(COUPLE_GEOFENCE_TASK);
  } catch {
    /* no permission ⇒ nothing was started */
  }
}

/**
 * Re-arm the geofence around the partner's latest known position — stays
 * centred on "where they currently are" so an enter/exit event fires when
 * WE cross the threshold around THEIR pin. The OS gives us the enter/exit
 * dispatch entirely for free: the difference between polling constantly
 * and "the OS wakes us at the boundary, zero battery otherwise."
 */
export async function refreshCoupleGeofence(): Promise<void> {
  const s = useCoupleStore.getState();
  if (!isParticipating()) return;
  if (s.partnerLat == null || s.partnerLng == null) return;

  // Size the geofence to the FAR edge of the dynamic buffer band so the OS
  // wakes us at the same boundary the wallpaper logic flips on.
  const accs = [s.myAccuracy, s.partnerAccuracy].filter((a): a is number => a != null && Number.isFinite(a));
  const { far } = getBufferZone(accs.length ? Math.max(...accs) : null, s.thresholdM);

  const already = await Location.hasStartedGeofencingAsync(COUPLE_GEOFENCE_TASK);
  if (already) await Location.stopGeofencingAsync(COUPLE_GEOFENCE_TASK);
  await Location.startGeofencingAsync(COUPLE_GEOFENCE_TASK, [
    {
      identifier: 'partner',
      latitude: s.partnerLat,
      longitude: s.partnerLng,
      radius: far,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
}
