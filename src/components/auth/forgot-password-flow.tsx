import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useSignIn } from '@clerk/expo';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { clerkErrorMessage } from '@/utils/clerkError';

type ForgotStep = 'email' | 'code' | 'newPassword';

type ForgotPasswordFlowProps = {
  signIn: ReturnType<typeof useSignIn>['signIn'];
  /** Prefilled from whatever the user already typed on the main form, but
   * still editable — they may be resetting a DIFFERENT account's password
   * than the one they were trying (and failing) to log into. */
  initialEmail: string;
  onClose: () => void;
  /** Called once Clerk has actually finalized a new session off the reset
   * password — same "go to tabs or onboarding" destination as a normal
   * successful login, not just a bare "close this screen". */
  onDone: () => void;
};

/**
 * Real Clerk password-reset flow (replaces the old stub that just showed an
 * alert saying "isn't connected yet"). Three steps against the SAME
 * `signIn` Future resource the login form itself uses — `signIn.create({
 * identifier })` establishes which account, `resetPasswordEmailCode.sendCode()`
 * emails the code, `verifyCode()` confirms it (flipping status to
 * 'needs_new_password'), and `submitPassword()` sets the new password and
 * completes the sign-in — see Clerk's own custom-flow guide linked from
 * signInFuture.d.ts's resetPasswordEmailCode doc comment. `finalize()` at
 * the end activates the session exactly like a normal password login would,
 * so a successful reset also logs the user in rather than dumping them back
 * on the login form to type the password they just set.
 */
export function ForgotPasswordFlow({ signIn, initialEmail, onClose, onDone }: ForgotPasswordFlowProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [step, setStep] = useState<ForgotStep>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSendCode() {
    setBusy(true);
    try {
      const created = await signIn.create({ identifier: email });
      if (created.error) {
        showError(created.error);
        return;
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) {
        showError(sent.error);
        return;
      }
      setStep('code');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    setBusy(true);
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (error) {
        showError(error);
        return;
      }
      setStep('newPassword');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPassword() {
    setBusy(true);
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (error) {
        showError(error);
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  // Local-only error state (not showAlert) — a wrong code or a too-weak
  // password is an expected, correctable mistake the user should see right
  // on the field they're editing, not as an interruption they have to
  // dismiss before trying again.
  const [errorText, setErrorText] = useState<string | null>(null);
  function showError(error: { longMessage?: string; message: string }) {
    setErrorText(clerkErrorMessage(error));
  }

  const headline =
    step === 'email' ? t('auth.forgotEmailHeadline') : step === 'code' ? t('auth.checkEmail') : t('auth.forgotNewPasswordHeadline');
  const subtitle =
    step === 'email'
      ? t('auth.forgotEmailSubtitle')
      : step === 'code'
        ? t('auth.enterCodeSentTo', { email })
        : t('auth.forgotNewPasswordSubtitle');

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <IconButton name="close" onPress={onClose} />
          <View style={styles.brandBlock}>
            <Icon name="lock" size={34} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>{headline}</Text>
            <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{subtitle}</Text>
          </View>

          {errorText ? <Text style={[styles.error, { color: theme.accent1 }]}>{errorText}</Text> : null}

          {step === 'email' ? (
            <>
              <GlassCard radius={16} style={styles.inputRow}>
                <Icon name="mail" size={16} color={theme.inkFaint} strokeWidth={1.8} />
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setErrorText(null);
                  }}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={theme.inkFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  autoFocus
                  style={[styles.input, { color: theme.ink }]}
                />
              </GlassCard>
              <GradientButton
                label={busy ? t('auth.sendingCode') : t('auth.sendResetCode')}
                onPress={handleSendCode}
                disabled={busy || email.length === 0}
              />
            </>
          ) : step === 'code' ? (
            <>
              <GlassCard radius={16} style={styles.inputRow}>
                <Icon name="lock" size={16} color={theme.inkFaint} strokeWidth={1.8} />
                <TextInput
                  value={code}
                  onChangeText={(v) => {
                    setCode(v);
                    setErrorText(null);
                  }}
                  placeholder="123456"
                  placeholderTextColor={theme.inkFaint}
                  keyboardType="number-pad"
                  autoFocus
                  style={[styles.input, { color: theme.ink }]}
                />
              </GlassCard>
              <GradientButton
                label={busy ? t('auth.verifying') : t('auth.verify')}
                onPress={handleVerifyCode}
                disabled={busy || code.length === 0}
              />
              <Text style={[styles.resend, { color: theme.accent2 }]} onPress={handleSendCode}>
                {t('auth.resendCode')}
              </Text>
            </>
          ) : (
            <>
              <GlassCard radius={16} style={styles.inputRow}>
                <Icon name="lock" size={16} color={theme.inkFaint} strokeWidth={1.8} />
                <TextInput
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setErrorText(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={theme.inkFaint}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  autoFocus
                  style={[styles.input, { color: theme.ink }]}
                />
              </GlassCard>
              <GradientButton
                label={busy ? t('auth.settingPassword') : t('auth.setNewPassword')}
                onPress={handleSubmitPassword}
                disabled={busy || password.length < 8}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 16 },
  brandBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  headline: { fontFamily: fonts.display, fontSize: 23, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18 },
  error: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 15 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 13, padding: 0 },
  resend: { alignSelf: 'center', fontFamily: fonts.bodyBold, fontSize: 13 },
});
