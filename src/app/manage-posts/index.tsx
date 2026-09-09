import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showAlert } from '@/alerts/store';
import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { creationLabel, resolveCreationImage, useGalleryStore } from '@/data/gallery-store';
import { extractHashtags, extractMentions, type MyPost, usePostsStore } from '@/posts/store';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * "My Posts" — reached from Profile's "Share Your Creation" row. Doubles as
 * both the management page the feature was asked for (delete anything
 * you've shared) and the entry point into creating a new one, the same way
 * Instagram/TikTok's own-profile grid has a "+" rather than a separate
 * standalone composer screen.
 */
export default function ManagePostsScreen() {
  const theme = useAppTheme();
  const posts = usePostsStore((s) => s.posts);
  const removePost = usePostsStore((s) => s.removePost);
  // Each PostRow below resolves its `creationId` against this store (your
  // real Gallery, not a static catalog) — hydrate it here too, same reason
  // as create-post's own copy of this effect: this screen is reachable
  // directly from Profile without Gallery ever having been opened first.
  const loadFromStorage = useGalleryStore((s) => s.loadFromStorage);

  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  function confirmDelete(post: MyPost) {
    showAlert('Delete Post', 'This removes it from My Posts. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removePost(post.id) },
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

        {posts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <GlassCard radius={20} style={styles.emptyCard}>
              <Icon name="sparkleDouble" size={32} color={theme.inkFaint} />
              <Text style={[styles.emptyTitle, { color: theme.ink }]}>Nothing shared yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.inkFaint }]}>
                Share one of your creations and it’ll show up here.
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
              <PostRow key={post.id} post={post} onDelete={() => confirmDelete(post)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </GradientScreen>
  );
}

function PostRow({ post, onDelete }: { post: MyPost; onDelete: () => void }) {
  const theme = useAppTheme();
  // Looked up live rather than snapshotted at share time, same reasoning as
  // the doc comment on MyPost.creationId — a post always reflects your
  // current Gallery entry (e.g. if you later favorite it), not a copy.
  const creation = useGalleryStore((s) => s.creations.find((c) => c.id === post.creationId));
  const imageUri = resolveCreationImage(creation?.togetherImage);
  const hashtags = extractHashtags(post.caption);
  const mentions = extractMentions(post.caption);
  const date = new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <GlassCard radius={20} style={styles.row}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.rowImage} contentFit="cover" />
      ) : (
        <View style={[styles.rowImage, { backgroundColor: theme.glass }]} />
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          {/* Falls back to the creation's own generated label (its prompt,
           * or a generic "Couple/Solo AI Wallpaper") for posts saved before
           * `title` existed on MyPost — old local data, not a live migration. */}
          <Text style={[styles.rowLabel, { color: theme.ink }]}>
            {post.title || (creation ? creationLabel(creation) : 'Untitled')}
          </Text>
          <Pressable onPress={onDelete} hitSlop={8}>
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
        <Text style={[styles.rowDate, { color: theme.inkFaint }]}>{date}</Text>
      </View>
    </GlassCard>
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
  rowDate: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.pill, marginTop: 6 },
  emptyCtaText: { fontFamily: fonts.bodyBold, fontSize: 13 },
});
