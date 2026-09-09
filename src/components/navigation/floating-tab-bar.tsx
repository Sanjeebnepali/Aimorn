import { forwardRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon, type IconName } from '@/components/primitives/icon';
import { fonts } from '@/theme/tokens';

// Filled icon for the active tab, outline (but bolder-stroked) for inactive —
// the same pattern Instagram/TikTok/etc. use so the active tab reads as solid
// and confident instead of a thin outline that just changed color. `labelKey`
// instead of a literal label — this array lives at module scope (outside the
// component), where a `useTranslation()` hook call isn't available, so the
// actual translated string is looked up at render time inside the component.
const TABS: { name: string; icon: IconName; filledIcon: IconName; labelKey: string }[] = [
  { name: 'home', icon: 'home', filledIcon: 'homeFilled', labelKey: 'tabs.home' },
  { name: 'generate', icon: 'sparkle', filledIcon: 'sparkle', labelKey: 'tabs.generate' },
  { name: 'gallery', icon: 'gallery', filledIcon: 'galleryFilled', labelKey: 'tabs.gallery' },
  { name: 'profile', icon: 'person', filledIcon: 'personFilled', labelKey: 'tabs.profile' },
];// A clean hairline glass border for the floating chrome bar
const NAV_BORDER = 'rgba(255, 255, 255, 0.32)';

/** The floating glass pill nav bar — 4 equal tabs, active one gets a wide glowing gradient capsule pill highlight. */
export function FloatingTabBar() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // EXTRA_BOTTOM_CLEARANCE, not just the safe-area inset: the 2026-09-07
  // session found a real device-level touch-interception zone near the
  // bottom edge (that phone's `com.vivo.upslide` gesture-nav overlay) and
  // fixed it with a +70dp buffer — but that number was never minimized, and
  // on this device (now confirmed via `adb shell settings get secure
  // navigation_mode` → 0, i.e. plain 3-button nav, not the gesture mode the
  // overlay targets) +70 was way more than needed: it visually detached the
  // bar from the bottom edge far enough to overlap unrelated content above
  // it (e.g. Profile's Premium card), which is the "moved up, breaks the
  // UI" regression reported after that session. Re-tuned by real-device
  // `adb shell input tap` sweeps (2026-09-08): every tab reliably registers
  // down to within ~10px of the pill's true bottom edge; only that last
  // sliver (well below where a real fingertip lands — tabs are still 74dp
  // tall) ever missed. +20 keeps a safety margin above that sliver while
  // sitting far closer to the edge than +70 did. If gesture nav is ever
  // re-enabled on a test device, re-sweep this — the overlay above is
  // specific to that mode and this value hasn't been tested against it.
  const EXTRA_BOTTOM_CLEARANCE = 20;
  const bottomPosition = Math.max(insets.bottom + 14, 20) + EXTRA_BOTTOM_CLEARANCE;

  return (
    <View
      pointerEvents="box-none"
      // renderToHardwareTextureAndroid + a high elevation: unlike every other
      // CTA the same bottom-edge clearance fix (above) was applied to, this
      // bar's sibling (AnimatedTabSlot) renders through react-native-screens'
      // native Screen/ScreenContainer — a separate native surface, not a
      // plain RN View like a normal stack screen's content. Confirmed live
      // (2026-09-07) that clearance alone wasn't sufficient here specifically
      // (still landing taps on tab content underneath after moving the bar
      // up); forcing this onto its own compositing layer with elevation
      // clearly above ScreenContainer's is what actually fixed it on top of
      // the clearance fix — two distinct causes stacking on the one screen
      // that happens to hit both (bottom-edge AND inside a ScreenContainer).
      renderToHardwareTextureAndroid
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: bottomPosition,
        zIndex: 9999,
        // Outer drop shadow for depth matching reference image
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        // A very large elevation (tried 1000 first) is suspected of
        // over-expanding this box-none View's own hit-testable region on
        // Android well past its visual bounds — plausible explanation for
        // taps below the bar (chips, cards) going completely dead rather
        // than reaching either the bar or the content under it. 24 is
        // comfortably above ordinary card/button elevation in this app (see
        // GlassCard, which uses none) without being an extreme outlier.
        elevation: 24,
      }}>
      <GlassCard
        radius={42}
        style={{
          height: 74,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          paddingVertical: 5,
          borderWidth: 1.5,
          borderColor: NAV_BORDER,
          // Premium translucent dark glass tint. Raised from 0.78 → 0.92
          // (2026-09-08): Home's category-chip rail scrolls directly behind
          // this bar, and at 0.78 its labels showed through clearly enough
          // to visually collide with the tab labels themselves (worse once
          // inkFaint/inkSoft's contrast was raised — see tokens.ts — since
          // that made the chip text underneath brighter too). Still visibly
          // "glass" over brighter content, just no longer legible enough to
          // clash with what's printed on top of it.
          backgroundColor: 'rgba(24, 14, 32, 0.92)',
        }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} asChild>
            <TabBarItem icon={tab.icon} filledIcon={tab.filledIcon} label={t(tab.labelKey)} />
          </TabTrigger>
        ))}
      </GlassCard>
    </View>
  );
}

type TabBarItemProps = TabTriggerSlotProps & { icon: IconName; filledIcon: IconName; label: string };

const TabBarItem = forwardRef<View, TabBarItemProps>(function TabBarItem(
  { icon, filledIcon, label, isFocused, onPress, onLongPress, style: incomingStyle, ...rest },
  ref,
) {
  // Active gradient colors: warm glowing yellow-orange to coral pink (matching reference image)
  const activeGradient = ['#FFA438', '#FF4E72'] as const;
  const iconName = isFocused ? filledIcon : icon;
  const textColor = isFocused ? '#FFFFFF' : 'rgba(255, 242, 239, 0.65)';

  return (
    <Pressable
      ref={ref}
      onPress={onPress as PressableProps['onPress']}
      onLongPress={onLongPress as PressableProps['onLongPress']}
      {...rest}
      style={[{ flex: 1, height: '100%', outlineWidth: 0, paddingHorizontal: 2 }, incomingStyle as object]}>
      <View style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center' }}>
        {isFocused ? (
          // Active state: warm glowing gradient capsule background (fixed relative layout)
          <LinearGradient
            colors={activeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              width: '100%',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              shadowColor: '#FF6F3C',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              elevation: 6,
            }}>
            <Icon name={iconName} size={22} color={textColor} strokeWidth={2.6} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.bodyExtraBold,
                fontSize: 11,
                color: textColor,
                letterSpacing: 0.1,
              }}>
              {label}
            </Text>
          </LinearGradient>
        ) : (
          // Inactive state: 100% identical layout dimensions (no movement or position shift on click)
          <View
            style={{
              flex: 1,
              width: '100%',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}>
            <Icon name={iconName} size={22} color={textColor} strokeWidth={2.2} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.bodySemiBold,
                fontSize: 11,
                color: textColor,
                letterSpacing: 0.1,
              }}>
              {label}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});
