import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type VerifyEmailStepProps = {
  email: string;
  code: string;
  onChangeCode: (code: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onClose: () => void;
  isVerifying: boolean;
};

/**
 * The second step of sign-up: Clerk won't issue a session for a new
 * password account until the emailed code is confirmed, so this replaces
 * the email/password form for exactly that one exchange. Split out of
 * auth/index.tsx to keep that file under the project's 350-line file limit.
 */
export function VerifyEmailStep({ email, code, onChangeCode, onVerify, onResend, onClose, isVerifying }: VerifyEmailStepProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <IconButton name="close" onPress={onClose} />
          <View style={styles.brandBlock}>
            <Icon name="mail" size={34} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>{t('auth.checkEmail')}</Text>
            <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('auth.enterCodeSentTo', { email })}</Text>
          </View>

          <GlassCard radius={16} style={styles.inputRow}>
            <Icon name="lock" size={16} color={theme.inkFaint} strokeWidth={1.8} />
            <TextInput
              value={code}
              onChangeText={onChangeCode}
              placeholder="123456"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              autoFocus
              style={[styles.input, { color: theme.ink }]}
            />
          </GlassCard>

          <GradientButton
            label={isVerifying ? t('auth.verifying') : t('auth.verify')}
            onPress={onVerify}
            disabled={isVerifying || code.length === 0}
          />

          <Text style={[styles.resend, { color: theme.accent2 }]} onPress={onResend}>
            {t('auth.resendCode')}
          </Text>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 24 },
  brandBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  headline: { fontFamily: fonts.display, fontSize: 23 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 15 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 13, padding: 0, letterSpacing: 1.5 },
  resend: { alignSelf: 'center', fontFamily: fonts.bodyBold, fontSize: 13 },
});
