import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import i18n from '@/i18n';
import { useAppTheme } from '@/theme/use-app-theme';
import { useCoupleStore } from '../../couple/store';
import { styles } from './styles';

const ERROR_RED = '#ff6b6b';

/** Relative-age label for a `Date.now()` timestamp, or a dash when null.
 *  Not a hook-based `t()` call since this is a plain helper, not a
 *  component — uses the shared `i18next` instance directly, same as
 *  `couple/format.ts`'s `formatRelative` (this is intentionally its own
 *  short-form variant — "3s ago" rather than "seconds ago" — the dashboard's
 *  diagnostics card wants finer granularity than the headline distance
 *  label elsewhere on the same screen). */
function ageLabel(at: number | null): string {
  if (at == null) return i18n.t('couple.format.never');
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return i18n.t('couple.format.secondsAgoShort', { count: s });
  if (s < 3600) return i18n.t('couple.format.minutesAgo', { count: Math.round(s / 60) });
  return i18n.t('couple.format.hoursAgo', { count: Math.round(s / 3600) });
}

/**
 * Couple connection status — a live read-out of the proximity feature's state
 * (my location sent, partner location received, distance, proximity, last
 * error). The on-demand "Run connection check" button was removed per the
 * owner's request; the status card stays as an always-visible health view.
 *
 * Re-themed 2026-09-08 onto `GlassCard`/`useAppTheme()` — see
 * `couple/setup.tsx`'s doc comment for the full re-theme story. "Good" rows
 * use the theme's own accent (matches every other live/active indicator in
 * the app); "no data yet" rows use the muted `inkFaint` tone rather than a
 * fixed alarm color, since that state is just pending, not actually bad.
 */
export function CoupleDiagnostics() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const myUpdatedAt = useCoupleStore((s) => s.myUpdatedAt);
  const partnerUpdatedAt = useCoupleStore((s) => s.partnerUpdatedAt);
  const distanceM = useCoupleStore((s) => s.partnerDistanceM);
  const proximity = useCoupleStore((s) => s.proximity);
  const error = useCoupleStore((s) => s.error);

  return (
    <GlassCard style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.diagnostics.title')}</Text>

      <Row theme={theme} label={t('couple.diagnostics.myLocationSent')} value={ageLabel(myUpdatedAt)} good={myUpdatedAt != null} />
      <Row
        theme={theme}
        label={t('couple.diagnostics.partnerLocationReceived')}
        value={ageLabel(partnerUpdatedAt)}
        good={partnerUpdatedAt != null}
      />
      <Row
        theme={theme}
        label={t('couple.diagnostics.distance')}
        value={distanceM != null ? `${Math.round(distanceM)} m` : '—'}
        good={distanceM != null}
      />
      <Row theme={theme} label={t('couple.diagnostics.proximity')} value={proximity} good={proximity !== 'unknown'} />

      {error ? <Text style={{ color: ERROR_RED, fontSize: 13.5, marginTop: 6 }}>{error}</Text> : null}
    </GlassCard>
  );
}

function Row({
  theme,
  label,
  value,
  good,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 13, color: theme.inkSoft }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: good ? theme.accent1 : theme.inkFaint }}>{value}</Text>
    </View>
  );
}
