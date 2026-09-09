import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { useAppTheme } from '@/theme/use-app-theme';
import {
  type CouplePack,
  pickImageForState,
} from '../../couple/packs';
import { styles } from './styles';

type CoupleActiveWallpaperCardProps = {
  activeImage: ReturnType<typeof pickImageForState> | null;
  activePack: CouplePack;
  myRoleLabel: string;
  onPreview: () => void;
};

/** Re-themed 2026-09-08 onto `GlassCard`/`useAppTheme()` — see
 * `couple/setup.tsx`'s doc comment for the full re-theme story. */
export function CoupleActiveWallpaperCard({
  activeImage,
  activePack,
  myRoleLabel,
  onPreview,
}: CoupleActiveWallpaperCardProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  return (
    /* ─── Active wallpaper card ─── */
    <GlassCard style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.activeWallpaper.onScreenNow')}</Text>
        <Text style={[styles.cardSubtle, { color: theme.inkFaint }]}>
          {activeImage?.kind === 'together'
            ? t('couple.activeWallpaper.togetherBothPhones')
            : t('couple.activeWallpaper.soloRole', { role: myRoleLabel })}
        </Text>
      </View>

      {activeImage ? (
        <View style={[styles.activeRow, { borderColor: activePack.accent + '88' }]}>
          <Image source={activeImage.image} style={styles.activeThumb} contentFit="cover" transition={120} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.activeTitle, { color: theme.ink }]} numberOfLines={1}>
              {activePack.name}
            </Text>
            <Text style={[styles.activeSub, { color: theme.inkFaint }]}>
              {activeImage.kind === 'together'
                ? t('couple.activeWallpaper.togetherAppliesBoth')
                : t('couple.activeWallpaper.yourHalf', { role: myRoleLabel })}
            </Text>
          </View>
          <IconButton name="eye" size={32} iconSize={16} onPress={onPreview} color={theme.inkFaint} />
        </View>
      ) : (
        <View style={[styles.activeRow, styles.activeEmpty, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
          <Icon name="heartOutline" size={20} color={theme.inkFaint} />
          <Text style={[styles.activeEmptyText, { color: theme.inkFaint }]}>{t('couple.activeWallpaper.waitingBothSides')}</Text>
        </View>
      )}
    </GlassCard>
  );
}
