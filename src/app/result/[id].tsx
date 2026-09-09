import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { showAlert } from '@/alerts/store';
import { ScreenBlurTargetContext } from '@/components/primitives/blur-target';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { fonts, resultBackgrounds } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { saveImageToGallery, setDeviceWallpaper, shareImage } from '@/utils/native-media';

/** Which of the panel's async actions (if any) is currently in flight —
 * drives both the disabled/dimmed state and the button copy below. */
type BusyAction = 'save' | 'share' | 'wallpaper' | null;

function Glow({ size, color }: { size: number; color: string }) {
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

export default function ResultScreen() {
  const theme = useAppTheme();
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const isSolo = mode === 'solo';
  const bg = isSolo ? resultBackgrounds.solo : resultBackgrounds.couple;
  const localTarget = useRef<View | null>(null);
  const wallpaperShotRef = useRef<ViewShotRef>(null);

  const creations = useGalleryStore((state) => state.creations);
  const item = creations.find((c) => c.id === id);
  const aiImageUri = item?.togetherImage ? resolveCreationImage(item.togetherImage) : null;

  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function captureWallpaper(): Promise<string> {
    const uri = await wallpaperShotRef.current?.capture();
    if (!uri) throw new Error('Could not capture the wallpaper image.');
    return uri;
  }

  async function handleDownload() {
    if (busyAction) return; // one in-flight action at a time — no overlapping captures
    setBusyAction('save');
    try {
      const uri = await captureWallpaper();
      const saved = await saveImageToGallery(uri);
      if (saved) showAlert('Saved ✨', 'Wallpaper has been saved to your gallery.');
    } catch (err) {
      showAlert('Save Failed', err instanceof Error ? err.message : 'Something went wrong while saving.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShare() {
    if (busyAction) return;
    setBusyAction('share');
    try {
      const uri = await captureWallpaper();
      await shareImage(uri);
    } catch (err) {
      showAlert('Share Failed', err instanceof Error ? err.message : 'Something went wrong while sharing.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetWallpaper() {
    if (busyAction) return;
    setBusyAction('wallpaper');
    try {
      const uri = await captureWallpaper();
      await setDeviceWallpaper(uri, 'both');
      showAlert('Wallpaper Set 📱', 'Your home and lock screen have been updated.');
    } catch (err) {
      showAlert('Couldn’t Set Wallpaper', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ScreenBlurTargetContext.Provider value={localTarget}>
      <BlurTargetView style={styles.fill} ref={localTarget}>
        <ViewShot ref={wallpaperShotRef} style={StyleSheet.absoluteFill} options={{ format: 'png', quality: 1 }}>
          <LinearGradient colors={bg.gradient} locations={bg.locations} style={StyleSheet.absoluteFill} />

          {aiImageUri ? (
            <ExpoImage
              source={{ uri: aiImageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <>
              {isSolo ? (
                <>
                  <View pointerEvents="none" style={[styles.glowSpot, { top: 90, left: -40 }]}>
                    <Glow size={230} color={resultBackgrounds.solo.glowA} />
                  </View>
                  <View pointerEvents="none" style={[styles.glowSpot, { top: 160, right: -60 }]}>
                    <Glow size={200} color={resultBackgrounds.solo.glowB} />
                  </View>
                </>
              ) : (
                <View pointerEvents="none" style={[styles.glowSpot, { top: 120, left: '50%', marginLeft: -110 }]}>
                  <Glow size={220} color={resultBackgrounds.couple.sunGlow} />
                </View>
              )}

              <LinearGradient pointerEvents="none" colors={[bg.horizonHaze, 'transparent']} style={styles.horizonHaze} />

              <View pointerEvents="none" style={styles.silhouetteRow}>
                {isSolo ? (
                  <View style={[styles.silhouetteSolo, { backgroundColor: bg.silhouette }]} />
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

        <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <IconButton name="chevronLeft" onPress={() => router.back()} strong />
            <Text style={[styles.topTitle, { color: theme.ink }]}>Your Wallpaper</Text>
            <IconButton name="download" onPress={handleDownload} disabled={!!busyAction} strong />
          </View>

          {isSolo ? (
            <GlassCard radius={999} strong style={styles.tagPill}>
              <Icon name="styleNeon" size={13} color={theme.accent2} strokeWidth={1.8} />
              <Text style={[styles.tagText, { color: theme.resultInkSoft }]}>Neon Style</Text>
            </GlassCard>
          ) : (
            // Was "Proximity Sync · Active" — that phrase now collides head-on
            // with the real Couple tab's live-location feature (src/couple/)
            // even though this is just a static two-person fusion result with
            // no proximity tracking involved. Renamed so the two don't read as
            // the same feature.
            <GlassCard radius={999} strong style={styles.tagPill}>
              <Icon name="couple" size={13} color={theme.accent2} strokeWidth={1.8} />
              <Text style={[styles.tagText, { color: theme.resultInkSoft }]}>Couple Mode</Text>
            </GlassCard>
          )}

          <View style={styles.spacer} />

          <GlassCard radius={26} strong style={styles.actionPanel}>
            <GradientButton
              label={busyAction === 'wallpaper' ? 'Setting…' : 'Set as Wallpaper'}
              icon="wallpaper"
              onPress={handleSetWallpaper}
              disabled={!!busyAction}
            />
            <View style={styles.actionRow}>
              <ActionButton icon="share" label={busyAction === 'share' ? 'Sharing…' : 'Share'} onPress={handleShare} disabled={!!busyAction} />
              <ActionButton icon="download" label={busyAction === 'save' ? 'Saving…' : 'Save'} onPress={handleDownload} disabled={!!busyAction} />
              <ActionButton
                icon="noWatermark"
                label="8K HD"
                premium
                onPress={() => showAlert('Amora Pro 💎', '8K HD export is coming soon.')}
              />
            </View>
          </GlassCard>
        </SafeAreaView>
      </BlurTargetView>
    </ScreenBlurTargetContext.Provider>
  );
}

function ActionButton({
  icon,
  label,
  premium,
  disabled,
  onPress,
}: {
  icon: 'share' | 'download' | 'noWatermark';
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glowSpot: { position: "absolute" },
  horizonHaze: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 340,
    height: 180,
  },
  silhouetteRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 190,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  silhouetteTall: {
    width: 76,
    height: 230,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
  },
  silhouetteShort: {
    width: 66,
    height: 200,
    borderTopLeftRadius: 33,
    borderTopRightRadius: 33,
    marginLeft: 2,
  },
  silhouetteSolo: {
    width: 100,
    height: 246,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  groundFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topTitle: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.3 },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "center",
    marginTop: 12,
  },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  spacer: { flex: 1 },
  // marginBottom: real-device bottom-edge touch-interception fix — see
  // src/components/navigation/floating-tab-bar.tsx for the full story.
  actionPanel: { marginHorizontal: 16, marginBottom: 56, padding: 18, gap: 14 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionItem: { alignItems: "center", gap: 6 },
  actionItemDisabled: { opacity: 0.5 },
  actionIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumBadge: {
    position: "absolute",
    top: -5,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
