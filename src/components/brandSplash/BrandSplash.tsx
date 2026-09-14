import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import {
  BRAND_BG,
  DOT_COLORS,
  LEFT_BODY_PATH,
  LEFT_GLOSS_PATH,
  LEFT_HEAD,
  ORANGE_STOPS,
  PINK_STOPS,
  RIGHT_BODY_PATH,
  RIGHT_GLOSS_PATH,
  RIGHT_HEAD,
} from './paths';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Timing below mirrors splash.html's own keyframes (leftEnter/rightEnter
// 1.5s, connectGlow starting at 1.05s, the heart-container heartbeat
// starting at 2s) — see that file for the original CSS this was ported
// from. ENTER_MS/GLOW_DELAY_MS/etc. are named constants rather than magic
// numbers purely so the relationship between them (glow starts partway
// through the entrance, the hold happens after both finish) stays legible.
const ENTER_MS = 1500;
const GLOW_DELAY_MS = 1050;
const GLOW_MS = 1100;
const HOLD_MS = 700; // time to just sit still and be looked at before fading
const FADE_MS = 400;
const TOTAL_MS = ENTER_MS + HOLD_MS + FADE_MS;

/**
 * The animated first-launch brand intro — shown once per cold start, as a
 * full-screen overlay on top of <RootNavigator> (see _layout.tsx), between
 * the native OS splash (static, instant, unchanged) hiding and the real app
 * appearing. Recreates the user's own splash.html design: two heart-halves
 * fly in from opposite sides and merge, a soft glow blooms at the seam, the
 * whole mark gives one gentle heartbeat, three dots pulse below.
 *
 * Ported to react-native-svg + Reanimated rather than embedded as literal
 * HTML/CSS because there is no such thing as an HTML/CSS/DOM runtime in a
 * React Native app — a WebView could technically host the original file,
 * but that means shipping a whole browser engine and a slow first paint
 * just to show a logo, for an effect this is fully capable of reproducing
 * natively. Simplified from the original in one deliberate way: the
 * continuous per-half "breathe" drop-shadow glow (CSS `filter:
 * drop-shadow(...)` pulsing every 3s) is left out — cross-platform RN
 * shadow rendering (Android's elevation vs. iOS's shadow* props) can't
 * reproduce a colored, animated drop-shadow with the same fidelity, and it
 * was the least noticeable of the original's effects. Everything else
 * (entrance, center glow, heartbeat, loading dots) is kept.
 */
