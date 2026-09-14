import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { useAppTheme } from '@/theme/use-app-theme';
import type { GenerationResponse } from '@/utils/api';
import { couplePacks } from '../../couple/packs';
import { styles } from './styles';

const CUSTOM_ACCENT = '#fab3ca'; // matches packs.ts's resolveActivePack's "Your Fusion" accent

type CouplePackPickerProps = {
  packId: string | null;
  picking: boolean;
  onPickPack: (newPackId: string) => void;
  /** The caller's own COMPLETE, COUPLE-mode generations — already filtered
   * by the caller (dashboard.tsx), most recent first. */
  yourCreations: GenerationResponse[];
  onPickGeneration: (generationId: string) => void;
};

/** Re-themed 2026-09-08 onto `GlassCard`/`useAppTheme()` — see
 * `couple/setup.tsx`'s doc comment for the full re-theme story. Each pack
 * tile keeps its own pack-specific accent color (not a theme token) — that's
 * a real per-pack feature (Golden Hour vs. Ocean Blue, etc.), not leftover
 * styling, so it stays exactly as it was.
 *
 * Gained a "Your Creations" section 2026-09-11: this picker used to render
 * ONLY the 3 bundled `couplePacks` below, with no tile at all for a real
 * AI-generated couple photo — confirmed live as the actual cause of "I
 * generated a couple photo but the dashboard still only shows the old
 * images," since `packId` can be set to a real Generation id (via
 * result/[id].tsx's "Use as Our Couple Pack") that matches none of the 3
 * hardcoded pack ids, leaving every bundled tile looking equally
 * unselected with no way to tell a custom pack was even active. */
export function CouplePackPicker({ packId, picking, onPickPack, yourCreations, onPickGeneration }: CouplePackPickerProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    <GlassCard style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.packPicker.title')}</Text>
      <Text style={[styles.cardSubtle, { color: theme.inkFaint }]}>{t('couple.packPicker.subtitle')}</Text>

      {yourCreations.length > 0 ? (
        <>
          <Text style={[styles.packSectionLabel, { color: theme.inkFaint }]}>
            {t('couple.packPicker.yourCreations')}
          </Text>
          <View style={styles.packGrid}>
            {yourCreations.map((g) => {
              const selected = g.id === packId;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => !picking && onPickGeneration(g.id)}
                  style={[
                    styles.packTile,
                    { borderColor: theme.glassBorder, backgroundColor: theme.glass },
                    selected && { borderColor: CUSTOM_ACCENT, borderWidth: 2 },
                  ]}
                >
                  <View style={styles.packTileTriptych}>
                    <Image source={{ uri: g.outputUrlA ?? undefined }} style={styles.packTileSolo} contentFit="cover" />
                    <Image
                      source={{ uri: g.outputUrl ?? undefined }}
                      style={[styles.packTileTogether, { borderColor: theme.glassBorder }]}
                      contentFit="cover"
                    />
                    <Image source={{ uri: g.outputUrlB ?? undefined }} style={styles.packTileSolo} contentFit="cover" />
                  </View>
                  <View style={styles.packTileMeta}>
                    <Text style={[styles.packTileName, { color: theme.ink }]} numberOfLines={1}>
                      {t('couple.packPicker.yourFusion')}
                    </Text>
                    <Text style={[styles.packTileBlurb, { color: theme.inkFaint }]} numberOfLines={1}>
                      {new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  {selected ? (
                    <View style={[styles.selectedDot, { backgroundColor: CUSTOM_ACCENT }]}>
                      <Icon name="check" size={12} color="#131313" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={[styles.packSectionLabel, { color: theme.inkFaint }]}>{t('couple.packPicker.starterPacks')}</Text>
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
