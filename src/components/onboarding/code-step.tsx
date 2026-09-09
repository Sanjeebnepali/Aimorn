import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import type { ProfileResponse } from '@/utils/api';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type CodeStepProps = {
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  profile: ProfileResponse | null;
  onShareCode: () => void;
  partnerCodeInput: string;
  onChangePartnerCodeInput: (value: string) => void;
  onRedeemPartnerCode: () => void;
  isRedeeming: boolean;
  onFinish: () => void;
};

/**
 * Step 3: mints (via POST /profile/onboarding, see submitOnboarding in
 * onboarding/index.tsx) this account's permanent ID and one-time pairing
 * code, then offers to redeem a partner's. The "Enter Amora" button is
 * always reachable regardless of which state below is showing — a signup
 * finishing setup should never get stuck behind a network hiccup.
 */
export function CodeStep({
  isLoading,
  errorMessage,
  onRetry,
  profile,
  onShareCode,
  partnerCodeInput,
  onChangePartnerCodeInput,
  onRedeemPartnerCode,
  isRedeeming,
  onFinish,
}: CodeStepProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <Icon name="heartOutline" size={30} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>
              {profile ? t('onboarding.code.allSet') : t('onboarding.code.settingUp')}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator color={theme.accent1} size="large" />
              <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('onboarding.code.generatingId')}</Text>
            </View>
          ) : null}

          {!isLoading && errorMessage ? (
            <View style={styles.centerBlock}>
              <Text style={[styles.subtitle, { color: theme.inkFaint }]}>
                {errorMessage} {t('onboarding.code.errorSuffix')}
              </Text>
              <GradientButton label={t('onboarding.code.tryAgain')} onPress={onRetry} fullWidth={false} />
            </View>
          ) : null}

          {!isLoading && profile ? (
            <View style={styles.codesBlock}>
              {profile.username ? (
                <GlassCard radius={18} style={styles.codeCard}>
                  <Text style={[styles.codeLabel, { color: theme.inkFaint }]}>{t('onboarding.code.yourAmoraId')}</Text>
                  <Text style={[styles.codeValue, { color: theme.ink }]}>{profile.username}</Text>
                </GlassCard>
              ) : null}

              {profile.hasPartner ? (
                <GlassCard radius={18} style={styles.codeCard}>
                  <Icon name="couple" size={22} color={theme.accent2} strokeWidth={1.8} />
                  <Text style={[styles.pairedText, { color: theme.ink }]}>{t('onboarding.code.pairedUp')}</Text>
                </GlassCard>
              ) : profile.pairingCode ? (
                <>
                  <GlassCard radius={18} style={styles.codeCard}>
                    <Text style={[styles.codeLabel, { color: theme.inkFaint }]}>{t('onboarding.code.yourPairingCode')}</Text>
                    <Text style={[styles.codeValue, { color: theme.ink }]}>{profile.pairingCode}</Text>
                    <Text style={[styles.shareLink, { color: theme.accent2 }]} onPress={onShareCode}>
                      {t('onboarding.code.shareCode')}
                    </Text>
                  </GlassCard>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: theme.glassBorder }]} />
                    <Text style={[styles.dividerText, { color: theme.inkFaint }]}>{t('onboarding.code.orEnterTheirs')}</Text>
                    <View style={[styles.dividerLine, { backgroundColor: theme.glassBorder }]} />
                  </View>

                  <GlassCard radius={16} style={styles.inputRow}>
                    <TextInput
                      value={partnerCodeInput}
                      onChangeText={(v) => onChangePartnerCodeInput(v.toUpperCase())}
                      placeholder={t('onboarding.code.partnerCodePlaceholder')}
                      placeholderTextColor={theme.inkFaint}
                      autoCapitalize="characters"
                      style={[styles.input, { color: theme.ink }]}
                    />
                    <Text
                      style={[styles.linkAction, { color: partnerCodeInput ? theme.accent2 : theme.inkFaint }]}
                      onPress={partnerCodeInput && !isRedeeming ? onRedeemPartnerCode : undefined}>
                      {isRedeeming ? t('onboarding.code.linking') : t('onboarding.code.link')}
                    </Text>
                  </GlassCard>
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.spacer} />

          <GradientButton label={t('onboarding.code.enterAmora')} onPress={onFinish} disabled={isLoading} />
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // paddingBottom: same real-device bottom-edge touch-interception fix as
  // profile-step.tsx — see that file's comment, or floating-tab-bar.tsx for
  // the full story.
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 60, gap: 20 },
  brandBlock: { alignItems: 'center', gap: 10 },
  headline: { fontFamily: fonts.display, fontSize: 22, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  centerBlock: { alignItems: 'center', gap: 16, paddingVertical: 20 },
  codesBlock: { gap: 14 },
  codeCard: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 16 },
  codeLabel: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  codeValue: { fontFamily: fonts.bodyExtraBold, fontSize: 22, letterSpacing: 3 },
  pairedText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  shareLink: { fontFamily: fonts.bodyBold, fontSize: 14, marginTop: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: fonts.body, fontSize: 12.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 13 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 14, padding: 0, letterSpacing: 2 },
  linkAction: { fontFamily: fonts.bodyExtraBold, fontSize: 13 },
  spacer: { flex: 1 },
});
