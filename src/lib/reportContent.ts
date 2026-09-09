export type ReportSurface = 'ai_preview' | 'wallpaper_menu' | 'couple_partner';

export type ReportReason =
  | 'inappropriate'
  | 'real_person'
  | 'copyright'
  | 'violence'
  | 'harassment'
  | 'other';

export type ReportContext = {
  surface: ReportSurface;
  wallpaperId?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  /** Who's being reported — only meaningful for `couple_partner`. */
  targetUserId?: string;
};

/**
 * Types only — the submit call itself now lives in
 * `ReportContentModal.tsx`'s `ReportContentHost`, which can call `useApi()`
 * (a hook) directly. This file used to also export `submitReport()`, which
 * posted to a fake `supabase.from('reports').insert(...)` stub — the mock
 * client in the now-deleted `lib/supabase.ts` always returned `{ error: null }`,
 * so every report silently "succeeded" with a ✓ toast and nothing was ever
 * saved anywhere. Real endpoint for the one surface actually wired up today
 * (`couple_partner`) is `POST /couple/report` via `useApi().reportPartner()` —
 * honestly unimplemented server-side (see `server/src/routes/couple.ts`'s
 * closing comment) until a moderation queue exists, so it 404s instead of
 * lying about success.
 */
