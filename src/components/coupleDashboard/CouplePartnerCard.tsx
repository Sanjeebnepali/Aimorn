import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { useAppTheme } from '@/theme/use-app-theme';
import { styles } from './styles';

// Same literal-gold precedent as CoupleDashboardControls.tsx — no semantic
// "paused/warning" token exists yet in theme/tokens.ts.
const PAUSED_GOLD = '#E8C275';

type CouplePartnerCardProps = {
  partnerName: string;
  partnerRoleEmoji: string | null | undefined;
  myRoleEmoji: string | null | undefined;
  myRoleLabel: string;
  partnerRoleLabel: string;
  proximityColor: string;
  proximityLabel: string;
  distanceLabel: string;
  lastUpdate: string;
  paused: boolean;
};

/** Re-themed 2026-09-08 onto `GlassCard`/`useAppTheme()` — see
 * `couple/setup.tsx`'s doc comment for the full re-theme story. */
export function CouplePartnerCard({
  partnerName,
  partnerRoleEmoji,
  myRoleEmoji,
  myRoleLabel,
  partnerRoleLabel,
  proximityColor,
  proximityLabel,
  distanceLabel,
  lastUpdate,
  paused,
}: CouplePartnerCardProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    /* ─── Partner card ─── */
    <GlassCard strong style={[styles.card, { borderColor: proximityColor + '66' }]}>
      <View style={styles.partnerRow}>
        <View style={[styles.avatar, { backgroundColor: theme.accent1 }]}>
          <Icon name="person" size={24} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.partnerName, { color: theme.ink }]}>
            {partnerName}{' '}
            {partnerRoleEmoji ? (
              <Text style={styles.partnerRoleEmoji}>{partnerRoleEmoji}</Text>
            ) : null}
          </Text>
          <Text style={[styles.partnerSub, { color: theme.inkFaint }]}>
            {t('couple.partnerCard.you')}: {myRoleEmoji ?? ''} {myRoleLabel} · {t('couple.partnerCard.them')}:{' '}
            {partnerRoleEmoji ?? ''} {partnerRoleLabel}
          </Text>
        </View>
        <View style={[styles.statusPill, { borderColor: proximityColor }]}>
          <View style={[styles.statusDot, { backgroundColor: proximityColor }]} />
          <Text style={[styles.statusPillText, { color: proximityColor }]}>{proximityLabel}</Text>
        </View>
      </View>

      <View style={styles.distanceRow}>
        <Text style={[styles.distanceBig, { color: theme.ink }]}>{distanceLabel}</Text>
        <Text style={[styles.distanceSub, { color: theme.inkFaint }]}>
          {t('couple.partnerCard.updated', { time: lastUpdate })}
        </Text>
      </View>

      {paused ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(232,194,117,0.12)' }]}>
          <Ionicons name="pause-circle" size={14} color={PAUSED_GOLD} />
          <Text style={[styles.bannerText, { color: PAUSED_GOLD }]}>{t('couple.partnerCard.pausedBanner')}</Text>
        </View>
      ) : null}
    </GlassCard>
  );
}
