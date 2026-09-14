import { TestIds } from 'react-native-google-mobile-ads';

/**
 * Every ad unit id Amora uses, read from EXPO_PUBLIC_-prefixed env vars —
 * same "client-safe id, swappable without a code change" reasoning as
 * src/iap/purchases.ts's RevenueCat keys. An ad unit id isn't a secret
 * (Google's own docs show it shipped in client code everywhere), so an env
 * var here is about swapping test → real per environment, not hiding
 * anything.
 *
 * Each falls back to Google's own OFFICIAL sample ad unit ids (exported by
 * the SDK itself as `TestIds`, not hand-copied here — see
 * https://developers.google.com/admob/android/test-ads and .../ios/test-ads
 * for where the library's own copy comes from) when no real one is set
 * yet — these always serve real SDK-rendered test creatives, work without
 * any AdMob account at all, and are safe to ship in a dev build; they just
 * never pay out real revenue. `TestIds` is already Platform.select'd
 * internally, so these constants are correct on both Android and iOS with
 * no extra branching here.
 */
export const REWARDED_AD_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || TestIds.REWARDED;

/** Whether a REAL rewarded ad unit id is configured — used only to log a
 * clear one-time console note (see configureAds.ts) so "why is this always
 * a test ad" is never a silent mystery during development. */
export const isUsingTestRewardedUnit = !process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;

/** The "loading ad" the user asked for — Google's own "App Open" format,
 * shown when the app returns to the foreground (see
 * useAppOpenAdOnForeground.ts). */
export const APP_OPEN_AD_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_APP_OPEN_UNIT_ID || TestIds.APP_OPEN;

/** Bottom-of-Home-tab banner (see components/ads/HomeBannerAd.tsx). Not yet
 * created in the user's AdMob console as of 2026-09-14 — stays on the
 * Google sample id (real test creative, zero setup needed) until a real
 * one is set here. */
export const BANNER_AD_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID || TestIds.BANNER;

/** The mid-scroll "in-feed" ad — Google's "Native" format, styled to look
 * like one more post in Home's Recent Post grid rather than a boxed-in
 * banner (see components/ads/NativeFeedAdCard.tsx). Not yet created in the
 * user's AdMob console as of 2026-09-14 — stays on the Google sample id
 * until a real one is set here. */
export const NATIVE_AD_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID || TestIds.NATIVE;
