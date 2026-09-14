import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showAlert } from '@/alerts/store';
import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { extractHashtags, extractMentions } from '@/posts/store';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi, type PostResponse } from '@/utils/api';

/**
 * "My Posts" — reached from Profile's "Share Your Creation" row. Doubles as
 * both the management page the feature was asked for (delete anything
 * you've shared) and the entry point into creating a new one, the same way
 * Instagram/TikTok's own-profile grid has a "+" rather than a separate
 * standalone composer screen.
 *
 * Backed by the real GET/DELETE /posts/mine + /posts/:id routes as of
 * 2026-09-11 (server/src/routes/posts.ts) — previously a local-only
 * `usePostsStore` (AsyncStorage), so this list only ever reflected THIS
 * device and nobody else could ever see what was "posted" here.
 */
export default function ManagePostsScreen() {
  const theme = useAppTheme();
  const api = useApi();
  const [posts, setPosts] = useState<PostResponse[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .listMyPosts()
        .then(setPosts)
        .catch((err) => {
          showAlert('Couldn’t Load Posts', err instanceof Error ? err.message : 'Something went wrong.');
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  function confirmDelete(post: PostResponse) {
    showAlert('Delete Post', 'This removes it from the public feed. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(post.id);
          try {
            await api.deletePost(post.id);
            setPosts((prev) => prev?.filter((p) => p.id !== post.id) ?? prev);
          } catch (err) {
            showAlert('Couldn’t Delete', err instanceof Error ? err.message : 'Something went wrong.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>My Posts</Text>
          <IconButton name="plus" onPress={() => router.push('/create-post')} />
        </View>

        {posts === null ? null : posts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <GlassCard radius={20} style={styles.emptyCard}>
              <Icon name="sparkleDouble" size={32} color={theme.inkFaint} />
              <Text style={[styles.emptyTitle, { color: theme.ink }]}>Nothing shared yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.inkFaint }]}>
                Share one of your creations and it’ll show up here — and on everyone’s Home feed.
              </Text>
              <Pressable onPress={() => router.push('/create-post')}>
                <LinearGradient colors={[theme.accent1, theme.accent2]} style={styles.emptyCta}>
                  <Icon name="plus" size={15} color={theme.ink} strokeWidth={2.4} />
                  <Text style={[styles.emptyCtaText, { color: theme.ink }]}>Share Your Creation</Text>
                </LinearGradient>
              </Pressable>
            </GlassCard>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {posts.map((post) => (
              <PostRow key={post.id} post={post} deleting={deletingId === post.id} onDelete={() => confirmDelete(post)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </GradientScreen>
  );
}

function PostRow({ post, deleting, onDelete }: { post: PostResponse; deleting: boolean; onDelete: () => void }) {
  const theme = useAppTheme();
  const caption = post.caption ?? '';
  const hashtags = extractHashtags(caption);
  const mentions = extractMentions(caption);
  const date = new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    // Found live 2026-09-11 while testing the analytics feature end to end:
    // this row had no way to open the post at all — you could see its
    // regeneration/view badges here, but not its live detail screen (real
    // view count ticking, the Recreate button, etc.), which is exactly
    // where the point of checking "my post's analytics" leads. Wrapped in
    // a Pressable rather than making GlassCard itself pressable — the ×
    // button below needs its own separate tap target, and stopPropagation
    // on it is what keeps tapping delete from also opening the post.
    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}>
      <GlassCard radius={20} style={[styles.row, deleting && { opacity: 0.5 }]}>
        {post.outputUrl ? (
          <Image source={{ uri: post.outputUrl }} style={styles.rowImage} contentFit="cover" />
        ) : (
          <View style={[styles.rowImage, { backgroundColor: theme.glass }]} />
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>
              {post.title ||
                (post.subjectMode === 'SOLO'
                  ? 'Solo AI Wallpaper'
                  : post.subjectMode === 'GROUP'
                    ? 'Group AI Wallpaper'
                    : 'Couple AI Wallpaper')}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              hitSlop={8}
            >
              <Icon name="close" size={16} color={theme.inkFaint} strokeWidth={2} />
            </Pressable>
          </View>
        {post.caption ? (
          <Text style={[styles.rowCaption, { color: theme.inkSoft }]} numberOfLines={2}>
            {post.caption}
          </Text>
        ) : null}
        {hashtags.length + mentions.length > 0 ? (
          <View style={styles.tagRow}>
            {mentions.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
            {hashtags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        ) : null}
        <View style={styles.rowFooter}>
          <Text style={[styles.rowDate, { color: theme.inkFaint }]}>{date}</Text>
          {/* Real stats — added 2026-09-11. View count updates on every
           * screen focus (see the useFocusEffect above); the live-ticking
           * version of both numbers lives on the post detail screen
           * (src/app/post/[id].tsx) instead, via realtime/postsSocket.ts —
           * a whole list of posts each holding open its own socket isn't
           * worth the connection overhead for what's meant to be a
           * glanceable summary here. Regeneration count is the same data
           * driving Home's Trending Creations rail (GET /posts/trending). */}
          <View style={styles.statsBadges}>
            <View style={styles.regenBadge}>
              <Icon name="eye" size={11} color={theme.inkFaint} strokeWidth={2} />
              <Text style={[styles.viewText, { color: theme.inkFaint }]}>{post.viewCount}</Text>
            </View>
            <View style={styles.regenBadge}>
              <Icon name="sparkleDouble" size={11} color={theme.accent2} strokeWidth={2} />
              <Text style={[styles.regenText, { color: theme.accent2 }]}>{post.regenerationCount} recreated</Text>
            </View>
          </View>
        </View>
      </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  title: { fontFamily: fonts.display, fontSize: 19 },
  list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 14 },
  row: { flexDirection: 'row', gap: 12, padding: 12 },
  rowImage: { width: 74, height: 74, borderRadius: radii.md },
  rowBody: { flex: 1, gap: 6 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 14 },
  rowCaption: { fontFamily: fonts.body, fontSize: 14, lineHeight: 17 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  rowDate: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  statsBadges: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  regenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  regenText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  viewText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.pill, marginTop: 6 },
  emptyCtaText: { fontFamily: fonts.bodyBold, fontSize: 13 },
});
