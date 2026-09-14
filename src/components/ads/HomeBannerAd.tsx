import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { BANNER_AD_UNIT_ID } from '@/ads/adUnitIds';
import { useAdsConfigured } from '@/ads/configureAds';

/**
 * The Banner placement the user asked for — bottom of the Home tab only
 * (their own explicit choice over "every main tab"), added 2026-09-14
 * alongside the Rewarded and App Open integrations.
 *
 * Rendered as the LAST item in Home's own ScrollView (see
 * src/app/(tabs)/index.tsx), not as a fixed/absolute overlay pinned to the
 * screen edge — that ScrollView's own contentContainerStyle already
 * reserves real bottom padding (165dp) to clear the floating tab bar
 * (floating-tab-bar.tsx), whose own exact position was tuned through
 * multiple rounds of real-device touch testing (see that file's own doc
 * comments). Scrolling the banner in with everything else gets the same
 * clearance for free instead of this component re-deriving — and risking
 * getting wrong — that already-solved math a second time.
 *
 * `LARGE_ANCHORED_ADAPTIVE_BANNER`: Google's current recommended default
 * over the old fixed 320x50 `BANNER` size — auto-sizes to the device's own
 * width instead of leaving letterboxed gutters on wider screens.
 */
export function HomeBannerAd() {
  // Reactive, not a one-off snapshot — this can render before
  // configureAds()'s async consent round-trip resolves (Home is often the
  // very first screen), so this needs to actually re-render once it does.
  // See configureAds.ts's own doc comment.
  const adsConfigured = useAdsConfigured();
  // A real ad that fails to load (no fill, offline, ads not configured
  // yet) renders as nothing rather than a dead gray box — same "no fake
  // placeholder" reasoning as every other ad surface in this app.
  const [failed, setFailed] = useState(false);

  if (!adsConfigured || failed) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
});
