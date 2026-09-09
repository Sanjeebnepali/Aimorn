import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { IconButton } from '@/components/primitives/icon-button';
import { useAppTheme } from '@/theme/use-app-theme';
import { styles } from './styles';

/**
 * Dashboard header — back + centered title + overflow menu. Split out of
 * `dashboard.tsx` both for that file's own readability and to help it stay
 * under this workspace's 350-line-per-file cap (it was 417 lines carrying
 * this inline before the 2026-09-08 re-theme).
 *
 * The overflow glyph ("⋯") has no equivalent in Amora's own `Icon` set, so
 * it's built by hand here the same way `IconButton` builds every other
 * circular glass button internally, just swapping in an `Ionicons` child —
 * `IconButton` itself only accepts a name from that closed custom set.
 */
export function CoupleDashboardHeader({ onBack, onMenu }: { onBack: () => void; onMenu: () => void }) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <IconButton name="chevronLeft" onPress={onBack} />
      <Text style={[styles.title, { color: theme.ink }]}>{t('couple.dashboard.title')}</Text>
      <Pressable onPress={onMenu} hitSlop={8}>
        <GlassCard radius={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.ink} />
        </GlassCard>
      </Pressable>
    </View>
  );
}