export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { width } = useWindowDimensions();
  const enter = useSharedValue(0);
  const glow = useSharedValue(0);
  const heartbeat = useSharedValue(1);
  const fade = useSharedValue(1);
  const dots = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    // Hides the native splash HERE, not from a separate effect keyed on
    // fontsLoaded up in _layout.tsx — see that file's own comment on this
    // for the real, live-confirmed bug this fixes: any gap between "native
    // splash told to hide" and "this component's timers actually start"
    // is dead time this intro's fixed-duration animation burns invisibly,
    // making the real, visible result shorter than intended (in the worst
    // observed case, the entire animation played out hidden behind the
    // still-showing native splash). Calling it in the same effect that
    // starts the animation timers means both begin at the same instant.
    void SplashScreen.hideAsync();

    enter.value = withTiming(1, { duration: ENTER_MS, easing: Easing.bezier(0.22, 0.8, 0.25, 1) });
    glow.value = withDelay(GLOW_DELAY_MS, withTiming(1, { duration: GLOW_MS, easing: Easing.out(Easing.quad) }));
    // One gentle "double-pump" heartbeat once everything has settled, then
    // repeats — matches the CSS's own long-pause-then-flutter rhythm rather
    // than a constant smooth pulse, which would read more like a spinner
    // than a heartbeat.
    heartbeat.value = withDelay(
      ENTER_MS + 300,
      withRepeat(
        withSequence(
          withTiming(1.025, { duration: 160 }),
          withTiming(0.995, { duration: 160 }),
          withTiming(1.015, { duration: 160 }),
          withTiming(1, { duration: 3520 }),
        ),
        -1,
        false,
      ),
    );
    dots.forEach((dot, i) => {
      dot.value = withDelay(
        i * 180,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
    });

    const fadeTimer = setTimeout(() => {
      fade.value = withTiming(0, { duration: FADE_MS });
    }, ENTER_MS + HOLD_MS);
    const finishTimer = setTimeout(onFinish, TOTAL_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
    // Intentionally run once — this is a fire-and-forget intro sequence,
    // not something that should restart if `onFinish` is a new function
    // identity on some re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leftProps = useAnimatedProps(() => ({
    transform: [
      { translateX: interpolate(enter.value, [0, 0.65, 1], [-90, 8, 0]) },
      { rotate: `${interpolate(enter.value, [0, 0.65, 1], [-7, 1, 0])}deg` },
      { scale: interpolate(enter.value, [0, 0.65, 1], [0.85, 1.02, 1]) },
    ],
    opacity: interpolate(enter.value, [0, 0.65, 1], [0, 1, 1]),
  }));
  const rightProps = useAnimatedProps(() => ({
    transform: [
      { translateX: interpolate(enter.value, [0, 0.65, 1], [90, -8, 0]) },
      { rotate: `${interpolate(enter.value, [0, 0.65, 1], [7, -1, 0])}deg` },
      { scale: interpolate(enter.value, [0, 0.65, 1], [0.85, 1.02, 1]) },
    ],
    opacity: interpolate(enter.value, [0, 0.65, 1], [0, 1, 1]),
  }));
  const glowProps = useAnimatedProps(() => ({
    opacity: interpolate(glow.value, [0, 0.6, 1], [0, 0.9, 0.45]),
    r: interpolate(glow.value, [0, 0.6, 1], [36, 106, 90]),
  }));
  const heartContainerProps = useAnimatedProps(() => ({
    transform: [{ scale: heartbeat.value }],
  }));

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Bug found live 2026-09-11: the Svg used to be sized width="100%"
  // height="100%", filling the ENTIRE screen — on a tall phone that
  // stretches its 1000x1000 viewBox (preserveAspectRatio's default "meet"
  // scales by the SMALLER of the two ratios, i.e. by width here) far enough
  // down the screen that the heart's bottom point landed right on top of
  // the loading dots below it, which were positioned independently via an
  // absolute `bottom: '32%'`. Two independent sizing systems (a
  // viewport-filling SVG vs. a percentage-of-screen absolute position) with
  // no relationship to each other were always going to collide on some
  // screen size. Fixed by giving the Svg one explicit, bounded size (a
  // fraction of screen width, not height) and letting normal flex layout
  // (a column with a real gap) place the dots below it, so the two can
  // never overlap regardless of device dimensions.
  const svgSize = Math.min(width * 0.62, 420);

  return (
    <Animated.View style={[styles.fill, fadeStyle]} pointerEvents="none">
      <Svg width={svgSize} height={svgSize} viewBox="0 0 1000 1000">
        <Defs>
          <LinearGradient id="pinkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            {PINK_STOPS.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
          <LinearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            {ORANGE_STOPS.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
          <RadialGradient id="centerGlow">
            <Stop offset="0%" stopColor="#ffb46c" stopOpacity={0.9} />
            <Stop offset="40%" stopColor="#ff7480" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#ff7480" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <AnimatedG animatedProps={heartContainerProps} origin="500, 550">
          <AnimatedCircle animatedProps={glowProps} cx={500} cy={452} fill="url(#centerGlow)" />

          <AnimatedG animatedProps={leftProps} origin={`${LEFT_HEAD.cx}, ${LEFT_HEAD.cy}`}>
            <Circle {...LEFT_HEAD} fill="url(#pinkGradient)" />
            <Path d={LEFT_BODY_PATH} fill="url(#pinkGradient)" />
            <Path d={LEFT_GLOSS_PATH} fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth={19} strokeLinecap="round" />
          </AnimatedG>

          <AnimatedG animatedProps={rightProps} origin={`${RIGHT_HEAD.cx}, ${RIGHT_HEAD.cy}`}>
            <Circle {...RIGHT_HEAD} fill="url(#orangeGradient)" />
            <Path d={RIGHT_BODY_PATH} fill="url(#orangeGradient)" />
            <Path d={RIGHT_GLOSS_PATH} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={19} strokeLinecap="round" />
          </AnimatedG>
        </AnimatedG>
      </Svg>

      <View style={styles.dots}>
        {DOT_COLORS.map((color, i) => (
          <Dot key={color} color={color} progress={dots[i]} />
        ))}
      </View>
    </Animated.View>
  );
}

function Dot({ color, progress }: { color: string; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.75, 1.25]) }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  dots: {
    flexDirection: 'row',
    gap: 14,
    // Real flex spacing from the Svg above it (its previous sibling in
    // this same centered column), not an independent absolute position —
    // see the svgSize comment above for the bug this replaces.
    marginTop: 40,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
