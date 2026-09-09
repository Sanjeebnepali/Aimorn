import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { useAppTheme } from '@/theme/use-app-theme';
import { couplePacks } from '../../couple/packs';
import { styles } from './styles';

type CouplePackPickerProps = {
  packId: string | null;
  picking: boolean;
  onPickPack: (newPackId: string) => void;
};

/** Re-themed 2026-09-08 onto `GlassCard`/`useAppTheme()` — see
 * `couple/setup.tsx`'s doc comment for the full re-theme story. Each pack
 * tile keeps its own pack-specific accent color (not a theme token) — that's
 * a real per-pack feature (Golden Hour vs. Ocean Blue, etc.), not leftover
 * styling, so it stays exactly as it was. */
export function CouplePackPicker({ packId, picking, onPickPack }: CouplePackPickerProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    /* ─── Pack picker — full-width triptychs ─── */
    <GlassCard style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.packPicker.title')}</Text>
      <Text style={[styles.cardSubtle, { color: theme.inkFaint }]}>{t('couple.packPicker.subtitle')}</Text>
      <View style={styles.packGrid}>
        {couplePacks.map((p) => {
          const selected = p.id === packId;
          return (
            <Pressable
              key={p.id}
              onPress={() => !picking && onPickPack(p.id)}
              style={[
                styles.packTile,
                { borderColor: theme.glassBorder, backgroundColor: theme.glass },
                selected && { borderColor: p.accent, borderWidth: 2 },
              ]}
            >
              <View style={styles.packTileTriptych}>
                <Image source={p.roleAImage} style={styles.packTileSolo} contentFit="cover" />
                <Image
                  source={p.togetherImage}
                  style={[styles.packTileTogether, { borderColor: theme.glassBorder }]}
                  contentFit="cover"
                />
                <Image source={p.roleBImage} style={styles.packTileSolo} contentFit="cover" />
              </View>
              <View style={styles.packTileMeta}>
                <Text style={[styles.packTileName, { color: theme.ink }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.packTileBlurb, { color: theme.inkFaint }]} numberOfLines={1}>
                  {p.roleALabel} · {p.roleBLabel}
                </Text>
              </View>
              {selected ? (
                <View style={[styles.selectedDot, { backgroundColor: p.accent }]}>
                  <Icon name="check" size={12} color="#131313" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}
