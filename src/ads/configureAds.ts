import { create } from 'zustand';
import MobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

/**
 * Boots the Google Mobile Ads SDK — replaces the placeholder reward flow
 * (server/src/routes/creditsRoutes.ts's /profile/ad-reward and
 * /profile/trial/watch-ad, both explicitly flagged there as "no ad SDK is
 * wired into the app yet") with a real rewarded-ad integration. Called
 * once from RootLayout (src/app/_layout.tsx), same "module-scope, before
 * any screen mounts" timing as src/iap/purchases.ts's configurePurchases()
 * — ads need to be ready before the paywall's first "Watch Ad" tap, same
 * reasoning as purchases needing to be ready before its first "Buy" tap.
 *
 * Order matters and is NOT optional: Google's own AdMob policy (and GDPR/
 * UK-ATT law for EEA/UK users) requires gathering consent via the UMP SDK
 * BEFORE requesting any ad — calling MobileAds().initialize() first would
 * start the SDK's own ad-serving machinery (which can itself trigger ad
 * requests) ahead of knowing whether this user is allowed to see
 * personalized ads at all. `AdsConsent.gatherConsent()` is the library's
 * own documented all-in-one helper: it requests consent info, and — only
 * if this user's region requires it (EEA/UK; most other regions come back
 * NOT_REQUIRED immediately, so this resolves fast) — shows Google's own
 * consent form before resolving.
 *
 * A zustand store, not a plain module boolean + getter (which is what this
 * was originally, and which useRewardedAdReward.ts's mount-time
 * `if (isAdsConfigured()) load()` can get away with, since the paywall only
 * mounts well after boot) — HomeBannerAd renders on literally the FIRST
 * screen, often before this async consent round-trip has resolved. A plain
 * getter snapshot taken at that first render would permanently miss the
 * "actually, we're ready now" transition with nothing to trigger a
 * re-render; a store gives any component (HomeBannerAd included) a
 * `useAdsConfigured()` hook that re-renders the moment this actually
 * flips.
 */
const useAdsConfiguredStore = create<{ configured: boolean }>(() => ({ configured: false }));

/** Reactive — re-renders the calling component when configureAds() finishes.
 * Prefer this in any component render path (HomeBannerAd, etc.). */
export function useAdsConfigured(): boolean {
  return useAdsConfiguredStore((s) => s.configured);
}

/** Non-reactive snapshot — fine for a one-off check at the moment of a user
 * action (useRewardedAdReward's showAd(), its mount-time preload), where
 * "is it ready RIGHT NOW" is what's actually being asked, not "tell me
 * when it becomes ready." */
export function isAdsConfigured(): boolean {
  return useAdsConfiguredStore.getState().configured;
}

export async function configureAds(): Promise<void> {
  if (isAdsConfigured()) return;
  try {
    const consentInfo = await AdsConsent.gatherConsent();
    // `canRequestAds` is the SDK's own answer to "is it OK to ask for an ad
    // yet" — true both when consent was actually obtained AND when this
    // user's region never required it in the first place, so this is the
    // one flag to gate on rather than re-deriving it from `status`.
    if (!consentInfo.canRequestAds) {
      console.warn('AdMob: consent not yet obtainable — ads stay disabled this session.');
      return;
    }
    await MobileAds().initialize();
    useAdsConfiguredStore.setState({ configured: true });
  } catch (err) {
    // Best-effort, same "don't crash app boot over an optional SDK" shape
    // as purchases.ts's own configurePurchases() — a failed consent/init
    // call (no network on cold start, say) just means the "Watch Ad" /
    // trial cards show their "not available right now" state until the
    // next app launch retries this.
    console.warn('AdMob configure failed:', err);
  }
}
