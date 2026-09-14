import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import type { resultBackgrounds } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { styles } from './styles';

/**
 * Small presentational subcomponents for the result screen
 * (src/app/result/[id].tsx) — split out 2026-09-11 alongside ./styles.ts
 * purely to keep that route file under the workspace's 350-line limit.
 * Pure props-in, JSX-out; none of these own any state or business logic.
 */

/**
 * The full-bleed background: real generated image once loaded, or a
 * decorative gradient/glow/silhouette placeholder before it — wrapped in
 * the ViewShot the parent screen captures for save/share/set-wallpaper.
 * Split out of result/[id].tsx 2026-09-12 (alongside GROUP mode's own
 * silhouette-count case) to keep that route file under the workspace's
 * 350-line cap — this was already the single largest, most self-contained
 * JSX block in it. `shotRef` is passed through as a plain prop rather than
 * this component using `forwardRef` — one line simpler, and nothing else
 * here needs to be a ref-forwarding component.
 */
export function WallpaperBackground({
  shotRef,
  bg,
  isSolo,
  isGroup,
  aiImageUri,
}: {
  shotRef: React.RefObject<ViewShotRef | null>;
  // A genuine union, not just `solo`'s shape — .solo has glowA/glowB, .couple
  // has sunGlow instead, and the caller passes .couple for BOTH couple and
  // GROUP (no separate "group" theme exists). `isSolo` (not this type)
  // is the real, caller-guaranteed correlation with which shape `bg`
  // actually has at runtime, so the two access sites below assert it
  // rather than pretending TS can narrow a union off a separate boolean.
  bg: (typeof resultBackgrounds)['solo'] | (typeof resultBackgrounds)['couple'];
  isSolo: boolean;
  isGroup: boolean;
  aiImageUri: string | null | undefined;
}) {
  return (
    <ViewShot ref={shotRef} style={StyleSheet.absoluteFill} options={{ format: 'png', quality: 1 }}>
      <LinearGradient colors={bg.gradient} locations={bg.locations} style={StyleSheet.absoluteFill} />

      {aiImageUri ? (
        <ExpoImage source={{ uri: aiImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      ) : (
        <>
          {/* bg is already resolved to the right shape by the caller (solo
           * vs couple — GROUP shares couple's), so this reads its glow
           * colors directly off `bg` rather than the module-level
           * resultBackgrounds constant the original inline JSX used — same
           * values, since `bg === resultBackgrounds.solo` exactly when
           * isSolo is true. Asserted to the concrete shape each branch
           * actually has, since `bg`'s declared type is the union of both
           * and isSolo (a separate prop) is what the caller actually
           * guarantees the correlation with, not something this union
           * lets TS narrow on its own. */}
          {isSolo ? (
            <>
              <View pointerEvents="none" style={[styles.glowSpot, { top: 90, left: -40 }]}>
                <Glow size={230} color={(bg as (typeof resultBackgrounds)['solo']).glowA} />
              </View>
              <View pointerEvents="none" style={[styles.glowSpot, { top: 160, right: -60 }]}>
                <Glow size={200} color={(bg as (typeof resultBackgrounds)['solo']).glowB} />
              </View>
            </>
          ) : (
            <View pointerEvents="none" style={[styles.glowSpot, { top: 120, left: '50%', marginLeft: -110 }]}>
              <Glow size={220} color={(bg as (typeof resultBackgrounds)['couple']).sunGlow} />
            </View>
          )}

          <LinearGradient pointerEvents="none" colors={[bg.horizonHaze, 'transparent']} style={styles.horizonHaze} />

          <View pointerEvents="none" style={styles.silhouetteRow}>
            {isSolo ? (
              <View style={[styles.silhouetteSolo, { backgroundColor: bg.silhouette }]} />
            ) : isGroup ? (
              // No dedicated 3rd silhouette shape exists — this is only ever
              // a transient placeholder shown for a moment before the real
              // group photo loads, so reusing tall+short+short (rather than
              // adding a new style just for this) is a fine trade.
              <>
                <View style={[styles.silhouetteTall, { backgroundColor: bg.silhouette }]} />
                <View style={[styles.silhouetteShort, { backgroundColor: bg.silhouette }]} />
                <View style={[styles.silhouetteShort, { backgroundColor: bg.silhouette }]} />
              </>
            ) : (
              <>
                <View style={[styles.silhouetteTall, { backgroundColor: bg.silhouette }]} />
                <View style={[styles.silhouetteShort, { backgroundColor: bg.silhouette }]} />
              </>
            )}
          </View>
          <View pointerEvents="none" style={[styles.groundFill, { backgroundColor: bg.silhouette }]} />
        </>
      )}

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: bg.vignette }]} />
    </ViewShot>
  );
}

export function Glow({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="g" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={1} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#g)" />
    </Svg>
  );
}

/** One tab in the Together/You/Partner switcher — deliberately plain
 * text-in-a-pill rather than reusing GlassCard/Chip: this needs a disabled
 * state (a solo pane can be missing if only one of the two calls in a
 * couple session's 3-image job actually produced a usable result) that
 * those primitives don't expose. */
export function PaneThumb({
  label,
  imageUri,
  active,
  disabled,
  onPress,
}: {
  label: string;
  imageUri: string | undefined;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={disabled && styles.actionItemDisabled}>
      <View
        style={[
          styles.paneThumbFrame,
          { borderColor: active ? theme.accent1 : 'rgba(255,255,255,0.25)' },
        ]}>
        {imageUri ? (
          <ExpoImage source={{ uri: imageUri }} style={styles.paneThumbImage} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.paneThumbImage, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
        )}
        {active ? (
          <View style={[styles.paneThumbCheck, { backgroundColor: theme.accent1 }]}>
            <Icon name="check" size={11} color="#131313" strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.paneTabText, { color: active ? theme.resultInkSoft : theme.resultInkFaint }]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  icon,
  label,
  premium,
  disabled,
  onPress,
}: {
  icon: 'share' | 'download' | 'noWatermark' | 'trash' | 'shuffle';
  label: string;
  premium?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable style={[styles.actionItem, disabled && styles.actionItemDisabled]} onPress={onPress} disabled={disabled}>
      <View>
        <GlassCard strong radius={16} style={styles.actionIcon}>
          <Icon name={icon} size={18} color={icon === 'noWatermark' ? theme.accent2 : theme.ink} strokeWidth={2} />
        </GlassCard>
        {premium ? (
          <LinearGradient colors={[theme.accent2, theme.accent1]} style={styles.premiumBadge}>
            <Icon name="crown" size={9} color={theme.ink} strokeWidth={2.2} />
          </LinearGradient>
        ) : null}
      </View>
      <Text style={[styles.actionLabel, { color: theme.resultInkFaint }]}>{label}</Text>
    </Pressable>
  );
}
