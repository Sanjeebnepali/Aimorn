import { Ionicons } from '@expo/vector-icons';
import { type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { Icon } from '@/components/primitives/icon';
import { type ThemeTokens } from '@/theme/tokens';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

type Router = { replace: (href: Href) => void };

/**
 * YOUR CODE CARD — "I'm Person A". Amora mints one permanent pairing code
 * per account at onboarding (`server/src/routes/profile.ts`); there is no
 * "generate" action or per-pairing pack/role choice here — that's what
 * `app/couple/preview.tsx` is for, reached from the Gallery banner before
 * you ever get here. This card just shows the code and lets you share it.
 *
 * Replaces the old GenerateCard (pack picker + role picker + a Premium-
 * gated "Generate" button) — none of that maps onto Amora's real backend:
 * codes aren't minted on demand, and role/pack are chosen post-pairing via
 * `PATCH /couple/role` + `/couple/settings`, not at code-share time.
 *
 * Re-themed onto Amora's gradient-glass primitives (`GlassCard`,
 * `GradientButton`) instead of the flat-dark boxes carried over from the
 * donor app — see `couple/setup.tsx`'s doc comment for the full story. Two
 * glyphs here (`qr-code`, `copy-outline`) have no equivalent in Amora's own
 * `Icon` set, so those two stay on `Ionicons`; `share` does exist there.
 */
export function YourCodeCard({
  pairingCode,
  theme,
  onCopy,
  onShare,
  router,
}: {
  pairingCode: string | null;
  theme: ThemeTokens;
  onCopy: () => void;
  onShare: () => void;
  router: Router;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard strong style={[styles.card, pairingCode != null && { borderColor: theme.accent1 }]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: theme.accent1 }]}>
          <Ionicons name="qr-code" size={18} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>{t('couple.setup.yourCodeTitle')}</Text>
          <Text style={[styles.cardBody, { color: theme.inkSoft }]}>{t('couple.setup.yourCodeBody')}</Text>
        </View>
      </View>

      {pairingCode ? (
        <View style={styles.codeWrap}>
          <Text style={[styles.codeText, { color: theme.accent1 }]}>{pairingCode}</Text>
          <View style={styles.codeBtnRow}>
            <AnimatedButton onPress={onCopy} style={[styles.smallBtn, { borderColor: theme.accent1 }]}>
              <Ionicons name="copy-outline" size={14} color={theme.accent1} />
              <Text style={[styles.smallBtnText, { color: theme.accent1 }]}>{t('couple.setup.copy')}</Text>
            </AnimatedButton>
            <AnimatedButton onPress={onShare} style={[styles.smallBtn, { borderColor: theme.accent1 }]}>
              <Icon name="share" size={14} color={theme.accent1} />
              <Text style={[styles.smallBtnText, { color: theme.accent1 }]}>{t('couple.setup.share')}</Text>
            </AnimatedButton>
          </View>
          <GradientButton
            label={t('couple.setup.continueToWaitingRoom')}
            onPress={() => router.replace('/couple/linking' as Href)}
          />
        </View>
      ) : (
        // Every account gets a pairing code at onboarding — this only shows
        // while the profile fetch is still in flight.
        <Text style={[styles.cardBody, { color: theme.inkSoft }]}>{t('couple.setup.loadingCode')}</Text>
      )}
    </GlassCard>
  );
}
