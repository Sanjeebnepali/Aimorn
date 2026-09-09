import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { useGalleryStore } from '@/data/gallery-store';
import { getFreeAIImageUrl } from '@/services/ai-generator';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 160;
const RING_RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TOTAL_DURATION = 2400;

const STEPS = [
  'Analyzing photo features...',
  'Styling facial contours...',
  'Blending color harmonies...',
  'Rendering 8K detail...',
  'Finalizing fusion...',
];

export default function LoadingScreen() {
  const theme = useAppTheme();
  const { mode, style, description, youImage, partnerImage } = useLocalSearchParams<{
    mode?: 'solo' | 'couple';
    style?: string;
    description?: string;
    youImage?: string;
    partnerImage?: string;
  }>();
  const isSolo = mode === 'solo';

  const [aiImageUrl, setAiImageUrl] = useState<string>('');

  const progressVal = useSharedValue(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const generatedUrl = getFreeAIImageUrl({
      mode,
      style,
      description,
      youImage,
      partnerImage,
    });
    setAiImageUrl(generatedUrl);
    // Prefetch image into Expo Image cache so it displays instantly on Result screen
    ExpoImage.prefetch(generatedUrl).catch(() => {});
  }, [mode, style, description, youImage, partnerImage]);

  function updateState(val: number) {
    const pct = Math.min(100, Math.round(val * 100));
    setDisplayPercent(pct);
    const stepIdx = Math.min(STEPS.length - 1, Math.floor(val * STEPS.length));
    setCurrentStepIndex(stepIdx);
  }

  const navigateToResult = useCallback(() => {
    const newId = `gen_${Date.now()}`;
    const generatedUrl = aiImageUrl || getFreeAIImageUrl({ mode, style, description });
    useGalleryStore.getState().addCreation({
      id: newId,
      mode: (mode as 'solo' | 'couple') ?? 'couple',
      prompt: description ? `${style ? style + ': ' : ''}${description}` : 'AI Generated Wallpaper',
      togetherImage: generatedUrl,
      roleAImage: youImage || undefined,
      roleBImage: partnerImage || undefined,
      date: 'Just now',
    });
    router.replace({ pathname: '/result/[id]', params: { id: newId, mode: mode ?? 'couple' } });
  }, [aiImageUrl, description, mode, partnerImage, style, youImage]);

  useEffect(() => {
    progressVal.value = withTiming(
      1,
      {
        duration: TOTAL_DURATION,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          runOnJS(navigateToResult)();
        }
      }
    );

    const interval = setInterval(() => {
      updateState(progressVal.value);
    }, 40);

    return () => clearInterval(interval);
  }, [navigateToResult, progressVal]);

  const animatedCircleProps = useAnimatedProps(() => {
    const dashOffset = CIRCUMFERENCE * (1 - progressVal.value);
    return {
      strokeDashoffset: dashOffset,
    };
  });

  return (
    <GradientScreen dim>
      <SafeAreaView style={styles.fill}>
        <View style={styles.center}>
          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={theme.accent1} />
                  <Stop offset="1" stopColor={theme.accent2} />
                </SvgLinearGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={8}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="url(#ringGrad)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                animatedProps={animatedCircleProps}
                fill="none"
                rotation={-90}
                originX={RING_SIZE / 2}
                originY={RING_SIZE / 2}
              />
            </Svg>
            <GlassCard radius={56} style={styles.ringCenter}>
              <Icon name={isSolo ? 'sparkle' : 'heart'} size={isSolo ? 32 : 34} color={theme.accent1} strokeWidth={1.8} />
            </GlassCard>
            <View style={styles.progressBadgeWrap}>
              <LinearGradient colors={[theme.accent1, theme.accent2]} style={styles.progressBadge}>
                <Text style={[styles.progressText, { color: theme.ink }]}>{displayPercent}%</Text>
              </LinearGradient>
            </View>
          </View>

          <View style={styles.textBlock}>
            <Text style={[styles.headline, { color: theme.ink }]}>
              {isSolo ? 'Reimagining your photo…' : 'Blending two hearts\ninto one…'}
            </Text>
            <Text style={[styles.subtext, { color: theme.accent2 }]}>{STEPS[currentStepIndex]}</Text>
          </View>

          {isSolo ? (
            <View style={styles.transformRow}>
              <LinearGradient colors={[theme.accent1, theme.bg2]} style={styles.circleShape} />
              <Icon name="chevronRight" size={18} color={theme.accent2} strokeWidth={2} />
              <LinearGradient colors={[theme.accent2, theme.bg3]} style={styles.squareShape} />
            </View>
          ) : (
            <View style={styles.transformRow}>
              <LinearGradient colors={[theme.accent1, theme.bg2]} style={styles.circleShape} />
              <Icon name="heart" size={20} color={theme.accent2} />
              <LinearGradient colors={[theme.accent2, theme.bg3]} style={styles.circleShape} />
            </View>
          )}

          <GlassCard radius={16} style={styles.tipCard}>
            <Icon name="tip" size={15} color={theme.accent2} strokeWidth={2} />
            <Text style={[styles.tipText, { color: theme.inkSoft }]}>
              {isSolo
                ? 'Tip: Neon and Cyberpunk styles pop best against bold backgrounds'
                : 'Tip: even lighting on both photos gives the smoothest fusion'}
            </Text>
          </GlassCard>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 32 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  progressBadgeWrap: { position: 'absolute', bottom: -6, right: -2 },
  progressBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  progressText: { fontFamily: fonts.bodyExtraBold, fontSize: 13 },
  textBlock: { alignItems: 'center', gap: 8 },
  headline: { fontFamily: fonts.display, fontSize: 24, textAlign: 'center' },
  subtext: { fontFamily: fonts.bodySemiBold, fontSize: 14, height: 22 },
  transformRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circleShape: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  squareShape: { width: 50, height: 50, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 290 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 17 },
});
