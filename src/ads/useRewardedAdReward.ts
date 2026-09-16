import { useCallback, useEffect, useRef, useState } from 'react';
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
/** How long to wait for a `load()` call to resolve (either way) before
 * treating it as stuck and retrying — see the timeout effect below for why
 * this exists at all. AdMob's own SDK-level request timeout is 60s
 * (confirmed live via logcat's own "HTTP timeout: 60000 milliseconds"), far
 * too long to leave a tapped "Watch Ad" button silently stuck with no
 * feedback; this is deliberately much shorter. */
const LOAD_TIMEOUT_MS = 20_000;

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

  // True once at least one load() attempt has gone unanswered (neither
  // isLoaded nor error) past LOAD_TIMEOUT_MS — lets the paywall tell "still
  // trying, give it a moment" apart from "this has been stuck a while,"
  // something the raw isLoaded/error pair alone can't express. Confirmed
  // live 2026-09-16: a real device, with a real rewarded ad unit id and a
  // successfully-initialized SDK, can have its very first `load()` request
  // go out (native logs show the request starting) and then just never
  // call back AT ALL — no onAdLoaded, no onAdFailedToLoad — leaving
  // isLoaded/error both stuck at their initial falsy values forever with
  // nothing to ever trigger the existing error-driven retry below. Cleared
  // back to false the moment a load either succeeds or genuinely errors.
  const [loadTimedOut, setLoadTimedOut] = useState(false);

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

  // The self-healing retry for a `load()` that never calls back at all
  // (see loadTimedOut's own doc comment) — every OTHER stuck state here
  // (a real onAdFailedToLoad, a shown-and-closed ad) already re-calls
  // load() on its own via the effects below; this timer is the one path
  // that covers "no callback ever fired." Re-armed on every isLoaded/error
  // change so a request that's still legitimately in flight doesn't get
  // timed out from a stale earlier timer.
  useEffect(() => {
    if (!adsConfigured || isLoaded) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoadTimedOut(true);
      load();
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsConfigured, isLoaded, error]);

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
        reject(
          new Error(
            loadTimedOut
              ? 'No ad is available right now — please try again later.'
              : 'The ad isn’t ready yet — please try again in a moment.',
          ),
        );
        return;
      }
      pendingRef.current = { resolve, reject };
      show();
    });
  }, [isLoaded, loadTimedOut, show]);

  return { showAd, isReady: isLoaded, loadTimedOut };
}
