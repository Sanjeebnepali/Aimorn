import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { TemplateCard } from '@/components/primitives/template-card';
import { couplePacks } from '@/couple/packs';
import { useCoupleStore } from '@/couple/store';
import { creationLabel, resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { getTemplate } from '@/data/templates';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const CARD_WIDTH = 168;
// `key` is what filtering logic compares against and stays a fixed English
// identifier (never shown to the user); `labelKey` is looked up with `t()`
// at render time — this array lives at module scope, where a
// `useTranslation()` hook call isn't available.
type FilterKey = 'all' | 'creations' | 'couplePacks' | 'favorites';
const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'gallery.filters.all' },
  { key: 'creations', labelKey: 'gallery.filters.creations' },
  { key: 'couplePacks', labelKey: 'gallery.filters.couplePacks' },
  { key: 'favorites', labelKey: 'gallery.filters.favorites' },
];

export type CombinedGalleryItem = {
  id: string;
  type: 'creation' | 'couplePack' | 'template';
  label: string;
  sublabel: string;
  height: number;
  favorited: boolean;
  imageUrl?: string;
  colors?: readonly [string, string];
  packId?: string;
};

export default function GalleryScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterKey>('all');

  const creations = useGalleryStore((s) => s.creations);
  const favorites = useGalleryStore((s) => s.favorites);
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite);
  const loadFromStorage = useGalleryStore((s) => s.loadFromStorage);

  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const partner = useCoupleStore((s) => s.partner);

  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  // Map user creations
  const creationItems: CombinedGalleryItem[] = creations.map((c) => ({
    id: c.id,
    type: 'creation',
    label: creationLabel(c),
    sublabel: c.date,
    height: c.height,
    favorited: !!favorites[c.id],
    // Was `typeof c.togetherImage === 'string' ? c.togetherImage : undefined`
    // — silently dropped the demo `require()` fallback image entirely
    // (number, not string), always falling back to the plain gradient tile
    // below instead. Same underlying bug as create-post's picker, same fix.
    imageUrl: resolveCreationImage(c.togetherImage),
    colors: ['#FFA438', '#FF4E72'],
  }));

  // Map couple packs from couple feature
  const coupleItems: CombinedGalleryItem[] = couplePacks.map((pack, idx) => ({
    id: `pack_${pack.id}`,
    type: 'couplePack',
    label: pack.name,
    sublabel: pack.blurb,
    height: idx % 2 === 0 ? 230 : 200,
    favorited: !!favorites[`pack_${pack.id}`],
    imageUrl: resolveCreationImage(pack.togetherImage),
    colors: [pack.accent, '#1a1024'],
    packId: pack.id,
  }));

  const allItems = [...creationItems, ...coupleItems];

  const filteredItems = allItems.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'creations') return item.type === 'creation';
    if (filter === 'couplePacks') return item.type === 'couplePack';
    if (filter === 'favorites') return item.favorited;
    return true;
  });

  const columnA = filteredItems.filter((_, i) => i % 2 === 0);
  const columnB = filteredItems.filter((_, i) => i % 2 === 1);

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.ink }]}>{t('gallery.title')}</Text>
              <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('gallery.subtitle')}</Text>
            </View>
            <IconButton name="filter" onPress={() => setFilter(filter === 'all' ? 'favorites' : 'all')} />
          </View>

          {/* Couple Pairing Banner at Top */}
          <Pressable onPress={() => router.push(hasPartner ? '/couple/dashboard' : '/couple/setup')}>
            <GlassCard radius={18} style={styles.pairBanner}>
              <View style={[styles.bannerIcon, { backgroundColor: theme.accent1 }]}>
                <Icon name="couple" size={20} color="#131313" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.bannerTitle, { color: theme.ink }]}>
                  {hasPartner
                    ? t('gallery.linkedWith', { name: partner?.displayName ?? t('gallery.defaultPartnerName') })
                    : t('gallery.pairCoupleTheme')}
                </Text>
                <Text style={[styles.bannerSub, { color: theme.inkFaint }]}>
                  {hasPartner ? t('gallery.proximitySyncActive') : t('gallery.getCoupleCode')}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={theme.inkFaint} />
            </GlassCard>
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={t(f.labelKey)} active={f.key === filter} onPress={() => setFilter(f.key)} />
            ))}
          </ScrollView>

          {filteredItems.length === 0 ? (
            <GlassCard radius={20} style={styles.emptyCard}>
              <Icon name="sparkle" size={32} color={theme.accent1} />
              <Text style={[styles.emptyTitle, { color: theme.ink }]}>
                {filter === 'creations' ? t('gallery.noCreationsYet') : t('gallery.noWallpapersFound')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.inkFaint }]}>
                {filter === 'creations' ? t('gallery.noCreationsBody') : t('gallery.noWallpapersBody')}
              </Text>
              <GradientButton label={t('gallery.generateWallpaper')} icon="sparkle" onPress={() => router.push('/generate')} />
            </GlassCard>
          ) : (
            <View style={styles.columns}>
              <View style={styles.column}>
                {columnA.map((c) => (
                  <TemplateCard
                    key={c.id}
                    width={CARD_WIDTH}
                    height={c.height}
                    label={c.label}
                    sublabel={c.sublabel}
                    colors={c.colors ?? ['#3a1c56', '#140c1e']}
                    imageUrl={c.imageUrl}
                    badge={c.favorited ? 'heartFilled' : 'heartOutline'}
                    onBadgePress={() => toggleFavorite(c.id)}
                    onPress={() => {
                      if (c.type === 'couplePack' && c.packId) {
                        router.push({ pathname: '/couple/preview', params: { packId: c.packId } });
                      } else {
                        router.push({ pathname: '/result/[id]', params: { id: c.id } });
                      }
                    }}
                  />
                ))}
              </View>
              <View style={styles.column}>
                {columnB.map((c) => (
                  <TemplateCard
                    key={c.id}
                    width={CARD_WIDTH}
                    height={c.height}
                    label={c.label}
                    sublabel={c.sublabel}
                    colors={c.colors ?? ['#3a1c56', '#140c1e']}
                    imageUrl={c.imageUrl}
                    badge={c.favorited ? 'heartFilled' : 'heartOutline'}
                    onBadgePress={() => toggleFavorite(c.id)}
                    onPress={() => {
                      if (c.type === 'couplePack' && c.packId) {
                        router.push({ pathname: '/couple/preview', params: { packId: c.packId } });
                      } else {
                        router.push({ pathname: '/result/[id]', params: { id: c.id } });
                      }
                    }}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 165, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: 26 },
  subtitle: { fontFamily: fonts.body, fontSize: 14 },
  pairBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginVertical: 2 },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontFamily: fonts.bodyBold, fontSize: 14 },
  bannerSub: { fontFamily: fonts.body, fontSize: 12.5 },
  chipsRow: { gap: 10, marginVertical: 2 },
  columns: { flexDirection: 'row', gap: 14, marginTop: 4 },
  column: { flex: 1, gap: 14 },
  emptyCard: { padding: 28, alignItems: 'center', gap: 12, marginVertical: 20 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 13.5, textAlign: 'center', marginBottom: 6 },
});
