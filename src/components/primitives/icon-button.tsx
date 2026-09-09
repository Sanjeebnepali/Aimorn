import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon, type IconName } from '@/components/primitives/icon';
import { useAppTheme } from '@/theme/use-app-theme';

type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  strong?: boolean;
  /** Blocks taps and dims the button — for in-flight async actions so a
   * second tap can't fire the action again mid-request. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The circular glass icon button used for back/share/settings/etc across every screen. */
export function IconButton({ name, onPress, size = 40, iconSize = 17, color, strong, disabled, style }: IconButtonProps) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={disabled && { opacity: 0.5 }}>
      <GlassCard
        strong={strong}
        radius={size / 2}
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Icon name={name} size={iconSize} color={color ?? theme.ink} />
      </GlassCard>
    </Pressable>
  );
}
