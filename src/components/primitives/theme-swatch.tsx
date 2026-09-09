import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/primitives/icon';
import { fonts, resolveTheme, type ThemeName } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ThemeSwatchProps = {
  themeName: ThemeName;
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function ThemeSwatch({ themeName, label, active, onPress }: ThemeSwatchProps) {
  const appTheme = useAppTheme();
  const preview = resolveTheme(themeName);

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <View>
        <LinearGradient
          colors={[preview.bg1, preview.bg2, preview.bg3]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          locations={[0, 0.55, 1]}
          style={[
            styles.swatch,
            { borderColor: active ? appTheme.accent1 : appTheme.glassBorder, borderWidth: active ? 2.5 : 1.5 },
          ]}
        />
        {active ? (
          <LinearGradient
            colors={[appTheme.accent1, appTheme.accent2]}
            style={[styles.checkBadge, { borderColor: appTheme.bg2 }]}>
            <Icon name="check" size={9} color={appTheme.ink} strokeWidth={3.4} />
          </LinearGradient>
        ) : null}
      </View>
      <Text
        style={[
          styles.label,
          { color: active ? appTheme.ink : appTheme.inkFaint, fontFamily: active ? fonts.bodyBold : fonts.bodySemiBold },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 7, width: 64 },
  swatch: { width: 56, height: 56, borderRadius: 16 },
  checkBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11.5, textAlign: 'center' },
});
