/**
 * Caption-parsing helpers shared by the posts feature (src/app/create-post,
 * src/app/manage-posts) — pure string utilities, no state.
 *
 * This file used to also export `usePostsStore`, a local-only (AsyncStorage)
 * Zustand store standing in for a real backend. Removed 2026-09-11 once the
 * real one shipped (POST/GET/DELETE /posts — server/src/routes/posts.ts):
 * create-post and manage-posts now call `useApi()` directly, so keeping a
 * second, disconnected "posts" data source around would just be dead code
 * inviting a future screen to accidentally read from the wrong one.
 */

/** #word tokens pulled out of a caption for display as chips — matches how
 * Instagram/TikTok treat hashtags as part of the caption text, not a
 * separately-typed field. */
export function extractHashtags(caption: string): string[] {
  return [...caption.matchAll(/#(\w+)/g)].map((m) => m[0]);
}

/** @name tokens pulled out of a caption — same inline-typed convention as
 * hashtags above. There's no real user directory to tag someone *from*
 * yet (this app's only "connection" concept is the onboarding pairing
 * code), so this is a caption-text mention, not a picker over real
 * accounts — same honest limitation as everything else pre-backend. */
export function extractMentions(caption: string): string[] {
  return [...caption.matchAll(/@(\w+)/g)].map((m) => m[0]);
}
