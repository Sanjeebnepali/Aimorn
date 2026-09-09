import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/primitives/icon';
import { useAppTheme } from '@/theme/use-app-theme';
import { styles } from './styles';

// No semantic "warning/paused" token exists yet in `theme/tokens.ts` (only
// per-theme accent1/accent2, which vary too widely in hue across the 9
// palettes to read as "paused" consistently) — this is the same literal
// gold `constants/theme.ts`'s `Colors.gold` used, kept as-is rather than
// invented fresh, same precedent as this file's own error-red below.
const PAUSED_GOLD = '#E8C275';
const ERROR_RED = '#ff6b6b';

/**
 * Pause/Resume + Check-GPS controls, plus the privacy footnote and any live
 * store error. Split out of `dashboard.tsx` — see
 * `CoupleDashboardHeader.tsx`'s doc comment for why.
 */
export function CoupleDashboardControls({
  paused,
  busy,
  partnerName,
  error,
  onTogglePause,
  onCheckPermission,
}: {
  paused: boolean;
  busy: boolean;
  partnerName: string;
  error: string | null;
  onTogglePause: () => void;
  onCheckPermission: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.controlsRow}>
        <Pressable
          onPress={onTogglePause}
          disabled={busy}
          style={[
            styles.ctrlBtn,
            {
              backgroundColor: paused ? PAUSED_GOLD : theme.glass,
              borderColor: paused ? PAUSED_GOLD : theme.glassBorder,
              opacity: busy ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={16} color={paused ? '#131313' : theme.ink} />
          <Text style={[styles.ctrlBtnText, { color: paused ? '#131313' : theme.ink }]}>
            {paused ? t('couple.controls.resume') : t('couple.controls.pauseSharing')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onCheckPermission}
          disabled={busy}
          style={[styles.ctrlBtn, { backgroundColor: theme.glass, borderColor: theme.glassBorder, opacity: busy ? 0.6 : 1 }]}
        >
          <Ionicons name="location-outline" size={16} color={theme.ink} />
          <Text style={[styles.ctrlBtnText, { color: theme.ink }]}>{t('couple.controls.checkGps')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.privacyText, { color: theme.inkFaint }]}>
        <Icon name="lock" size={11} color={theme.accent2} />
        {'  '}
        {t('couple.controls.locationSharedWith', { name: partnerName })}
      </Text>

      {error ? <Text style={[styles.errText, { color: ERROR_RED }]}>{error}</Text> : null}
    </>
  );
}
