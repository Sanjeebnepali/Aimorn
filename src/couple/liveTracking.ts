import * as Location from 'expo-location';

import { recordMyFix } from './myFix';
import { useCoupleStore } from './store';

/**
 * Foreground "live distance" mode — the Uber-style fast refresh.
 *
 * The background location stream (location.ts) runs at a deliberately slow
 * ~10 s cadence so an always-on linked session doesn't drain the battery.
 * That's correct when the app is closed, but it makes the distance LAG
 * while the user is actively watching the dashboard.
 *
 * While the dashboard is focused we take a FRESH high-accuracy fix of our
 * own position every `LIVE_INTERVAL_MS`, smooth + store + push it. Simpler
 * than the feature this was ported from: there the same tick also polled
 * for the partner's position, because Supabase Realtime's RLS-gated read
 * could silently drop rows on a stationary phone. Here the partner's
 * position instead arrives over the WS push channel (socket.ts) as soon as
 * THEIR device sends a fix, so this tick only needs to handle our own side.
 */
const LIVE_INTERVAL_MS = 1500;

let liveTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

async function liveTick(): Promise<void> {
  // Reentrancy guard: a GPS fix can take longer than the interval; never let
  // a slow tick overlap the next one.
  if (ticking) return;
  ticking = true;
  try {
    const s = useCoupleStore.getState();
    if (!s.hasPartner || !s.myRole || s.paused) return;

    const pos = await Location.getCurrentPositionAsync({
      // Best the hardware can do — worth it while actively watching.
      accuracy: Location.Accuracy.BestForNavigation,
    }).catch(() => null);
    if (!pos) return;
    const { latitude, longitude, accuracy, speed } = pos.coords;
    await recordMyFix(latitude, longitude, accuracy ?? null, speed ?? null);
  } finally {
    ticking = false;
  }
}

/** Begin fast foreground refresh. Idempotent — a second call is a no-op. */
export function startCoupleLiveTracking(): void {
  if (liveTimer) return;
  void liveTick(); // refresh immediately, don't wait a full interval
  liveTimer = setInterval(() => void liveTick(), LIVE_INTERVAL_MS);
}

/** Stop fast refresh; the slow background cadence keeps the distance alive. */
export function stopCoupleLiveTracking(): void {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}
