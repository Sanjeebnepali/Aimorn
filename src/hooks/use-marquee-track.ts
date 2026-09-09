import { useCallback } from 'react';
import { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

type UseMarqueeTrackParams = {
  /** Width of one item + its trailing gap — the repeating spacing unit */
  itemStep: number;
  /** Item width alone, needed to find where an item's *center* lands on screen */
  itemWidth: number;
  /** Width of one full un-repeated set of items, for seamless wraparound */
  singleSetWidth: number;
  /** Auto-scroll speed in pixels/second, away from the center-hold zone */
  speed: number;
  /** How long (ms) an item stays centered before drifting on */
  holdMs: number;
};

/**
 * Drives the continuous marquee track position with a "magnetic center" feel:
 * it cruises at full speed between items, eases down as the next one nears
 * screen center, then snaps exactly onto center and holds there for `holdMs`
 * before resuming — instead of sliding past at a constant speed. This is what
 * makes a centered photo actually read as "paused in front" rather than
 * blurring through.
 */
export function useMarqueeTrack({ itemStep, itemWidth, singleSetWidth, speed, holdMs }: UseMarqueeTrackParams) {
  const translateX = useSharedValue(0);
  const isPaused = useSharedValue(false);
  const isInteracting = useSharedValue(false);
  const containerWidth = useSharedValue(380);

  const touchStartX = useSharedValue(0);
  const touchStartTranslateX = useSharedValue(0);

  // ms remaining while an item sits centered; >0 means "holding, don't move"
  const holdRemaining = useSharedValue(0);
  // true for exactly one frame right after a hold ends, so that frame's step
  // ignores the center-seeking slowdown (otherwise distAhead==0 would look
  // like we've *just* arrived again and immediately re-snap into a new hold)
  const justResumed = useSharedValue(false);

  useFrameCallback((frameInfo) => {
    if (isPaused.value || isInteracting.value) return;
    const dt = frameInfo.timeSincePreviousFrame
      ? Math.min(frameInfo.timeSincePreviousFrame / 1000, 0.064)
      : 0.016;

    if (holdRemaining.value > 0) {
      holdRemaining.value -= dt * 1000;
      if (holdRemaining.value <= 0) justResumed.value = true;
      return;
    }

    const wrap = (v: number) => (v <= -singleSetWidth ? v + singleSetWidth : v);

    if (justResumed.value) {
      justResumed.value = false;
      translateX.value = wrap(translateX.value - speed * dt);
      return;
    }

    // Distance (in travel direction) until the nearest item's center lines up
    // with the viewport center — 0 right at alignment, wrapping back up to
    // itemStep just after passing one. Independent of *which* item it is,
    // since every item is exactly `itemStep` apart.
    const base = containerWidth.value / 2 - itemWidth / 2;
    const raw = translateX.value - base;
    const distAhead = ((raw % itemStep) + itemStep) % itemStep;

    const slowZone = itemStep * 0.35;
    const minSpeedFactor = 0.15;
    const speedFactor =
      distAhead < slowZone ? minSpeedFactor + (1 - minSpeedFactor) * (distAhead / slowZone) : 1;
    const step = speed * speedFactor * dt;

    if (distAhead > 0 && distAhead <= step) {
      // This frame would reach (or overshoot) center — land exactly on it instead.
      translateX.value = wrap(translateX.value - distAhead);
      holdRemaining.value = holdMs;
      return;
    }

    translateX.value = wrap(translateX.value - step);
  });

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0) containerWidth.value = w;
    },
    [containerWidth],
  );

  const handleTouchStart = (e: GestureResponderEvent) => {
    isInteracting.value = true;
    holdRemaining.value = 0;
    justResumed.value = false;
    touchStartX.value = e.nativeEvent.pageX;
    touchStartTranslateX.value = translateX.value;
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    const deltaX = e.nativeEvent.pageX - touchStartX.value;
    let next = touchStartTranslateX.value + deltaX;

    while (next <= -singleSetWidth) next += singleSetWidth;
    while (next > 0) next -= singleSetWidth;

    translateX.value = next;
  };

  const handleTouchEnd = () => {
    isInteracting.value = false;
  };

  return {
    translateX,
    isPaused,
    containerWidth,
    onLayout,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
