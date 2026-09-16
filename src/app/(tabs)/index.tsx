import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Chip } from '@/components/primitives/chip';
import { IconButton } from '@/components/primitives/icon-button';
import { PhotoCarousel } from '@/components/primitives/photo-carousel';
import { TemplateCard } from '@/components/primitives/template-card';
import { getTemplates, TEMPLATES, POPULAR_IDS, TRENDING_IDS, type TemplateCategory } from '@/data/templates';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi, type PostResponse } from '@/utils/api';
import { postSublabel } from '@/utils/post-sublabel';
import { BannerAdView } from '@/components/ads/banner-ad-view';
import { HomeBannerAd } from '@/components/ads/HomeBannerAd';
import { RecentPostSection } from '@/components/home/RecentPostSection';
import { Section, TemplateRail } from '@/components/home/HomeSection';
import { PaywallModal } from '@/components/paywall/paywall-modal';

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
  const api = useApi();
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const filteredTemplates = category === 'all' ? null : TEMPLATES.filter((t) => t.category === category);

  // Real community data — added 2026-09-11. "Trending Creations" is the
  // top 5 posts by regeneration count (GET /posts/trending — auto-updates
  // itself the instant a post crosses another one's recreate-rank, no
  // separate job needed, see that route's own doc comment). "Recent Post"
  // is the full public feed (GET /posts), paginated via a "Load more"
  // button rather than true infinite scroll — this whole screen is already
  // one big ScrollView, and nesting a separately-scrolling infinite list
  // inside it is exactly the kind of gesture-conflict RN's ScrollView
  // doesn't handle well.
  const [trendingPosts, setTrendingPosts] = useState<PostResponse[]>([]);
  const [feedPosts, setFeedPosts] = useState<PostResponse[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useFocusEffect(
    useCallback(() => {
      api.listTrendingPosts().then(setTrendingPosts).catch(() => {});
      api
        .listPosts()
        .then(({ posts, nextCursor }) => {
          setFeedPosts(posts);
          setFeedCursor(nextCursor);
        })
        .catch(() => {});
      // Re-checked every time Home regains focus (not just on mount) so the
      // bell's badge clears the moment the user comes back from actually
      // reading the feed (notifications/index.tsx marks everything viewed
      // on its own mount) — a stale badge that never updates would train
      // users to ignore it.
      api.getNotifications().then((res) => setUnreadNotifications(res.unreadCount)).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Exit confirmation — the user's own request, framed as an engagement
  // move (a stray back-tap doesn't lose the app entirely, and the copy
  // reminds them their stuff is saved rather than just blocking the exit).
  // Attached only here, on Home (the tab React Navigation's bottom-tabs
  // already funnels a back-press through when you're on any OTHER tab —
  // Gallery/Generate/Profile's own back goes to Home first, same as any
  // standard Android tab app), so this is the one real place hardware back
  // would otherwise close the app. useFocusEffect (not a plain useEffect)
  // means the listener only exists while Home is the visible tab, so it
  // can't fire while a modal/other screen is actually on top of it.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        showAlert(t('home.exitTitle'), t('home.exitBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('home.exitConfirm'), style: 'destructive', onPress: () => BackHandler.exitApp() },
        ]);
        // `true` tells the OS this press was handled — without it, Android's
        // default behavior (exit immediately) would run in ADDITION to the
        // alert popping up, which isn't a confirmation at all.
        return true;
      });
      return () => subscription.remove();
    }, [t]),
  );

  function loadMorePosts() {
    if (feedLoadingMore || !feedCursor) return;
    setFeedLoadingMore(true);
    api
      .listPosts(feedCursor)
      .then(({ posts, nextCursor }) => {
        setFeedPosts((prev) => [...prev, ...posts]);
        setFeedCursor(nextCursor);
      })
      .catch(() => {})
      .finally(() => setFeedLoadingMore(false));
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* header */}
          <View style={styles.header}>
            <View style={styles.brand}>
              {/* The real brand mark, added 2026-09-11 — this used to be a
               * generic <Icon name="heart"> glyph, a placeholder from before
               * the app had an actual logo. logo-mark.png is the same
               * transparent heart cutout used for the native splash screen
               * (src/components/brandSplash/paths.ts's geometry, pre-
               * rendered — no need to re-draw it as SVG just for a small
               * static header icon). */}
              {/* A relative path here, not the `@/` alias used everywhere
               * else in this file — confirmed live 2026-09-11: Metro's
               * static asset resolver for require() doesn't go through the
               * babel-module-resolver alias the way plain import statements
               * do, so `require('@/assets/...')` fails to bundle at all
               * ("could not be found within the project"), even though the
               * identical alias works fine on every `import` above. Every
               * other require()'d image in this codebase (gallery-store.ts,
               * packs.ts) already uses a relative path for exactly this
               * reason. */}
              <Image source={require('../../assets/brand/logo-mark.png')} style={styles.brandLogo} contentFit="contain" />
              <Text style={[styles.wordmark, { color: theme.ink }]}>Amora</Text>
            </View>
            <View style={styles.headerActions}>
              <View>
                <IconButton name="bell" size={42} iconSize={18} color={theme.ink} onPress={() => router.push('/notifications')} />
                {/* A plain dot, not a count — the exact number matters far
                 * less here than "something's new," and a two-digit badge
                 * on a 42px circular button has no room to render cleanly
                 * anyway. */}
                {unreadNotifications > 0 && (
                  <View style={[styles.badgeDot, { backgroundColor: theme.accent1, borderColor: theme.bg1 }]} />
                )}
              </View>
              <IconButton name="plus" size={42} iconSize={20} color={theme.ink} onPress={() => router.push('/create-post')} />
              {/* Was `router.push('/(tabs)/profile')` — a crown/premium
               * icon detouring to a whole other tab, which the user then
               * still had to find their own way to a paywall from, instead
               * of just opening one. This screen already has its own
               * PaywallModal instance (see `paywallVisible` state below,
               * used by BannerAdView's CTA) — the crown just wasn't using
               * it. */}
              <IconButton name="crown" size={42} iconSize={18} color={theme.accent2} onPress={() => setPaywallVisible(true)} />
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

          <BannerAdView onPressCta={() => setPaywallVisible(true)} />

          {/* Real community posts, added 2026-09-11 — everything above this
           * point is the app's own bundled starter catalog (src/data/
           * templates.ts); these two sections are the first real
           * user-generated content on Home, and deliberately sit OUTSIDE
           * the category-filter conditional above so they're always the
           * tail end of the scroll regardless of which chip is active —
           * "at home page after scroll finish add one category recent
           * post" (the user's own spec). Trending only shows once at least
           * one post has actually been recreated by someone else (an
           * all-zero top 5 would just be noise). */}
          {trendingPosts.some((p) => p.regenerationCount > 0) ? (
            <Section title={t('home.trendingCreations')} theme={theme}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {trendingPosts.map((post, index) => (
                  <TemplateCard
                    key={post.id}
                    label={`#${index + 1} ${post.title || post.author.displayName || t('home.communityCreation')}`}
                    sublabel={postSublabel(post, t)}
                    colors={['#FFA438', '#FF4E72']}
                    imageUrl={post.outputUrl ?? undefined}
                    onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
                  />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          <RecentPostSection
            posts={feedPosts}
            cursor={feedCursor}
            loadingMore={feedLoadingMore}
            onLoadMore={loadMorePosts}
          />

          {/* The real AdMob banner (bottom of Home only — the user's own
           * explicit choice over every tab) — deliberately the LAST item
           * in this ScrollView rather than a fixed/absolute overlay, so it
           * gets the same 165dp bottom clearance every other trailing
           * section already relies on to clear the floating tab bar, for
           * free. See HomeBannerAd's own doc comment. */}
          <HomeBannerAd />
        </ScrollView>
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 165, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandLogo: { width: 28, height: 28 },
  wordmark: { fontFamily: fonts.display, fontSize: 24 },
  // Photo bleeds edge-to-edge (clipped by GlassCard's own rounded corners,
  // no radius/margin of its own needed); the body below carries the padding.
  heroCard: { gap: 16, paddingBottom: 22 },
  heroPhoto: { height: HERO_PHOTO_HEIGHT },
  heroBody: { paddingHorizontal: 20, gap: 16 },
  heroTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 13.5, marginTop: -10 },
  rail: { gap: 14, paddingBottom: 4 },
  chipsRow: { gap: 10, marginVertical: 4 },
  filteredGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  emptyFilterText: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 32 },
});
