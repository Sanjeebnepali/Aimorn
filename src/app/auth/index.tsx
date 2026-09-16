import { useClerk, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { styles } from '@/components/auth/auth-screen.styles';
import { ForgotPasswordFlow } from '@/components/auth/forgot-password-flow';
import { VerifyEmailStep } from '@/components/auth/verify-email-step';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { SegmentToggle } from '@/components/primitives/segment-toggle';
import { useWarmUpBrowser } from '@/hooks/use-warm-up-browser';
import { useOnboardingStore } from '@/onboarding/store';
import { useAppTheme } from '@/theme/use-app-theme';
import { clerkErrorMessage as errorMessage } from '@/utils/clerkError';

export default function AuthScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const isLogin = mode === 'login';

  // 'verify' only exists for the sign-up path — Clerk requires proving
  // ownership of the email before it will issue a session for a new account.
  const [step, setStep] = useState<'form' | 'verify' | 'forgotPassword'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // startSSOFlow has no fetchStatus of its own (it's not a signIn/signUp
  // field access, just an imperative call), so its in-flight state is
  // tracked locally instead.
  const [googleLoading, setGoogleLoading] = useState(false);

  // Both hooks return a live resource object (never null/undefined) plus the
  // fetch status of whatever the last call to it was — verified against the
  // installed @clerk/expo types rather than assumed, since this "Future"
  // resource API replaced the older isLoaded/create()/setActive() shape.
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();

  useWarmUpBrowser();

  const isSubmitting = signInStatus === 'fetching' || signUpStatus === 'fetching' || googleLoading;

  // Leaves this modal after a successful sign-in/up. Deliberately *not*
  // `router.back()`: _layout.tsx's Stack.Protected swaps which screen is
  // registered (tabs vs onboarding) the instant Clerk's sign-in state
  // flips, which can prune this modal's back-history in the very same tick
  // `finalize()`/`setActive()` resolves — back() then has nowhere to go and
  // silently no-ops, leaving the user stuck on this screen looking signed
  // out even though Clerk *did* sign them in (see docs/session-handoff for
  // the bug this fixes). Reading `clerk.user` (the live client, not the
  // isSignedIn/userId *hooks*, which only refresh on the next render) and
  // replacing straight to the correct destination sidesteps that race
  // entirely instead of depending on history that may no longer exist.
  function goToAppOrOnboarding() {
    const userId = clerk.user?.id;
    const hasOnboarded = !!userId && useOnboardingStore.getState().completedUserIds.includes(userId);
    router.replace(hasOnboarded ? '/(tabs)' : '/onboarding');
  }

  // Handles both the login form and the first step of sign-up (collecting +
  // validating email/password). Sign-up's second step (the emailed code) is
  // handleVerifyCode below.
  async function handleAuthSubmit() {
    if (isLogin) {
      const { error } = await signIn.password({ emailAddress: email, password });
      if (error) {
        showAlert(t('auth.logInFailedTitle'), errorMessage(error));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        goToAppOrOnboarding();
        return;
      }
      // A fresh Clerk app has no MFA/second-factor configured, so this
      // shouldn't be reachable in practice — but if the dashboard ever
      // turns one on, say so honestly instead of pretending sign-in worked.
      showAlert(
        t('auth.verificationRequiredTitle'),
        t('auth.verificationRequiredBody', { status: signIn.status.replace(/_/g, ' ') }),
      );
      return;
    }

    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) {
      showAlert(t('auth.signUpFailedTitle'), errorMessage(error));
      return;
    }
    if (signUp.status === 'complete') {
      await signUp.finalize();
      goToAppOrOnboarding();
      return;
    }
    // Email verification is Clerk's default requirement for a password
    // sign-up — send the code now and swap the form for the code-entry step.
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      showAlert(t('auth.couldntSendCodeTitle'), errorMessage(sendError));
      return;
    }
    setStep('verify');
  }

  async function handleVerifyCode() {
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) {
      showAlert(t('auth.verificationFailedTitle'), errorMessage(error));
      return;
    }
    if (signUp.status === 'complete') {
      await signUp.finalize();
      goToAppOrOnboarding();
      return;
    }
    showAlert(t('auth.almostThereTitle'), t('auth.almostThereAccountBody'));
  }

  async function handleResendCode() {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      showAlert(t('auth.couldntResendCodeTitle'), errorMessage(error));
      return;
    }
    showAlert(t('auth.codeSentTitle'), t('auth.codeSentBody', { email }));
  }

  async function handleSocialAuth(provider: 'Google' | 'Apple') {
    if (provider === 'Apple') {
      showAlert(t('auth.appleTitle'), t('auth.applePreviewBody'));
      return;
    }

    setGoogleLoading(true);
    try {
      // redirectUrl must point back into this app (its registered "amora"
      // scheme) so the OS hands control back to Expo once the in-app browser
      // tab finishes the Google OAuth redirect chain.
      //
      // Explicit `path` matters here: `makeRedirectUri()` with no args
      // returns a BARE `amora://` (no host/path). Confirmed live (2026-09-07)
      // that Chrome's Custom Tab never actually hands off to the app for
      // that bare form — the Google/Clerk consent page just reloads itself
      // in place instead of redirecting, with no error surfaced anywhere
      // (matches every OTHER deep link exercised this session, which always
      // had a path after the scheme, e.g. `amora://profile`). Giving it a
      // real path makes it an unambiguous, launchable deep link the same
      // way. `sso-callback` MUST be a real route (src/app/sso-callback.tsx)
      // — confirmed live 2026-09-16 that on this Android setup, expo-router
      // DOES see this redirect navigate (in addition to, not instead of,
      // expo-web-browser's own pending-session listener resolving this same
      // startSSOFlow() call below), and with no matching route it showed
      // Router's built-in "Unmatched Route" error screen for what was
      // actually a successful sign-in.
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'sso-callback' });
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl,
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        goToAppOrOnboarding();
      } else if (authSessionResult?.type === 'success') {
        // The OAuth round-trip succeeded but Clerk didn't issue a session —
        // happens when the account needs extra info a pure SSO flow can't
        // supply. Any other authSessionResult type ('cancel'/'dismiss') just
        // means the user backed out of the browser sheet, which needs no
        // message at all — same as dismissing a native picker.
        showAlert(t('auth.almostThereTitle'), t('auth.almostThereGoogleBody'));
      }
    } catch (err) {
      showAlert(t('auth.googleFailedTitle'), err instanceof Error ? err.message : t('common.error'));
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleForgotPassword() {
    setStep('forgotPassword');
  }

  // Swapping mode mid-flow (or backing out of the modal) leaves behind a
  // half-finished SignUp/SignIn attempt otherwise — reset() clears Clerk's
  // local state for it without an API round-trip (see the type's own doc).
  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setStep('form');
    setPassword('');
    setCode('');
    void signIn.reset();
    void signUp.reset();
  }

  if (step === 'forgotPassword') {
    return (
      <ForgotPasswordFlow
        signIn={signIn}
        initialEmail={email}
        onClose={() => setStep('form')}
        onDone={goToAppOrOnboarding}
      />
    );
  }

  if (step === 'verify') {
    return (
      <VerifyEmailStep
        email={email}
        code={code}
        onChangeCode={setCode}
        onVerify={handleVerifyCode}
        onResend={handleResendCode}
        onClose={() => switchMode('signup')}
        isVerifying={signUpStatus === 'fetching'}
      />
    );
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <IconButton name="close" onPress={() => router.back()} />

          <View style={styles.brandBlock}>
            <Icon name="heart" size={34} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>
              {isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.inkFaint }]}>
              {isLogin ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
            </Text>
          </View>

          <SegmentToggle
            fullWidth
            value={mode}
            onChange={(k) => switchMode(k as 'login' | 'signup')}
            options={[
              { key: 'login', label: t('auth.logIn') },
              { key: 'signup', label: t('auth.signUp') },
            ]}
          />

          <View style={styles.fields}>
            <GlassCard radius={16} style={styles.inputRow}>
              <Icon name="mail" size={16} color={theme.inkFaint} strokeWidth={1.8} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={theme.inkFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                style={[styles.input, { color: theme.ink }]}
              />
            </GlassCard>
            <GlassCard radius={16} style={styles.inputRow}>
              <Icon name="lock" size={16} color={theme.inkFaint} strokeWidth={1.8} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.inkFaint}
                secureTextEntry
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                textContentType={isLogin ? 'password' : 'newPassword'}
                style={[styles.input, { color: theme.ink }]}
              />
            </GlassCard>
            {isLogin ? (
              <Text style={[styles.forgot, { color: theme.accent2 }]} onPress={handleForgotPassword}>
                {t('auth.forgotPassword')}
              </Text>
            ) : null}
          </View>

          <GradientButton
            label={
              isSubmitting
                ? isLogin
                  ? t('auth.loggingIn')
                  : t('auth.signingUp')
                : isLogin
                  ? t('auth.logIn')
                  : t('auth.signUp')
            }
            onPress={handleAuthSubmit}
            disabled={isSubmitting || email.length === 0 || password.length === 0}
          />

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.glassBorder }]} />
            <Text style={[styles.dividerText, { color: theme.inkFaint }]}>{t('auth.orContinueWith')}</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.glassBorder }]} />
          </View>

          <View style={styles.socialBlock}>
            <Pressable onPress={() => handleSocialAuth('Google')} disabled={isSubmitting}>
              <GlassCard radius={16} style={[styles.socialButton, isSubmitting && styles.disabled]}>
                <Text style={[styles.socialLabel, { color: theme.inkSoft }]}>
                  {googleLoading ? t('auth.continuing') : t('auth.continueWithGoogle')}
                </Text>
              </GlassCard>
            </Pressable>
            <Pressable onPress={() => handleSocialAuth('Apple')} disabled={isSubmitting}>
              <GlassCard radius={16} style={[styles.socialButton, isSubmitting && styles.disabled]}>
                <Text style={[styles.socialLabel, { color: theme.inkSoft }]}>{t('auth.continueWithApple')}</Text>
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.spacer} />

          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: theme.inkFaint }]}>
              {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
            </Text>
            <Text style={[styles.footerLink, { color: theme.accent2 }]} onPress={() => switchMode(isLogin ? 'signup' : 'login')}>
              {isLogin ? t('auth.signUp') : t('auth.logIn')}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}
