import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon, type IconName } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export type SegmentOption = { key: string; label: string; icon?: IconName };

type SegmentToggleProps = {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  fullWidth?: boolean;
};

/** The 2-way glass pill switch — Couple/Solo on Generate, Log In/Sign Up on Auth. */
export function SegmentToggle({ options, value, onChange, fullWidth }: SegmentToggleProps) {
  const theme = useAppTheme();

  return (
    <GlassCard radius={fullWidth ? radii.md : radii.pill} style={[styles.container, fullWidth && styles.fullWidth]}>
      {options.map((opt) => {
        const active = opt.key === value;
        const content = (
          <View style={[styles.segment, fullWidth && styles.segmentFullWidth]}>
            {opt.icon ? (
              <Icon name={opt.icon} size={13} color={active ? theme.ink : theme.inkFaint} strokeWidth={active ? 2 : 1.8} />
            ) : null}
            <Text
              style={[
                styles.label,
                { color: active ? theme.ink : theme.inkFaint, fontFamily: active ? fonts.bodyBold : fonts.bodySemiBold },
              ]}>
              {opt.label}
            </Text>
          </View>
        );

        return (
          <Pressable key={opt.key} onPress={() => onChange(opt.key)} style={fullWidth ? styles.flexItem : undefined}>
            {active ? (
              <LinearGradient
                colors={[theme.accent1, theme.accent2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.pill, fullWidth && styles.pillFullWidth]}>
                {content}
              </LinearGradient>
            ) : (
              <View style={[styles.pill, fullWidth && styles.pillFullWidth]}>{content}</View>
            )}
          </Pressable>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 4, gap: 4 },
  fullWidth: { width: '100%' },
  flexItem: { flex: 1 },
  pill: { borderRadius: radii.pill },
  pillFullWidth: { borderRadius: 12 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14 },
  segmentFullWidth: { justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 0 },
  label: { fontSize: 14 },
});
