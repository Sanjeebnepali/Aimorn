import type { PostResponse } from '@/utils/api';

/**
 * One line of sub-text for a post card — couple-aware (per the user's own
 * spec: "the post is not that it only single image like theme if its
 * couple"), plus its live regeneration count so the number driving both the
 * points economy and the trending rank is visible everywhere a post shows
 * up, not just its own detail screen.
 *
 * Pulled out of (tabs)/index.tsx into its own file because it's used by two
 * separate places that render post cards — the Trending Fusions… no, the
 * Trending Creations rail (stays inline in index.tsx) and the Recent Post
 * grid (its own RecentPostSection component) — rather than duplicating the
 * same string-building logic in both, or forcing one to reach into the
 * other's file for a function that isn't really "theirs".
 *
 * `t` is passed in rather than calling useTranslation() itself so this
 * stays a plain function usable from either component's own render, not a
 * hook with its own subscription.
 */
export function postSublabel(post: PostResponse, t: (key: string) => string): string {
  const kind =
    post.subjectMode === 'COUPLE' ? t('generate.couple') : post.subjectMode === 'GROUP' ? t('generate.group') : t('generate.solo');
  return `${kind} · ${post.regenerationCount} ${t('home.recreated')}`;
}
