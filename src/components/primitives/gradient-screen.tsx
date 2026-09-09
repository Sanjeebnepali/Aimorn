import { BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";

import { ScreenBlurTargetContext } from "@/components/primitives/blur-target";
import { useAppTheme } from "@/theme/use-app-theme";

type Glow = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  size: number;
  color: string;
};

/** A soft radial-gradient blob — RN has no CSS blur(), so this stands in for
 * the canvas's `filter: blur()` glow circles with an SVG radial fade instead. */
function GlowBlob({
  size,
  color,
  id,
}: {
  size: number;
  color: string;
  id: string;
}) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={1} />
          <Stop offset="60%" stopColor={color} stopOpacity={0.55} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

type GradientScreenProps = ViewProps & {
  /** Use the darker "dim" background variant (Loading screens). */
  dim?: boolean;
  glows?: Glow[];
};

/** Root wrapper for every screen: the 3-stop theme gradient + ambient glow blobs. */
export function GradientScreen({
  dim,
  glows,
  style,
  children,
  ...rest
}: GradientScreenProps) {
  const theme = useAppTheme();
  // Created once per screen instance (not per render) and handed to every
  // descendant GlassCard via context — see blur-target.tsx.
  const localTarget = useRef<View | null>(null);

  const colors = dim
    ? ([theme.dimBg1, theme.dimBg2, theme.dimBg3] as const)
    : ([theme.bg1, theme.bg2, theme.bg3] as const);
  const defaultGlows: Glow[] = glows ?? [
    {
      top: -60,
      right: -70,
      size: 260,
      color: dim ? theme.dimGlowPink : theme.glowPink,
    },
    {
      bottom: 120,
      left: -90,
      size: 220,
      color: dim ? theme.dimGlowGold : theme.glowGold,
    },
  ];

  // This screen's own root becomes the blur target every GlassCard inside it
  // uses — see blur-target.tsx. BlurTargetView is a plain View everywhere
  // except Android, where it also marks itself as the thing real
  // (non-tint-only) glass surfaces sample.
  return (
    <ScreenBlurTargetContext.Provider value={localTarget}>
      <BlurTargetView ref={localTarget} style={[styles.fill, style]} {...rest}>
        <LinearGradient
          colors={colors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          locations={[0, 0.48, 1]}
          style={StyleSheet.absoluteFill}
        />
        {defaultGlows.map((g, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: g.top,
              bottom: g.bottom,
              left: g.left,
              right: g.right,
            }}
          >
            <GlowBlob size={g.size} color={g.color} id={`glow-${i}`} />
          </View>
        ))}
        {children}
      </BlurTargetView>
    </ScreenBlurTargetContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
