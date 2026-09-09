import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Chip } from '@/components/primitives/chip';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { PhotoCarousel } from '@/components/primitives/photo-carousel';
import { TemplateCard } from '@/components/primitives/template-card';
import { getTemplates, TEMPLATES, POPULAR_IDS, TRENDING_IDS, type TemplateCategory } from '@/data/templates';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const TRENDING = getTemplates(TRENDING_IDS);
const POPULAR = getTemplates(POPULAR_IDS);
// Label shown on each chip, paired with the TemplateCategory it filters by —
// 'All' is the only one with no matching category (it just means "don't
// filter"). Kept as tuples (not a plain string[] matched by lowercasing,
// like the Template-browser screen does) only because 'All' has no
// TemplateCategory counterpart to lowercase into.
// `labelKey`/`titleKey`, not a literal string — these arrays live at module
// scope (outside any component), where a `useTranslation()` hook call isn't
// available, so the actual translated text is looked up with `t()` at the
// JSX render site inside HomeScreen below.
const CATEGORIES: { labelKey: string; value: TemplateCategory | 'all' }[] = [
  { labelKey: 'home.categories.all', value: 'all' },
  { labelKey: 'home.categories.sunset', value: 'sunset' },
  { labelKey: 'home.categories.rain', value: 'rain' },
  { labelKey: 'home.categories.beach', value: 'beach' },
  { labelKey: 'home.categories.studio', value: 'studio' },
  { labelKey: 'home.categories.festival', value: 'festival' },
];

// More rails so Home doesn't run dry after two sections — reusing the same
// template catalog in fresh groupings until real personalization (recently
// viewed, actually-for-you picks, etc.) replaces these. Swap the id lists
// for real data later; the rendering below doesn't need to change.
const EXTRA_SECTION_CONFIG: { titleKey: string; ids: string[] }[] = [
  { titleKey: 'home.sections.forCouples', ids: ['goldenHour', 'beachSunset', 'firstDance', 'rooftopNight'] },
  { titleKey: 'home.sections.soloVibes', ids: ['neonNights', 'cyberDate', 'cartoonUs'] },
  { titleKey: 'home.sections.newThisWeek', ids: ['winterWalk', 'rainyWindow', 'vintageParis'] },
  { titleKey: 'home.sections.editorsPicks', ids: ['cherryBlossom', 'cityLights', 'goldenHour'] },
];
const EXTRA_SECTIONS = EXTRA_SECTION_CONFIG.map((s) => ({ titleKey: s.titleKey, templates: getTemplates(s.ids) }));

// Stand-ins for the hero's photo strip until real user/couple photos exist —
// reuses the app's own template catalog so swapping in real ones later is just changing this array.
const HERO_TEMPLATE_IDS = ['cherryBlossom', 'vintageParis', 'rooftopNight', 'neonNights', 'winterWalk', 'goldenHour', 'cityLights'];
const HERO_TEMPLATES = getTemplates(HERO_TEMPLATE_IDS);
const HERO_PHOTO_HEIGHT = 290;

export default function HomeScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const filteredTemplates = category === 'all' ? null : TEMPLATES.filter((t) => t.category === category);

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* header */}
          <View style={styles.header}>
            <View style={styles.brand}>
              <Icon name="heart" size={26} color={theme.accent1} />
              <Text style={[styles.wordmark, { color: theme.ink }]}>Amora</Text>
            </View>
            <View style={styles.headerActions}>
              <IconButton name="plus" size={42} iconSize={20} color={theme.ink} onPress={() => router.push('/create-post')} />
              <IconButton name="crown" size={42} iconSize={18} color={theme.accent2} onPress={() => router.push('/(tabs)/profile')} />
            </View>
          </View>

          {/* hero */}
          <GlassCard radius={26} style={styles.heroCard}>
            <View style={styles.heroPhoto}>
              <PhotoCarousel
                items={HERO_TEMPLATES}
                height={HERO_PHOTO_HEIGHT}
                onSelectImage={(index, idOrUri) => {
                  const item = HERO_TEMPLATES[index] || HERO_TEMPLATES.find((t) => t.id === idOrUri);
                  if (item?.id) {
                    router.push({ pathname: '/template/[id]', params: { id: item.id } });
                  }
                }}
              />
            </View>
            <View style={styles.heroBody}>
              <Text style={[styles.heroTitle, { color: theme.ink }]}>{t('home.heroTitle')}</Text>
              <Text style={[styles.heroSubtitle, { color: theme.inkSoft }]}>{t('home.heroSubtitle')}</Text>
              <GradientButton
                label={t('home.tryNow')}
                icon="sparkle"
                fullWidth={false}
                onPress={() => router.push('/(tabs)/generate')}
              />
            </View>
          </GlassCard>

          {/* trending fusions */}
          <Section title={t('home.trendingFusions')} onSeeAll={() => router.push('/(tabs)/generate')} theme={theme}>
            <TemplateRail templates={TRENDING} />
          </Section>

          {/* category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {CATEGORIES.map((c) => (
              <Chip key={c.value} label={t(c.labelKey)} active={c.value === category} onPress={() => setCategory(c.value)} />
            ))}
          </ScrollView>

          {filteredTemplates ? (
            filteredTemplates.length ? (
              <View style={styles.filteredGrid}>
                {filteredTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    width={168}
                    height={196}
                    label={t.label}
                    colors={t.colors}
                    imageUrl={t.imageUrl}
                    badge={t.badge}
                    onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
                  />
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyFilterText, { color: theme.inkFaint }]}>{t('home.emptyCategory')}</Text>
            )
          ) : (
            <>
              {/* popular this week */}
              <Section title={t('home.popularThisWeek')} onSeeAll={() => router.push('/(tabs)/generate')} theme={theme}>
                <TemplateRail templates={POPULAR} />
              </Section>

              {/* more rails — keeps the feed going instead of dead-ending after two sections */}
              {EXTRA_SECTIONS.map((s) => (
                <Section key={s.titleKey} title={t(s.titleKey)} onSeeAll={() => router.push('/(tabs)/generate')} theme={theme}>
                  <TemplateRail templates={s.templates} />
                </Section>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

function Section({
  title,
  onSeeAll,
  theme,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  theme: ReturnType<typeof useAppTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.ink }]}>{title}</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Icon name="chevronRight" size={18} color={theme.inkSoft} strokeWidth={2} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function TemplateRail({ templates }: { templates: ReturnType<typeof getTemplates> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {templates.map((t) => (
        <TemplateCard
          key={t.id}
          label={t.label}
          colors={t.colors}
          imageUrl={t.imageUrl}
          badge={t.badge}
          onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 165, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { fontFamily: fonts.display, fontSize: 24 },
  // Photo bleeds edge-to-edge (clipped by GlassCard's own rounded corners,
  // no radius/margin of its own needed); the body below carries the padding.
  heroCard: { gap: 16, paddingBottom: 22 },
  heroPhoto: { height: HERO_PHOTO_HEIGHT },
  heroBody: { paddingHorizontal: 20, gap: 16 },
  heroTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 13.5, marginTop: -10 },
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18 },
  rail: { gap: 14, paddingBottom: 4 },
  chipsRow: { gap: 10, marginVertical: 4 },
  filteredGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  emptyFilterText: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 32 },
});
