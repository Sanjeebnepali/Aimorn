import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { getTemplate } from '@/data/templates';
import { useLikesStore } from '@/likes/store';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/** "12.4K" style compact formatting for view/like counts — this app's
 * numbers never reach the millions, so a plain thousands case is enough. */
function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n);
}

/**
 * Full-screen preview shown when tapping a *template* card (Home's rails,
 * the Template browser) — as opposed to src/app/result/[id].tsx, which is
 * the private "your wallpaper" screen for something *you* generated. This
 * one is the community side: view/like counts and a Recreate CTA, no
 * Set-as-Wallpaper (that's only ever for your own creations) and no
 * comments (not a feature this app has).
 *
 * Layout deliberately mirrors the TikTok/Instagram-Reels convention this
 * was modeled on: a vertical action rail on the right, sitting well above
 * the very bottom of the screen (not crammed against the tab-bar edge),
 * with the caption/handle bottom-left and Recreate as its own CTA below.
 */
export default function TemplateDetailScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const template = getTemplate(id);
  const liked = useLikesStore((s) => !!id && s.likedIds.includes(id));
  const toggleLike = useLikesStore((s) => s.toggleLike);

  // Only reachable by tapping a real TemplateCard, whose id always comes
  // from this same data file — but router params are technically just
  // strings, so a stale/bad deep link is still possible in principle.
  if (!template) {
    router.back();
    return null;
  }

  // The count shown is still a static placeholder (see templates.ts) — this
  // just nudges it by the one like *this device* actually controls, same
  // as tapping "like" on a post before a page refresh re-fetches the total.
  const displayedLikes = (template.likes ?? 0) + (liked ? 1 : 0);

  return (
    <View style={[styles.fill, { width, height }]}>
      {template.imageUrl ? (
        <Image
          source={{ uri: template.imageUrl }}
          style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundColor: 'transparent' }}
          contentFit="cover"
        />
      ) : (
        <LinearGradient colors={template.colors} style={{ position: 'absolute', top: 0, left: 0, width, height }} />
      )}
      {/* Scrim so the top-bar back button and bottom info/stats stay legible
       * over any photo — darkest at the edges, clear through the middle.
       * The literal 'transparent' keyword was replaced with an explicit
       * alpha-0 rgba here after confirming Android's gradient interpolation
       * can visibly muddy a 'transparent' middle stop instead of cleanly
       * fading. */}
      <LinearGradient
        colors={['rgba(10,4,8,0.7)', 'rgba(10,4,8,0)', 'rgba(10,4,8,0.85)']}
        locations={[0, 0.4, 1]}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
      />

      {/* FOUND & FIXED (2026-09-08): the photo above was rendering solid
       * black on real devices even though it genuinely loaded and painted
       * (confirmed via temporary onLoad/onDisplay/onLayout diagnostics —
       * all fired correctly, with the right dimensions). The actual cause:
       * this SafeAreaView used to reuse `styles.fill`, which carries an
       * OPAQUE `backgroundColor` (needed on the outer View above, as the
       * fallback color while the photo is still loading) — but this
       * SafeAreaView is a later sibling of the Image and scrim, so React
       * Native paints it on top of them. An opaque full-screen layer here
       * was silently covering the photo completely; only its own children
       * (back button, action rail, caption, Recreate) were ever visible,
       * which is exactly why "everything else on this screen" always
       * worked fine while just the photo never showed. Fixed by giving it
       * its own transparent-background style instead. */}
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <IconButton name="chevronLeft" onPress={() => router.back()} strong />
        </View>

        {/* Right-side action rail — positioned by its own `bottom` offset
         * rather than sitting inside the bottom info row, so it reads as a
         * persistent side rail (like Reels/TikTok) instead of crowding the
         * caption down at the very edge of the screen. */}
        <View style={styles.actionRail}>
          <Pressable onPress={() => toggleLike(template.id)} style={styles.statItem} hitSlop={10}>
            <View style={[styles.statIcon, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <Icon
                name={liked ? 'heart' : 'heartOutline'}
                size={22}
                color={liked ? theme.accent1 : theme.ink}
                strokeWidth={1.8}
              />
            </View>
            <Text style={[styles.statLabel, { color: theme.ink }]}>{formatCount(displayedLikes)}</Text>
          </Pressable>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <Icon name="eye" size={21} color={theme.ink} strokeWidth={1.8} />
            </View>
            <Text style={[styles.statLabel, { color: theme.ink }]}>{formatCount(template.views ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.bottomBlock}>
          <View style={styles.infoBlock}>
            {template.handle ? <Text style={[styles.handle, { color: theme.ink }]}>{template.handle}</Text> : null}
            <Text style={[styles.label, { color: theme.ink }]}>{template.label}</Text>
          </View>

          <GradientButton
            label="Recreate"
            icon="sparkleDouble"
            onPress={() =>
              // replace, not push — the detail view was just a preview, so
              // backing out of Generate should land on the rail/grid you
              // started from, not back here.
              router.replace({ pathname: '/generate/from-template/[id]', params: { id: template.id } })
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0a0408' },
  // Transparent on purpose — see the comment above the SafeAreaView that
  // uses this. It only exists to lay content out with safe-area padding on
  // top of the photo/scrim below it, never to paint over them.
  overlay: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingTop: 8 },
  spacer: { flex: 1 },
  actionRail: {
    position: 'absolute',
    right: 16,
    bottom: '32%',
    gap: 20,
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', gap: 6 },
  statIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5 },
  bottomBlock: { paddingHorizontal: 20, paddingBottom: 60, gap: 16 },
  infoBlock: { gap: 4 },
  handle: { fontFamily: fonts.bodyBold, fontSize: 13, opacity: 0.85 },
  label: { fontFamily: fonts.display, fontSize: 24 },
});
