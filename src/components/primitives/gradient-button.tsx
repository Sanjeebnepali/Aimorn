import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type GradientButtonProps = {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  fullWidth?: boolean;
  /** Blocks taps and dims the button — for in-flight async actions (saving,
   * sharing, setting a wallpaper) so a second tap can't fire the action
   * again mid-request. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The accent1->accent2 gradient CTA pill used for every primary action (Generate, Set as Wallpaper, Log In...). */
export function GradientButton({ label, icon, onPress, fullWidth = true, disabled, style }: GradientButtonProps) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[fullWidth ? styles.fullWidth : styles.hugContent, disabled && styles.disabled]}>
      {/* LinearGradient (a native view, like BlurView) is a sibling inside a
       * real, explicitly-padded plain View here rather than the Pressable's
       * direct child — matches every other gradient-backed touchable in the
       * app (GlassCard, TemplateCard) so this button's hit box is sized the
       * same reliable way theirs is, from real View padding rather than a
       * native child's own layout. (A real, separate bug WAS traced to this
       * button's onPress not firing on real devices — see
       * src/components/navigation/floating-tab-bar.tsx for what that
       * actually was: a bottom-edge system touch zone, not this. Fixed
       * where each affected screen places its own CTA, not here.) */}
      <View style={[styles.button, style]}>
        <LinearGradient
          colors={[theme.accent1, theme.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {icon ? <Icon name={icon} size={18} color={theme.ink} /> : null}
        <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  // Without this, a non-fullWidth button gets stretched to the parent's width
  // anyway — RN containers default to alignItems:'stretch' on their children.
  hugContent: { alignSelf: 'flex-start' },
  disabled: { opacity: 0.5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  label: { fontFamily: fonts.bodyExtraBold, fontSize: 15.5 },
});
