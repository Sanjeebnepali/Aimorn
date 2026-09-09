import { useAuth, useClerk, useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon, type IconName } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { ThemeSwatch } from '@/components/primitives/theme-swatch';
import { useCoupleStore } from '@/couple/store';
import { useProfileStore } from '@/profile/store';
import { useThemeStore } from '@/theme/store';
import { fonts, THEME_OPTIONS } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { pickImageSafely } from '@/utils/native-media';

type SettingsRowItem = { icon: IconName; label: string; danger?: boolean; actionKey: string };

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const benefits = t('profile.benefits', { returnObjects: true }) as string[];
  const activeTheme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const avatarUri = useProfileStore((s) => s.avatarUri);
  const setAvatarUri = useProfileStore((s) => s.setAvatarUri);
  // Real pairing state — bootstrap.ts (src/couple/bootstrap.ts) already
  // keeps this hydrated from GET /couple on sign-in, same store the Couple
  // tab reads. Replaces what used to be a hardcoded "Paired with Jamie".
  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const partner = useCoupleStore((s) => s.partner);

  // isSignedIn starts `undefined` for one tick while Clerk restores a cached
  // session from expo-secure-store — treated as signed-out here so the
  // screen never flashes a stale/fake identity before that resolves.
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  const displayName = isSignedIn
    ? (user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? t('profile.amoraUser'))
    : t('profile.guest');
  const displayHandle = isSignedIn
    ? (user?.username ? `@${user.username}` : (user?.primaryEmailAddress?.emailAddress ?? ''))
    : t('profile.signInToSync');

  // Declared inside the component (rather than module scope, like before)
  // because the last row's label/styling now depends on live auth state.
  const SETTINGS_ROWS: SettingsRowItem[] = [
    { icon: 'sparkleDouble', label: t('profile.settings.myPosts'), actionKey: 'myPosts' },
    { icon: 'shield', label: t('profile.settings.security'), actionKey: 'security' },
    { icon: 'bell', label: t('profile.settings.notifications'), actionKey: 'notifications' },
    { icon: 'lock', label: t('profile.settings.privacy'), actionKey: 'privacy' },
    { icon: 'globe', label: t('profile.settings.language'), actionKey: 'language' },
    { icon: 'help', label: t('profile.settings.help'), actionKey: 'help' },
    { icon: 'logout', label: isSignedIn ? t('profile.settings.signOut') : t('auth.logIn'), danger: !!isSignedIn, actionKey: 'logout' },
  ];

  async function handlePickAvatar() {
    const pickedUri = await pickImageSafely();
    if (pickedUri) {
      setAvatarUri(pickedUri);
      showAlert(t('profile.avatarUpdatedTitle'), t('profile.avatarUpdatedBody'));
    }
  }

  // In-app purchases need real store-side product setup (App Store Connect /
  // Play Console) that doesn't exist yet — the trial CTA says so honestly
  // instead of claiming a purchase went through.
  function handleUpgrade() {
    showAlert(t('profile.premiumAlertTitle'), t('profile.premiumAlertBody'), [
      { text: t('profile.notNow'), style: 'cancel' },
      {
        text: t('profile.startTrial'),
        onPress: () => showAlert(t('common.comingSoon'), t('profile.inAppPurchasesPreview')),
      },
    ]);
  }

  // Most of these rows still have no real destination (no notifications
  // backend, no settings sub-screens) — say so honestly rather than
  // claiming they're "enabled" or "configured". Sign in/out is now real.
  function handleSettingsAction(row: SettingsRowItem) {
    if (row.actionKey === 'myPosts') {
      router.push('/manage-posts');
      return;
    }
    if (row.actionKey === 'language') {
      router.push('/settings/language');
      return;
    }
    if (row.actionKey === 'logout') {
      if (!isSignedIn) {
        router.push('/auth');
        return;
      }
      showAlert(t('profile.signOutTitle'), t('profile.signOutBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.settings.signOut'),
          style: 'destructive',
          // Fire-and-forget: signOut() clears the session and the secure
          // token cache; useAuth's isSignedIn flips to false reactively
          // once that resolves, so there's nothing to update by hand here.
          onPress: () => void signOut(),
        },
      ]);
      return;
    }
    showAlert(row.label, t('profile.notConnectedYet', { label: row.label }));
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.ink }]}>{t('profile.title')}</Text>
            <View style={styles.headerActions}>
              {/* Same "+" Share Your Creation shortcut added to Home's
               * header (2026-09-08) — per explicit follow-up ask, it needed
               * to live here too, since Profile is where this whole request
               * started. Deliberately a separate icon from the camera below,
               * not a replacement: that one is specifically for your avatar
               * (device photo/camera via `handlePickAvatar`), this one is
               * specifically for sharing one of your own generated
               * creations (routes to create-post's own picker, which reads
               * from your real Gallery via `useGalleryStore` — never the
               * device photo library the avatar picker uses). */}
              <IconButton name="plus" onPress={() => router.push('/create-post')} />
              {/* Was a shield icon routing to "Account & Security" — a dead
               * end (`handleSettingsAction`'s fallback: "isn't connected yet").
               * Per explicit ask, the header's icon action is upload-a-photo
               * instead — the same `handlePickAvatar` the avatar itself and
               * the "Edit Profile" chip below already use, just also reachable
               * from the header. Security row stays put in the settings list
               * further down, still honestly labeled as not-yet-connected. */}
              <IconButton name="camera" onPress={handlePickAvatar} />
            </View>
          </View>

          <View style={styles.avatarBlock}>
            <Pressable onPress={handlePickAvatar}>
              <Image
                source={{ uri: avatarUri }}
                style={[styles.avatar, { borderColor: theme.glassBorder }]}
                contentFit="cover"
                transition={200}
              />
              <LinearGradient colors={[theme.accent1, theme.accent2]} style={[styles.avatarBadge, { borderColor: theme.bg2 }]}>
                <Icon name="camera" size={13} color={theme.ink} strokeWidth={2} />
              </LinearGradient>
            </Pressable>
            <Text style={[styles.name, { color: theme.ink }]}>{displayName}</Text>
            <Text style={[styles.handle, { color: theme.inkFaint }]}>{displayHandle}</Text>
            <Chip
              label={isSignedIn ? t('profile.editProfile') : t('profile.signIn')}
              onPress={isSignedIn ? handlePickAvatar : () => router.push('/auth')}
            />
          </View>

          <View style={styles.statsRow}>
            <GlassCard radius={16} style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.ink }]}>18</Text>
              <Text style={[styles.statLabel, { color: theme.inkFaint }]}>{t('profile.wallpapers')}</Text>
            </GlassCard>
            <GlassCard radius={16} style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.ink }]}>6</Text>
              <Text style={[styles.statLabel, { color: theme.inkFaint }]}>{t('profile.creditsLeft')}</Text>
            </GlassCard>
            <GlassCard radius={16} style={styles.statCard}>
              <Icon
                name={hasPartner ? 'check' : 'couple'}
                size={16}
                color={hasPartner ? theme.accent2 : theme.inkFaint}
                strokeWidth={2.6}
              />
              <Text style={[styles.statLabel, { color: theme.inkFaint }]}>
                {hasPartner ? t('profile.paired') : t('profile.notPaired')}
              </Text>
            </GlassCard>
          </View>

          {/* Real pairing state now (see useCoupleStore above) — tapping
           * routes to setup (link up) or the live dashboard depending on
           * whether this account is paired yet, same as Gallery's identical
           * banner. There's no bare "/couple" route to push to directly —
           * only setup/dashboard/linking/preview exist under it — so the
           * plain `router.push('/couple')` this used to call went nowhere
           * (caught by `tsc`, not just observed live: it isn't a valid
           * typed route at all). */}
          <Pressable onPress={() => router.push(hasPartner ? '/couple/dashboard' : '/couple/setup')}>
            <GlassCard radius={20} style={styles.partnerCard}>
              <View style={[styles.partnerIconWrap, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
                <Icon name="couple" size={20} color={theme.accent2} strokeWidth={1.8} />
              </View>
              <View style={styles.partnerText}>
                <Text style={[styles.partnerName, { color: theme.ink }]}>
                  {hasPartner
                    ? t('profile.pairedWith', { name: partner?.displayName ?? t('profile.defaultPartner') })
                    : t('profile.notPairedYet')}
                </Text>
                <Text style={[styles.partnerHint, { color: theme.inkFaint }]}>
                  {hasPartner ? t('profile.pairedHint') : t('profile.notPairedHint')}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={theme.inkFaint} strokeWidth={2} />
            </GlassCard>
          </Pressable>

          <GlassCard radius={22} style={styles.premiumCard}>
            <View style={styles.premiumHeader}>
              <LinearGradient colors={[theme.accent2, theme.accent1]} style={styles.premiumIcon}>
                <Icon name="crown" size={17} color={theme.ink} strokeWidth={1.9} />
              </LinearGradient>
              <Text style={[styles.premiumTitle, { color: theme.ink }]}>{t('profile.premiumTitle')}</Text>
            </View>
            <View style={styles.benefitList}>
              {benefits.map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <Icon name="check" size={14} color={theme.accent2} strokeWidth={2.6} />
                  <Text style={[styles.benefitText, { color: theme.inkSoft }]}>{b}</Text>
                </View>
              ))}
            </View>
            <GradientButton label={t('profile.upgrade')} onPress={handleUpgrade} />
          </GlassCard>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('profile.appearance')}</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.inkFaint }]}>{t('profile.appearanceSubtitle')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeRail}>
              {THEME_OPTIONS.map((themeOpt) => (
                <ThemeSwatch
                  key={themeOpt.id}
                  themeName={themeOpt.id}
                  label={t(themeOpt.labelKey)}
                  active={themeOpt.id === activeTheme}
                  onPress={() => setTheme(themeOpt.id)}
                />
              ))}
            </ScrollView>
          </View>

          <GlassCard radius={20} style={styles.settingsCard}>
            {SETTINGS_ROWS.map((row, i) => (
              <Pressable
                key={row.label}
                onPress={() => handleSettingsAction(row)}
                style={[
                  styles.settingsRow,
                  i < SETTINGS_ROWS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.glassBorder },
                ]}>
                <View style={[styles.settingsIconWrap, { backgroundColor: theme.glass }]}>
                  <Icon name={row.icon} size={15} color={row.danger ? theme.accent1 : theme.inkSoft} strokeWidth={1.8} />
                </View>
                <Text
                  style={[
                    styles.settingsLabel,
                    { color: row.danger ? theme.accent1 : theme.ink, fontFamily: row.danger ? fonts.bodyBold : fonts.bodySemiBold },
                  ]}>
                  {row.label}
                </Text>
                {row.danger ? null : <Icon name="chevronRight" size={15} color={theme.inkFaint} strokeWidth={2} />}
              </Pressable>
            ))}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 165, gap: 26 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 26 },
  avatarBlock: { alignItems: 'center', gap: 12, marginVertical: 6 },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 3.5 },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.display, fontSize: 20 },
  handle: { fontFamily: fonts.body, fontSize: 13.5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: fonts.bodyExtraBold, fontSize: 17 },
  statLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  partnerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  partnerIconWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  partnerText: { flex: 1, gap: 3 },
  partnerName: { fontFamily: fonts.bodyBold, fontSize: 14 },
  partnerHint: { fontFamily: fonts.body, fontSize: 13 },
  premiumCard: { padding: 20, gap: 16 },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  premiumIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  premiumTitle: { fontFamily: fonts.display, fontSize: 18 },
  benefitList: { gap: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontFamily: fonts.body, fontSize: 13 },
  section: { gap: 6, marginTop: 4 },
  modeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  sectionSubtitle: { fontFamily: fonts.body, fontSize: 13.5 },
  themeRail: { gap: 16, paddingTop: 12, paddingHorizontal: 2 },
  settingsCard: { paddingHorizontal: 16, marginTop: 6 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  settingsIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { flex: 1, fontSize: 14 },
});
