import { useEffect, useRef } from 'react';
import { useAppOpenAd, useForeground } from 'react-native-google-mobile-ads';

import { APP_OPEN_AD_UNIT_ID } from './adUnitIds';
import { isAdsConfigured, useAdsConfigured } from './configureAds';

// Google's own guidance (and the user's own explicit choice when this was
// built): show on every foreground/resume, EXCEPT the very first-ever cold
// start, with a short cooldown so quickly alt-tabbing (checking a
// notification, switching apps) doesn't bombard the user with back-to-back
// full-screen ads. react-native-google-mobile-ads's useForeground already
// excludes cold start on its own (it only fires on a real
// background->active transition, never on initial mount — see that hook's
// own source) — this cooldown is the one thing it doesn't do for you.
const MIN_INTERVAL_MS = 60_000;

/**
 * Shows a real AdMob "App Open" ad (what the user calls a "loading ad" —
 * the ad Google's own format is actually FOR: filling the moment someone
 * returns to an app) every time Amora comes back to the foreground.
 * Call once, near the root of the app (RootLayout), same "one instance for
 * the whole app" shape as configureAds()/configurePurchases() — this isn't
 * tied to any one screen.
 */
export function useAppOpenAdOnForeground(): void {
  const { isLoaded, isClosed, load, show } = useAppOpenAd(APP_OPEN_AD_UNIT_ID);
  const lastShownAt = useRef(0);
  // Reactive — this hook mounts at the very root of the app, almost
  // certainly before configureAds()'s async consent round-trip resolves,
  // so "ready" arriving late has to actually trigger the preload below
  // rather than being missed by a one-off snapshot. See configureAds.ts's
  // own doc comment.
  const adsConfigured = useAdsConfigured();

  // Keep one ready at all times: the moment ads become configured (mount,
  // or later once configureAds() resolves), and again immediately after
  // each one closes (load() also resets isClosed back to false — see
  // useRewardedAdReward.ts's own comment on the same reset behavior — so
  // this doesn't loop).
  useEffect(() => {
    if (adsConfigured) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsConfigured]);

  useEffect(() => {
    if (isClosed && isAdsConfigured()) load();
  }, [isClosed, load]);

  useForeground(() => {
    if (!isAdsConfigured() || !isLoaded) return;
    const now = Date.now();
    if (now - lastShownAt.current < MIN_INTERVAL_MS) return;
    lastShownAt.current = now;
    show();
  });
}
