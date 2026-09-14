import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { connectPostSocket } from '@/posts/socket';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi, type PostResponse } from '@/utils/api';

/** "12.4K" style compact formatting — matches template/[id].tsx's own. */
function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n);
}

/**
 * Full-screen preview for a real, user-shared community post — the
 * community side of a REAL creation, as opposed to template/[id].tsx (one
 * of the app's 12 bundled starter themes) and result/[id].tsx (the private
 * "your wallpaper" screen for something you generated but haven't shared).
 *
 * Built 2026-09-11 alongside Home's "Recent Post"/"Trending Creations"
 * sections. Originally also showed a couple post's two solo halves via a
 * pane switcher — removed the same day per explicit user correction: a
 * couple post must only ever expose the TOGETHER shot publicly, never one
 * partner's solo close-up (posts.ts no longer even fetches
 * outputKeyA/outputKeyB for a Post, so there's nothing here to switch to
 * anymore — solo sharing still works, just as its own real SOLO-mode
 * post). Recreate threads this post's id through to /generate/from-post/
 * [id] as `sourcePostId`, which is what actually earns the original
 * poster points (server/src/routes/generations.ts's
 * awardPointsForRegeneration) — every other "Recreate" button in the app
 * (template/[id].tsx) recreates a bundled theme instead, which has no
 * owner to credit.
 */
export default function PostDetailScreen() {
  const theme = useAppTheme();
  const api = useApi();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<PostResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Live-pushed counts (realtime/postsSocket.ts) — starts null and falls
  // back to `post`'s own snapshot until the first 'stats' message (or the
  // view-recording response) arrives, then wins over it for the rest of
  // this screen's life so the numbers actually tick up while it's open,
  // TikTok/YouTube-style, instead of only updating on next load.
  const [liveStats, setLiveStats] = useState<{ viewCount: number; regenerationCount: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getPost(id)
      .then((p) => {
        setPost(p);
        // Seeds liveStats from the real snapshot as soon as it's known —
        // any earlier write from the view/socket effect below (a race,
        // since both effects fire independently on mount) only ever wrote
        // a viewCount with a placeholder regenerationCount, so this always
        // wins with the true values the instant it lands.
        setLiveStats({ viewCount: p.viewCount, regenerationCount: p.regenerationCount });
      })
      .catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Records this open as a view (once, not on every re-render) and opens
  // the live-stats socket for as long as this screen stays mounted.
  // Separate from the getPost() effect above since this must fire exactly
  // once per real "open" regardless of how many times `post` itself
  // re-fetches or re-renders. Merges onto whatever's already known rather
  // than overwriting — if this resolves before getPost above does, the
  // regenerationCount briefly reads 0 until that effect's own snapshot
  // lands a moment later (both are near-instant same-origin requests), not
  // a real data-integrity issue.
  useEffect(() => {
    if (!id) return;
    api
      .recordPostView(id)
      .then(({ viewCount }) => setLiveStats((prev) => ({ viewCount, regenerationCount: prev?.regenerationCount ?? 0 })))
      .catch(() => {});
    const teardown = connectPostSocket(id, { onStats: setLiveStats });
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFound) {
    router.back();
    return null;
  }
  if (!post) return null;

  const viewCount = liveStats?.viewCount ?? post.viewCount;
  const regenerationCount = liveStats?.regenerationCount ?? post.regenerationCount;

  return (
    <View style={[styles.fill, { width, height }]}>
      {post.outputUrl ? (
        <Image
          source={{ uri: post.outputUrl }}
          style={{ position: 'absolute', top: 0, left: 0, width, height }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <LinearGradient colors={['#3a1c56', '#140c1e']} style={{ position: 'absolute', top: 0, left: 0, width, height }} />
      )}
      <LinearGradient
        colors={['rgba(10,4,8,0.7)', 'rgba(10,4,8,0)', 'rgba(10,4,8,0.85)']}
        locations={[0, 0.4, 1]}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <IconButton name="chevronLeft" onPress={() => router.back()} strong />
        </View>

        <View style={styles.actionRail}>
          {/* Both numbers are live — realtime/postsSocket.ts pushes updates
           * to this exact screen while it's open, so these visibly tick up
           * if someone else views or recreates this post right now, same
           * as watching a TikTok/YouTube counter. */}
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <Icon name="eye" size={20} color={theme.ink} strokeWidth={1.8} />
            </View>
            <Text style={[styles.statLabel, { color: theme.ink }]}>{formatCount(viewCount)}</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <Icon name="sparkleDouble" size={20} color={theme.accent1} strokeWidth={1.8} />
            </View>
            <Text style={[styles.statLabel, { color: theme.ink }]}>{formatCount(regenerationCount)}</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.bottomBlock}>
          <View style={styles.infoBlock}>
            <Text style={[styles.handle, { color: theme.ink }]}>{post.author.displayName ?? 'Amora User'}</Text>
            {post.title ? <Text style={[styles.label, { color: theme.ink }]}>{post.title}</Text> : null}
            {post.caption ? (
              <Text style={[styles.caption, { color: theme.resultInkSoft }]} numberOfLines={3}>
                {post.caption}
              </Text>
            ) : null}
          </View>

          <GradientButton
            label="Recreate"
            icon="sparkleDouble"
            onPress={() => router.replace({ pathname: '/generate/from-post/[id]', params: { id: post.id } })}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0a0408' },
  overlay: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingTop: 8 },
  spacer: { flex: 1 },
  actionRail: { position: 'absolute', right: 16, bottom: '32%', gap: 20, alignItems: 'center' },
  statItem: { alignItems: 'center', gap: 6 },
  statIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5 },
  bottomBlock: { paddingHorizontal: 20, paddingBottom: 60, gap: 16 },
  infoBlock: { gap: 4 },
  handle: { fontFamily: fonts.bodyBold, fontSize: 13, opacity: 0.85 },
  label: { fontFamily: fonts.display, fontSize: 22 },
  caption: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 18 },
});
