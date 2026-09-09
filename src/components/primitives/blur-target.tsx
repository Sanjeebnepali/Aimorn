import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';

/**
 * expo-blur's real Android blur (`dimezisBlurView*`) needs a `blurTarget` ref
 * pointing at the ancestor view whose pixels should be sampled. A screen
 * creates one plain `useRef` for its own lifetime and hands it to
 * descendants via this context — no effect, no notification, nothing async.
 * React attaches a `ref` during the commit's mutation phase, which completes
 * for the *entire* new subtree before any `componentDidMount`/layout effect
 * anywhere in it fires — so by the time a nested `GlassCard`'s `BlurView`
 * mounts and reads this ref, it is already correct. Zero timing risk.
 *
 * Only components with a screen ancestor providing this get real blur. The
 * one thing that doesn't have one — the floating tab bar, which lives
 * outside every screen's own tree — deliberately skips blur entirely rather
 * than tracking a moving "whichever screen is active right now" target.
 * That was tried (a global, externally-mutated ref + a version counter the
 * tab bar's GlassCard remounted on via `key`) specifically to work around a
 * real gotcha: `BlurView`'s own `componentDidUpdate` decides whether to
 * refetch the target by comparing `prevProps.blurTarget?.current !==
 * this.props.blurTarget?.current` — but since a shared ref is the same
 * object every render, both sides of that comparison read `.current` off
 * the literal same object at comparison time, so it can never be unequal,
 * and `BlurView` never notices a change on its own. Forcing a remount
 * worked, but visibly flashed the unblurred fallback on every single tab
 * switch. The tab bar looked correct with tint alone before any of this —
 * see glass-card.tsx — so it just stays that way, flash-free.
 */
export const ScreenBlurTargetContext = createContext<RefObject<View | null> | null>(null);

/** The nearest screen's target ref, or null if not inside a ScreenBlurTargetContext.Provider. */
export function useScreenBlurTarget() {
  return useContext(ScreenBlurTargetContext);
}
