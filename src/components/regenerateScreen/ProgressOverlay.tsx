import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 140;
const RING_RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Same "loop, don't run once" reasoning as loading.tsx's own ring: a real
// regenerate call's actual duration varies (a few seconds to tens of
// seconds), so a fixed-duration bar would either finish early and sit at
// 100% looking stuck, or never reach 100% at all. Looping reads as "still
// working" for as long as it needs to, which is the actual thing this
// screen exists to communicate — see this component's own doc comment.
const LAP_DURATION = 2200;

/**
 * Full-screen progress overlay for regenerate/[id].tsx's "Regenerate
 * Wallpaper" action — added 2026-09-14, real reported bug: the button only
 * ever swapped its own label to "Regenerating Wallpaper…" while the rest of
 * the screen stayed fully interactive and visually static, which read as
 * "did my tap even register?" and led users to back out mid-request (losing
 * the spent credit with nothing to show for it, and confusing the SEPARATE
 * "why didn't my edit apply" bug report that turned out to just be this).
 *
 * Deliberately the SAME visual language as loading.tsx's own ring (percent
 * badge, cycling step captions) rather than a plain spinner — this app
 * already taught the user what "ring + percent + rotating caption" means
 * for the original generate flow; reusing it here means no new UI pattern
 * to learn for what's conceptually the same wait. Not extracted into a
 * shared component with loading.tsx itself because that screen's ring is
 * entangled with SOLO/GROUP/COUPLE icon-swapping this one has no use for —
 * duplicating ~40 lines of ring markup is cheaper than threading unrelated
 * props through a shared component for a one-off caller each.
 *
 * The percentage/step progression is decorative, not real backend telemetry
 * — POST /generations/:id/regenerate is one synchronous call with no
 * intermediate progress events to report (same honest limitation
 * loading.tsx's own doc comment already notes for the original pipeline).
 * What it needs to convey is "this is still working," not a literal
 * percent-complete, and a looping ring does that regardless of how long the
 * real call actually takes.
 */
export function RegenerateProgressOverlay({ paneLabel }: { paneLabel: string }) {
  const theme = useAppTheme();
  const progressVal = useSharedValue(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  // Mentions the specific pane being redone ("Together"/"You"/"Partner")
  // rather than a generic "your photo" — confirms to the user THIS is the
  // part being worked on, not a re-roll of the whole session.
  const steps = [
    'Reviewing your edits...',
    `Reworking the ${paneLabel} shot...`,
    'Refining facial details...',
    'Applying finishing touches...',
    'Almost there...',
  ];

  useEffect(() => {
    progressVal.value = withRepeat(
      withTiming(1, { duration: LAP_DURATION, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      -1,
      false,
    );

    const interval = setInterval(() => {
      const val = progressVal.value;
      setDisplayPercent(Math.min(100, Math.round(val * 100)));
      setStepIndex(Math.min(steps.length - 1, Math.floor(val * steps.length)));
    }, 40);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressVal]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progressVal.value),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Opaque-ish scrim, not just a dim — this needs to unmistakably block
       * the form underneath (chips, text input, the submit button itself)
       * so there's no tappable "did that register?" left to second-guess
       * while a request is genuinely in flight. */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={styles.center} pointerEvents="auto">
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="regenRingGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={theme.accent1} />
                <Stop offset="1" stopColor={theme.accent2} />
              </SvgLinearGradient>
            </Defs>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={7}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="url(#regenRingGrad)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              animatedProps={animatedCircleProps}
              fill="none"
              rotation={-90}
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
            />
          </Svg>
          <GlassCard radius={48} style={styles.ringCenter}>
            <Icon name="sparkle" size={28} color={theme.accent1} strokeWidth={1.8} />
          </GlassCard>
          <View style={styles.badgeWrap}>
            <LinearGradient colors={[theme.accent1, theme.accent2]} style={styles.badge}>
              <Text style={[styles.badgeText, { color: theme.ink }]}>{displayPercent}%</Text>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.textBlock}>
          <Text style={[styles.headline, { color: theme.ink }]}>Regenerating your wallpaper…</Text>
          <Text style={[styles.subtext, { color: theme.accent2 }]}>{steps[stepIndex]}</Text>
        </View>

        <GlassCard radius={16} style={styles.tipCard}>
          <Icon name="tip" size={15} color={theme.accent2} strokeWidth={2} />
          <Text style={[styles.tipText, { color: theme.inkSoft }]}>
            This usually takes 10–30 seconds. Please stay on this screen — leaving now still spends the
            credit but loses this result.
          </Text>
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(10, 4, 8, 0.92)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  ringWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  badgeWrap: { position: 'absolute', bottom: -4, right: -2 },
  badge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5 },
  textBlock: { alignItems: 'center', gap: 8 },
  headline: { fontFamily: fonts.display, fontSize: 21, textAlign: 'center' },
  subtext: { fontFamily: fonts.bodySemiBold, fontSize: 14, height: 20 },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 300 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
});
