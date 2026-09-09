import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon, type IconName } from '@/components/primitives/icon';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export type StyleOption = {
  /** Sent to the server as-is (stylePreference) — never translated, never
   *  shown to the user directly. `labelKey` (below) is what's displayed. */
  key: string;
  /** i18n key under `style.*` — looked up with `t()` at render time inside
   *  `StyleSwatch`, since this array lives at module scope where a
   *  `useTranslation()` hook call isn't available. */
  labelKey: string;
  icon: IconName;
  imageUrl: string;
  colors: readonly [string, string];
};

export const STYLE_OPTIONS: StyleOption[] = [
  {
    key: 'realistic',
    labelKey: 'style.realistic',
    icon: 'styleRealistic',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop',
    colors: ['#c19985', '#6e5344'],
  },
  {
    key: 'neon',
    labelKey: 'style.neon',
    icon: 'styleNeon',
    imageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=400&auto=format&fit=crop',
    colors: ['#d64fc4', '#2c8fbd'],
  },
  {
    key: 'anime',
    labelKey: 'style.anime',
    icon: 'styleAnime',
    imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=400&auto=format&fit=crop',
    colors: ['#dba3d6', '#7a5ba8'],
  },
  {
    key: 'cyberpunk',
    labelKey: 'style.cyberpunk',
    icon: 'styleCyberpunk',
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=400&auto=format&fit=crop',
    colors: ['#4b3a86', '#8a4ad2'],
  },
  {
    key: 'vintage',
    labelKey: 'style.vintage',
    icon: 'styleVintage',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=400&auto=format&fit=crop',
    colors: ['#b0895a', '#6b4a30'],
  },
  {
    key: 'oil',
    labelKey: 'style.oil',
    icon: 'styleWatercolor',
    // Original photo id (photo-1579783902614-a3fb3927b675) 404s — removed
    // from Unsplash. Replacement verified to actually resolve first.
    imageUrl: 'https://images.unsplash.com/photo-1544262701-9fad0452a10a?q=80&w=400&auto=format&fit=crop',
    colors: ['#e29468', '#8a4d2e'],
  },
  {
    key: '3d',
    labelKey: 'style.3d',
    icon: 'style3d',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop',
    colors: ['#8a87a8', '#494766'],
  },
  {
    key: 'watercolor',
    labelKey: 'style.watercolor',
    icon: 'styleWatercolor',
    imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=400&auto=format&fit=crop',
    colors: ['#9ecdd0', '#5d9a97'],
  },
  {
    key: 'fantasy',
    labelKey: 'style.fantasy',
    icon: 'sparkle',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=400&auto=format&fit=crop',
    colors: ['#7c54d1', '#3b2575'],
  },
  {
    key: 'cartoon',
    labelKey: 'style.cartoon',
    icon: 'styleCartoon',
    // Original photo id (photo-1569172122301-bc5008bc09c5) 404s — removed
    // from Unsplash. Replacement verified to actually resolve first.
    imageUrl: 'https://images.unsplash.com/photo-1751644332113-2004a1b143f1?q=80&w=400&auto=format&fit=crop',
    colors: ['#f0c95c', '#dd7a2e'],
  },
];

type StyleSwatchProps = {
  option: StyleOption;
  active?: boolean;
  onPress?: () => void;
};

export function StyleSwatch({ option, active, onPress }: StyleSwatchProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <View
        style={[
          styles.swatch,
          {
            borderColor: active ? (theme.accent1 || '#FF9E44') : theme.glassBorder,
            borderWidth: active ? 2.5 : 1.2,
            shadowColor: active ? (theme.accent1 || '#FF9E44') : '#000',
            shadowOffset: { width: 0, height: active ? 4 : 2 },
            shadowOpacity: active ? 0.55 : 0.2,
            shadowRadius: active ? 8 : 4,
            elevation: active ? 6 : 2,
          },
        ]}>
        <Image source={{ uri: option.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        {/* Subtle dark gradient bottom overlay for contrast */}
        <LinearGradient colors={['transparent', 'rgba(10, 5, 15, 0.6)']} style={StyleSheet.absoluteFill} />

        {active ? (
          <View style={[styles.activeBadge, { backgroundColor: theme.accent1 || '#FF9E44' }]}>
            <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: active ? theme.ink : theme.inkSoft,
            fontFamily: active ? fonts.bodyBold : fonts.bodyMedium,
          },
        ]}>
        {t(option.labelKey)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  swatch: {
    width: 68,
    height: 68,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  activeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  label: { fontSize: 12.5, maxWidth: 72, textAlign: 'center' },
});

