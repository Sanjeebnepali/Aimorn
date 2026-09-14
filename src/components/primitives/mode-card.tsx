import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/primitives/icon';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ModeCardProps = {
  icon: IconName;
  label: string;
  description: string;
  colors: readonly [string, string];
  onPress: () => void;
};

/**
 * Big icon-forward pressable card used by the Generate landing screen's
 * Couple/Single/General chooser (src/app/(tabs)/generate/index.tsx). Unlike
 * TemplateCard (a real-photo preview of an actual wallpaper), these three
 * choices have no photo to show — each is a fork in the road, not a preview
 * of the eventual output — so this is gradient + icon + a line of copy
 * instead of a photo card.
 */
export function ModeCard({ icon, label, description, colors, onPress }: ModeCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable onPress={onPress} style={styles.pressable}>
      <View style={[styles.card, { borderColor: theme.glassBorder }]}>
        <LinearGradient colors={colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.iconWrap}>
          <Icon name={icon} size={24} color={theme.ink} strokeWidth={1.8} />
        </View>
        <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
        <Text style={[styles.description, { color: theme.inkSoft }]} numberOfLines={2}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    minHeight: 150,
    justifyContent: 'flex-end',
    gap: 4,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: { fontFamily: fonts.bodyBold, fontSize: 15 },
  description: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 15 },
});
