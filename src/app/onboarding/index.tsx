import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { CodeStep } from '@/components/onboarding/code-step';
import { ProfileStep } from '@/components/onboarding/profile-step';
import { StyleStep } from '@/components/onboarding/style-step';
import { useOnboardingStore } from '@/onboarding/store';
import { useProfileStore } from '@/profile/store';
import { pickImageSafely } from '@/utils/native-media';
import { useApi, type ProfileResponse, type UsageMode } from '@/utils/api';

type Step = 'profile' | 'style' | 'code';

/**
 * The post-signup, pre-app onboarding flow — three steps (name/photo, a
 * style+usage survey, personal + partner codes) that run once per account
 * (see useOnboardingStore) before src/app/_layout.tsx's Stack.Protected
 * guard lets a signed-in user reach the main tabs. Kept as one file per
 * the auth screen's pattern (src/app/auth/index.tsx): this component owns
 * all the state and handlers, each step is a dumb presentational component.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user } = useUser();
  const api = useApi();
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const setAvatarUri = useProfileStore((s) => s.setAvatarUri);
  const markCompleted = useOnboardingStore((s) => s.markCompleted);

  const [step, setStep] = useState<Step>('profile');
  const [name, setName] = useState(user?.fullName ?? '');
  const [stylePreference, setStylePreference] = useState<string | null>(null);
  const [usageMode, setUsageMode] = useState<UsageMode>('SOLO');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [partnerCodeInput, setPartnerCodeInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  async function handlePickAvatar() {
    const pickedUri = await pickImageSafely();
    if (pickedUri) setAvatarUri(pickedUri);
  }

  // Splits "Jane Doe" into first/last for Clerk's own profile — Profile
  // tab (src/app/(tabs)/profile/index.tsx) reads `user.fullName` from
  // Clerk directly, so this is what makes the name typed here actually
  // show up there afterward, not just sit in our own server's database.
  async function syncNameToClerk(fullName: string) {
    if (!user) return;
    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    try {
      await user.update({ firstName, lastName: rest.join(' ') || undefined });
    } catch {
      // Non-fatal — our own server's displayName (set below) still gets
      // saved either way, this only affects what the Profile tab shows.
    }
  }

  async function submitOnboarding() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.submitOnboarding({
        displayName: name.trim(),
        stylePreference: stylePreference!,
        usageMode,
      });
      setProfile(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('onboarding.couldntReachServer'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStyleContinue() {
    setStep('code');
    await syncNameToClerk(name.trim());
    await submitOnboarding();
  }

  async function handleRedeemPartnerCode() {
    setIsRedeeming(true);
    try {
      const result = await api.redeemPairingCode(partnerCodeInput.trim());
      setProfile(result);
      showAlert(t('onboarding.pairedAlertTitle'), t('onboarding.pairedAlertBody'));
    } catch (err) {
      showAlert(t('onboarding.couldntLinkTitle'), err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsRedeeming(false);
    }
  }

  function handleShareCode() {
    if (!profile?.pairingCode) return;
    void Share.share({ message: t('onboarding.shareCodeMessage', { code: profile.pairingCode }) });
  }

  function handleFinish() {
    if (user?.id) markCompleted(user.id);
    router.replace('/(tabs)');
  }

  if (step === 'profile') {
    return (
      <ProfileStep
        name={name}
        onChangeName={setName}
        avatarUri={avatarUri}
        onPickAvatar={handlePickAvatar}
        onContinue={() => setStep('style')}
      />
    );
  }

  if (step === 'style') {
    return (
      <StyleStep
        stylePreference={stylePreference}
        onChangeStyle={setStylePreference}
        usageMode={usageMode}
        onChangeUsageMode={setUsageMode}
        onContinue={handleStyleContinue}
      />
    );
  }

  return (
    <CodeStep
      isLoading={isSubmitting}
      errorMessage={submitError}
      onRetry={submitOnboarding}
      profile={profile}
      onShareCode={handleShareCode}
      partnerCodeInput={partnerCodeInput}
      onChangePartnerCodeInput={setPartnerCodeInput}
      onRedeemPartnerCode={handleRedeemPartnerCode}
      isRedeeming={isRedeeming}
      onFinish={handleFinish}
    />
  );
}
