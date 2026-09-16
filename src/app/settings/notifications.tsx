import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { IconButton } from '@/components/primitives/icon-button';
import { registerForPushNotifications, tryLoadNotifications } from '@/notifications/register';
import { fonts, radii } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';

/**
 * Profile → Notifications — replaces the old dead-placeholder alert
 * ("isn't connected yet — this build is a preview"). A real preference,
 * backed by User.notificationsEnabled (server), separate from the OS-level
 * permission: turning this off mutes pushes for the account without
 * revoking OS permission entirely, and turning it on doesn't itself grant
 * OS permission if that was previously denied — Android/iOS both refuse to
 * re-prompt once denied once, so that case links out to the system
 * settings page instead of silently doing nothing.
 */
export default function NotificationsSettingsScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();

  const [enabled, setEnabled] = useState(true);
  const [osGranted, setOsGranted] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // tryLoadNotifications() returns null instead of throwing when
        // expo-notifications' native module isn't built into this APK yet
        // (see register.ts's own doc comment on why a plain static import
        // can't be used here at all) — osGranted just stays at its default
        // (true) in that case, same "degrade, don't blank" reasoning as
        // every other best-effort read in this app.
        const Notifications = tryLoadNotifications();
        const [profile, perms] = await Promise.all([
          api.getProfile(),
          Notifications ? Notifications.getPermissionsAsync() : null,
        ]);
        setEnabled(profile.notificationsEnabled ?? true);
        if (perms) setOsGranted(perms.status === 'granted');
      } catch {
        // Best-effort — the toggle just stays at its default (on) until the
        // next open, same "degrade, don't blank" reasoning as this app's
        // other settings reads.
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setBusy(true);
    try {
      if (next && !osGranted) {
        // Re-requesting after a prior denial is a silent no-op on both
        // platforms (confirmed against Android's and iOS's own permission
        // docs) — the system settings screen is the only real path back.
        showAlert(
          t('profile.notifications.permissionNeededTitle'),
          t('profile.notifications.permissionNeededBody'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => setEnabled(false) },
            { text: t('profile.notifications.openSettings'), onPress: () => void Linking.openSettings() },
          ],
        );
        setBusy(false);
        return;
      }
      await api.updateNotificationSettings(next);
      if (next) {
        // Turning this on is also the natural moment to (re)request OS
        // permission and refresh this device's token — covers the "never
        // asked yet" first-time case, not just a previously-granted one.
        await registerForPushNotifications(api);
        const Notifications = tryLoadNotifications();
        const perms = await Notifications?.getPermissionsAsync();
        if (perms) setOsGranted(perms.status === 'granted');
      }
    } catch (err) {
      setEnabled(!next);
      showAlert(t('common.error'), err instanceof Error ? err.message : t('profile.notifications.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('profile.settings.notifications')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.list}>
          <GlassCard radius={radii.lg} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t('profile.notifications.pushTitle')}</Text>
              <Text style={[styles.rowSublabel, { color: theme.inkFaint }]}>
                {t('profile.notifications.pushBody')}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(v) => void handleToggle(v)}
              disabled={!loaded || busy}
              trackColor={{ true: theme.accent1 }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </GlassCard>

          {!osGranted && (
            <Text style={[styles.notice, { color: theme.inkFaint }]}>
              {t('profile.notifications.osBlockedNotice')}
            </Text>
          )}

          <Text style={[styles.notice, { color: theme.inkFaint }]}>{t('profile.notifications.whatYouGet')}</Text>
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
  list: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSublabel: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  notice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
