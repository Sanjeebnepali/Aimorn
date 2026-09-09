import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ProfileStepProps = {
  name: string;
  onChangeName: (name: string) => void;
  avatarUri: string;
  onPickAvatar: () => void;
  onContinue: () => void;
};

/**
 * Step 1 of onboarding: the name + photo a brand-new signup never provided
 * at signup time (the auth screen only ever collects email/password) — so
 * this is the first point anywhere in the app a real display name exists.
 */
export function ProfileStep({ name, onChangeName, avatarUri, onPickAvatar, onContinue }: ProfileStepProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <Icon name="heart" size={34} color={theme.accent1} />
            <Text style={[styles.headline, { color: theme.ink }]}>{t('onboarding.profile.welcome')}</Text>
            <Text style={[styles.subtitle, { color: theme.inkFaint }]}>{t('onboarding.profile.subtitle')}</Text>
          </View>

          <View style={styles.spacer} />

          <Pressable onPress={onPickAvatar} style={styles.avatarWrap}>
            <Image
              source={{ uri: avatarUri }}
              style={[styles.avatar, { borderColor: theme.glassBorder }]}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient colors={[theme.accent1, theme.accent2]} style={[styles.avatarBadge, { borderColor: theme.bg2 }]}>
              <Icon name="camera" size={15} color={theme.ink} strokeWidth={2} />
            </LinearGradient>
          </Pressable>

          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder={t('onboarding.profile.namePlaceholder')}
            placeholderTextColor={theme.inkFaint}
            autoCapitalize="words"
            autoComplete="name"
            style={[styles.nameInput, { color: theme.ink, borderColor: theme.glassBorder }]}
          />

          <View style={styles.spacer} />

          <GradientButton label={t('onboarding.profile.continue')} onPress={onContinue} disabled={name.trim().length === 0} />
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // paddingBottom: real device testing (2026-09-07) found this screen's
  // "Continue" — the very last element, right against this padding — sitting
  // inside a bottom-edge touch-interception zone on real devices with
  // aggressive system gesture-navigation overlays (see floating-tab-bar.tsx
  // for the fuller story and how this was actually confirmed, not guessed).
  // Extra clearance here is the same fix applied there.
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 60 },
  brandBlock: { alignItems: 'center', gap: 10 },
  headline: { fontFamily: fonts.display, fontSize: 23 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
  spacer: { flex: 1 },
  avatarWrap: { alignSelf: 'center', marginBottom: 20 },
  avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 3.5 },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    borderBottomWidth: 1.5,
    paddingVertical: 12,
    marginHorizontal: 24,
  },
});
