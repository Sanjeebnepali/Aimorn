import { pushCoupleLocation } from './api';
import { acceptFix, smoothMyFix } from './gpsFilter';
import { useCoupleStore } from './store';

/**
 * Single funnel for the local user's GPS. Every place a fix for US arrives
 * (foreground live loop, background location task, the startup seed) calls
 * this so:
 *   1. the raw fix is Kalman-smoothed (one shared filter = one ordered
 *      stream, so the distance stops bouncing on GPS noise), then
 *   2. the smoothed position is written to the store (drives the live
 *      distance) AND pushed to the server so the partner sees the clean
 *      value.
 *
 * Keeping it in one place means the filter can never be bypassed by one of
 * the three entry points, which would reintroduce the jitter on that path.
 */
export async function recordMyFix(
  lat: number,
  lng: number,
  accuracyM: number | null,
  speedMps?: number | null,
): Promise<void> {
  const now = Date.now();
  // Drop teleport glitches / very-vague fixes before they corrupt the estimate.
  if (!acceptFix(lat, lng, accuracyM, now)) return;
  // `speedMps` (GPS ground speed) adapts the Kalman smoothing: a still phone
  // gets a steady number, a walking/running one tracks with little lag.
  const s = smoothMyFix(lat, lng, accuracyM, now, speedMps);
  useCoupleStore.getState().setMyLocation(s.lat, s.lng, s.accuracy);
  await pushCoupleLocation(s.lat, s.lng, s.accuracy);
}
