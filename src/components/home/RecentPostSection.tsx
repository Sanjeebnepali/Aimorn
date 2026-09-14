import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GradientButton } from '@/components/primitives/gradient-button';
import { TemplateCard } from '@/components/primitives/template-card';
import { NativeFeedAdCard } from '@/components/ads/NativeFeedAdCard';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { postSublabel } from '@/utils/post-sublabel';
import type { PostResponse } from '@/utils/api';

/**
 * Home's "Recent Post" section (the app's real, live-community feed — see
 * (tabs)/index.tsx's own doc comment on where it sits in the scroll) —
 * split into its own file purely to keep index.tsx under the workspace's
 * 350-line limit (see AGENTS.md); no behavior change from when this block
 * lived inline there.
 *
 * Also owns the mid-scroll native ad slot: a Fragment per post (not a bare
 * array) because the every-6th-post NativeFeedAdCard needs its own key
 * alongside the post's, and .map can only return one element — or one
 * Fragment — per iteration. Every 6, not more often: the user's own
 * explicit ask was "less ads than a typical app in this category by
 * 20-40%" — a common baseline for this kind of feed is roughly 1 ad per 4
 * items, so 1-per-6 sits deliberately inside that lighter range instead of
 * merely matching it.
 */
export function RecentPostSection({
  posts,
  cursor,
  loadingMore,
  onLoadMore,
}: {
  posts: PostResponse[];
  cursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('home.recentPost')}</Text>
      </View>
      {posts.length === 0 ? (
        <Text style={[styles.emptyFilterText, { color: theme.inkFaint }]}>{t('home.noPostsYet')}</Text>
      ) : (
        <>
          <View style={styles.filteredGrid}>
            {posts.map((post, index) => (
              <Fragment key={post.id}>
                <TemplateCard
                  width={168}
                  height={196}
                  label={post.title || post.author.displayName || t('home.communityCreation')}
                  sublabel={postSublabel(post, t)}
                  colors={['#3a1c56', '#140c1e']}
                  imageUrl={post.outputUrl ?? undefined}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
                />
                {(index + 1) % 6 === 0 ? <NativeFeedAdCard key={`ad-${post.id}`} /> : null}
              </Fragment>
            ))}
          </View>
          {cursor ? (
            <GradientButton
              label={loadingMore ? t('home.loadingMore') : t('home.loadMore')}
              fullWidth={false}
              onPress={onLoadMore}
              disabled={loadingMore}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18 },
  filteredGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  emptyFilterText: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 32 },
});
