import { useCallback, useEffect, useRef } from 'react';
import { useRewardedAd } from 'react-native-google-mobile-ads';

import { REWARDED_AD_UNIT_ID } from './adUnitIds';
import { isAdsConfigured, useAdsConfigured } from './configureAds';

/**
 * Thin Promise-based wrapper around react-native-google-mobile-ads's own
 * `useRewardedAd` hook — same "hide the load/show/event-listener
 * boilerplate behind one async function" shape as src/iap's
 * usePaywallPurchases, so paywall-modal.tsx's two reward call sites
 * (`handleWatchAd`, `handleWatchTrialAd`) can just `await showAd()` and
 * only tell the server about it if that resolves `true`.
 *
 * Replaces the two credit-reward endpoints' previous behavior of being
 * called the INSTANT the button was tapped, with no ad actually shown —
 * see server/src/routes/creditsRoutes.ts's own doc comment on
 * /profile/trial/watch-ad, which already flagged this as a known
 * placeholder waiting on exactly this integration.
 */
export function useRewardedAdReward() {
  const { isLoaded, isClosed, isEarnedReward, error, load, show } = useRewardedAd(REWARDED_AD_UNIT_ID);
  // Reactive: the paywall can in principle mount before configureAds()'s
  // async consent round-trip resolves (a fast tap right after cold start),
  // so this needs to notice "ready now" arriving late, not just check once
  // at mount — see configureAds.ts's own doc comment.
  const adsConfigured = useAdsConfigured();

  // The in-flight showAd() call's resolve/reject, if any — a plain ref
  // (not state) since it's write-once-read-once per ad and never itself
  // drives a render; only the hook's own isLoaded/isClosed/error do that.
  const pendingRef = useRef<{ resolve: (earned: boolean) => void; reject: (err: Error) => void } | null>(null);

  // Preload the moment ads become configured, whether that's already true
  // on mount or arrives later — so the first tap doesn't have to wait on a
  // network round trip (the library's own recommended pattern). Also how a
  // fresh ad gets queued up again after each show (see the CLOSED effect
  // below): `load()` resets isClosed/isEarnedReward back to false as part
  // of resetting to a clean slate for the NEXT ad, which is exactly why
  // it's safe to call again here whenever `adsConfigured` flips true.
  useEffect(() => {
    if (adsConfigured) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsConfigured]);

  // The ad finished (shown fully, skipped, or dismissed early) — resolve
  // whichever showAd() call started it with whatever isEarnedReward ended
  // up being, which by this point already reflects a real EARNED_REWARD
  // event if one fired (AdMob always fires that before CLOSED, not after).
  useEffect(() => {
    if (!isClosed || !pendingRef.current) return;
    const { resolve } = pendingRef.current;
    pendingRef.current = null;
    resolve(isEarnedReward ?? false);
    load(); // queue the next one immediately, win or lose
  }, [isClosed, isEarnedReward, load]);

  // A real SDK error (failed to load, failed to show, no fill, offline...).
  // Rejects an in-flight showAd() if there was one; either way, kick off
  // another load() so a transient failure (e.g. one bad network blip on
  // the silent background preload) self-heals instead of leaving this
  // device's "Watch Ad" button permanently stuck disabled until restart.
  useEffect(() => {
    if (!error) return;
    if (pendingRef.current) {
      const { reject } = pendingRef.current;
      pendingRef.current = null;
      reject(error);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const showAd = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve, reject) => {
      if (!isAdsConfigured()) {
        reject(new Error('Ads aren’t available on this device right now — please try again shortly.'));
        return;
      }
      if (!isLoaded) {
        reject(new Error('The ad isn’t ready yet — please try again in a moment.'));
        return;
      }
      pendingRef.current = { resolve, reject };
      show();
    });
  }, [isLoaded, show]);

  return { showAd, isReady: isLoaded };
}
