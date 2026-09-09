// Distance/time labels for the dashboard — ported verbatim (pure formatting,
// no backend coupling) from the source feature's lib/coupleDashboardFormat.ts.
//
// `m`/`km` are left untranslated — SI unit abbreviations, not English words,
// read the same across effectively every language this app ships (see
// i18n/languages.ts). The relative-time phrases below ARE real language
// content, so those go through i18next directly: this file is a plain
// utility (no React tree above it to call `useTranslation()` from), so it
// uses the shared `i18next` instance's own `t()` instead of the hook.
import i18n from '@/i18n';

export function formatDistance(m: number | null): string {
  if (m == null) return '— m';
  if (m < 50) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatRelative(ms: number): string {
  if (ms < 30_000) return i18n.t('couple.format.justNow');
  if (ms < 60_000) return i18n.t('couple.format.secondsAgo');
  if (ms < 60 * 60_000) return i18n.t('couple.format.minutesAgo', { count: Math.round(ms / 60_000) });
  if (ms < 24 * 60 * 60_000) return i18n.t('couple.format.hoursAgo', { count: Math.round(ms / 3_600_000) });
  return i18n.t('couple.format.daysAgo', { count: Math.round(ms / 86_400_000) });
}
