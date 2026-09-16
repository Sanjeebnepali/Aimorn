import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { getBackgroundLocationPermissionStatus } from '@/couple/location';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

// The real, live-published legal docs (see legal/*.md — this repo's own
// source of truth) — deployed to Vercel 2026-09-15 after GitHub Pages never
// actually came up (see that session's own notes). Confirmed live 2026-09-16
// that NOTHING in the app linked to either of these from anywhere a real
// user could find them — Play/Apple both require an in-app-reachable
// privacy policy, not just one buried in the store listing.
const PRIVACY_POLICY_URL = 'https://docs-eight-amber-72.vercel.app/privacy-policy.html';
const TERMS_URL = 'https://docs-eight-amber-72.vercel.app/terms-of-service.html';

type LocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unknown';

/**
 * Profile → Privacy & Location — replaces the old dead-placeholder alert.
 * Two real, honest halves: links to the actual published legal docs (the
 * missing piece — the couple feature's own location disclosure already
 * exists and is real, see locationConsent.ts's showLocationDisclosure), and
 * a live read of this device's current location permission grant with a
 * path to change it. Doesn't duplicate locationConsent.ts's gated
 * request-with-disclosure flow (that's still the only path that actually
 * REQUESTS background location, matching Play/Apple's "ask in context"
 * requirement) — this screen only surfaces the legal docs and the current
 * status/a way to open OS settings, same "review, don't re-request" shape
 * as Notifications' own settings screen.
 */
export default function PrivacySettingsScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('unknown');

  useEffect(() => {
    getBackgroundLocationPermissionStatus()
      .then(setLocationStatus)
      .catch(() => {
        // Best-effort — the status line just stays hidden/unknown, same
        // "degrade, don't blank" reasoning as this app's other settings reads.
      });
  }, []);

  const statusLabel =
    locationStatus === 'granted'
      ? t('profile.privacy.locationGranted')
      : locationStatus === 'foreground-only'
        ? t('profile.privacy.locationForegroundOnly')
        : locationStatus === 'denied'
          ? t('profile.privacy.locationDenied')
          : null;

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('profile.settings.privacy')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.list}>
          <Text style={[styles.sectionLabel, { color: theme.inkFaint }]}>{t('profile.privacy.legalSection')}</Text>

          <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <GlassCard radius={radii.lg} style={styles.row}>
              <Icon name="lock" size={18} color={theme.accent1} />
              <Text style={[styles.rowLabel, { color: theme.ink, flex: 1 }]}>{t('profile.privacy.privacyPolicy')}</Text>
              <Icon name="chevronRight" size={16} color={theme.inkFaint} />
            </GlassCard>
          </Pressable>

          <Pressable onPress={() => void Linking.openURL(TERMS_URL)}>
            <GlassCard radius={radii.lg} style={styles.row}>
              <Icon name="sparkle" size={18} color={theme.accent1} />
              <Text style={[styles.rowLabel, { color: theme.ink, flex: 1 }]}>{t('profile.privacy.termsOfService')}</Text>
              <Icon name="chevronRight" size={16} color={theme.inkFaint} />
            </GlassCard>
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.inkFaint, marginTop: 24 }]}>
            {t('profile.privacy.locationSection')}
          </Text>
          <Text style={[styles.notice, { color: theme.inkFaint }]}>{t('profile.privacy.locationExplainer')}</Text>
          {statusLabel && (
            <Text style={[styles.statusLine, { color: locationStatus === 'granted' ? theme.accent1 : theme.inkFaint }]}>
              {statusLabel}
            </Text>
          )}
          <Pressable onPress={() => void Linking.openSettings()}>
            <GlassCard radius={radii.lg} style={styles.row}>
              <Icon name="chevronRight" size={18} color={theme.accent1} />
              <Text style={[styles.rowLabel, { color: theme.ink, flex: 1 }]}>
                {t('profile.privacy.openLocationSettings')}
              </Text>
            </GlassCard>
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  title: { fontFamily: fonts.bodyExtraBold, fontSize: 18, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  notice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  statusLine: { fontFamily: fonts.bodyBold, fontSize: 12, marginBottom: 6 },
});
