import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

/** The small pill used for category/style filters (Sunset, Rain, All, Favorites...). */
export function Chip({ label, active, onPress }: ChipProps) {
  const theme = useAppTheme();

  if (active) {
    return (
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={[theme.accent1, theme.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chip}>
          <Text style={[styles.label, styles.labelActive, { color: theme.ink }]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress}>
      <View style={[styles.chip, { backgroundColor: theme.glass, borderWidth: 1, borderColor: theme.glassBorder }]}>
        <Text style={[styles.label, { color: theme.inkSoft }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: radii.pill },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  labelActive: { fontFamily: fonts.bodyBold },
});
