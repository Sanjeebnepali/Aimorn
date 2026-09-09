import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Screen, type ScreenProps } from 'react-native-screens';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { TabSlot, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';

const FADE_MS = 180;

// `ScreenContainer` (what TabSlot renders into) requires its *direct*
// children to be `Screen` components — the native side throws "Attempt
// attach child that is not of type RNScreens" for anything else, including
// a plain wrapping View, and does so during native view mounting rather
// than JS render, so it doesn't surface as a normal caught error. Animating
// `Screen` itself (via Reanimated's animated-component wrapper) keeps it as
// the direct child while still letting its opacity animate.
const AnimatedScreen = Animated.createAnimatedComponent(Screen);

/**
 * expo-router/ui's default `TabSlot` swaps tabs with a hard `display:
 * none` <-> `flex` toggle — an instant cut, no transition at all. This
 * swaps that for a cross-fade: every tab screen is stacked full-bleed
 * (position: absolute) and animates its own opacity in/out based on
 * focus, so the incoming tab fades in over the outgoing one instead of
 * popping.
 */
export function AnimatedTabSlot() {
  return <TabSlot renderFn={renderFadingTab} />;
}

function renderFadingTab(descriptor: TabsDescriptor, { isFocused, loaded, detachInactiveScreens }: TabsSlotRenderOptions) {
  const { lazy = true, unmountOnBlur, freezeOnBlur } = descriptor.options;
  if (unmountOnBlur && !isFocused) return null;
  if (lazy && !loaded && !isFocused) return null;

  return (
    <FadingScreen
      key={descriptor.route.key}
      isFocused={isFocused}
      enabled={detachInactiveScreens}
      freezeOnBlur={freezeOnBlur}>
      {descriptor.render()}
    </FadingScreen>
  );
}

type FadingScreenProps = Pick<ScreenProps, 'enabled' | 'freezeOnBlur' | 'children'> & { isFocused: boolean };

function FadingScreen({ isFocused, enabled, freezeOnBlur, children }: FadingScreenProps) {
  const opacity = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(isFocused ? 1 : 0, { duration: FADE_MS });
  }, [isFocused, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Keep screen mounted (activityState: 2) while focused or while fading out
  // to prevent premature unmounting and black screen flashes!
  const activeState = isFocused ? 2 : 0;

  return (
    <AnimatedScreen
      enabled={enabled}
      activityState={activeState}
      freezeOnBlur={freezeOnBlur}
      style={[
        StyleSheet.absoluteFill,
        animatedStyle,
        {
          zIndex: isFocused ? 2 : 1,
          backgroundColor: 'transparent',
        },
      ]}
      pointerEvents={isFocused ? 'auto' : 'none'}>
      {children}
    </AnimatedScreen>
  );
}
