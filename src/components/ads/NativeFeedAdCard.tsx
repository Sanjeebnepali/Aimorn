import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';

import { GlassCard } from '@/components/primitives/glass-card';
import { NATIVE_AD_UNIT_ID } from '@/ads/adUnitIds';
import { useAdsConfigured } from '@/ads/configureAds';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * The "ad in the middle of the page when we scroll" the user asked for —
 * inserted into Home's Recent Post grid (see (tabs)/index.tsx's
 * `feedItemsWithAds`) styled to match that grid's own TemplateCard shape
 * (same 168x196 size, same rounded/bordered/gradient-scrim look) rather
 * than a plain boxed banner breaking up the feed — the user's own explicit
 * choice between the two options offered, and the AdMob format actually
 * built for this ("Native": raw ad *data* — headline, media, CTA — you
 * lay out yourself, vs. a pre-rendered box like BannerAd).
 *
 * The "Ad" label pill (top-left, styled like TemplateCard's credit pill)
 * is NOT optional cosmetic choice — AdMob policy requires every native ad
 * be clearly, visibly distinguished from organic content, in every layout
 * that renders one.
 */
export function NativeFeedAdCard() {
  const theme = useAppTheme();
  const adsConfigured = useAdsConfigured();
  const [ad, setAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    if (!adsConfigured) return;
    let cancelled = false;
    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID)
      .then((loaded) => {
        if (cancelled) loaded.destroy();
        else setAd(loaded);
      })
      .catch(() => {
        // No fill / offline / not yet configured — same "render nothing,
        // never a dead placeholder box" reasoning as HomeBannerAd.
      });
    return () => {
      cancelled = true;
    };
  }, [adsConfigured]);

  if (!ad) return null;

  return (
    <NativeAdView nativeAd={ad} style={[styles.card, { width: 168, height: 196, borderColor: theme.glassBorder }]}>
      <NativeAsset assetType={NativeAssetType.IMAGE}>
        <NativeMediaView resizeMode="cover" style={StyleSheet.absoluteFill} />
      </NativeAsset>
      <LinearGradient
        colors={['rgba(26,10,20,0.85)', 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />

      <GlassCard radius={radii.pill} disableBlur style={styles.adPill}>
        <Text style={[styles.adPillText, { color: theme.inkSoft }]}>Ad</Text>
      </GlassCard>

      <View style={styles.labelBlock}>
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text style={[styles.headline, { color: theme.ink }]} numberOfLines={2}>
            {ad.headline}
          </Text>
        </NativeAsset>
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={[styles.cta, { color: theme.accent2 }]} numberOfLines={1}>
            {ad.callToAction}
          </Text>
        </NativeAsset>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, position: 'relative' },
  adPill: { position: 'absolute', top: 9, left: 9, paddingHorizontal: 9, paddingVertical: 3 },
  adPillText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.4 },
  labelBlock: { position: 'absolute', left: 12, right: 12, bottom: 11 },
  headline: { fontFamily: fonts.bodyBold, fontSize: 13 },
  cta: { fontFamily: fonts.bodyMedium, fontSize: 11.5, marginTop: 2 },
});
