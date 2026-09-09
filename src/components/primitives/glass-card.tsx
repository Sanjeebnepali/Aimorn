import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { useAppTheme } from "@/theme/use-app-theme";
import { radii } from "@/theme/tokens";

// iOS 26+ gets true native Liquid Glass. Everywhere else (older iOS, all of
// Android, web) falls back to a blur + tinted-gradient combo, since
// expo-glass-effect renders a plain View with no blur at all off iOS 26.
const useLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

type GlassCardProps = ViewProps & {
  radius?: number;
  /** Use the stronger glass variant designed for panels over a busy photo (Result screens). */
  strong?: boolean;
  /**
   * No-op on Android now (kept so call sites don't need to change) — see the
   * comment above the Android branch below for why real Android blur is
   * gone entirely, not just skipped for bursty call sites.
   */
  disableBlur?: boolean;
};

export function GlassCard({
  style,
  radius = radii.xl,
  strong,
  disableBlur,
  children,
  ...rest
}: GlassCardProps) {
  const theme = useAppTheme();
  const borderColor = strong ? theme.resultGlassBorder : theme.glassBorder;
  const gradientColors = strong
    ? ([theme.resultGlassStrong, theme.resultGlass] as const)
    : ([theme.glassStrong, theme.glass] as const);

  const shape = {
    borderRadius: radius,
    borderWidth: 1,
    borderColor,
    overflow: "hidden" as const,
  };

  if (useLiquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" style={[shape, style]} {...rest}>
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[shape, style]} {...rest}>
      {/* iOS blurs for real by default, no target needed — never implicated
          in any crash report, left as-is.
          Android used to attempt real blur via `dimezisBlurViewSdk31Plus` +
          a `blurTarget` ref when a screen-local target was available. Pulled
          out entirely (2026-09-07) after it was confirmed — on real devices,
          via symbolicated native crash logs, not a guess — to cause a hard
          native RenderThread SIGSEGV (stack overflow inside libhwui's own
          `computeTransformImpl`, 500+ self-recursive frames) across multiple
          unrelated screens, not just the bursty-list case `disableBlur` was
          originally added for. expo-blur's own changelog already calls this
          method experimental; with three independent crashes traced to it
          and no way to bound every trigger condition without native
          profiling tools, removing the risk entirely beats patching call
          sites one crash at a time. The gradient-tint fallback below is the
          ENTIRE Android appearance now, same as it already was for the
          floating tab bar (see blur-target.tsx) — that one "looked correct
          with tint alone from the very start," so this isn't a visual
          regression, just consistency. `screenTarget`/`disableBlur` are
          still accepted so call sites don't need touching, but neither does
          anything on Android anymore. */}
      {Platform.OS === 'ios' && !disableBlur ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
