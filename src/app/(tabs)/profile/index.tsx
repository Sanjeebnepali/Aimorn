import { useAuth, useClerk, useUser } from '@clerk/expo';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/alerts/store';
import { Chip } from '@/components/primitives/chip';
import { GlassCard } from '@/components/primitives/glass-card';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon, type IconName } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { ThemeSwatch } from '@/components/primitives/theme-swatch';
import { useCoupleStore } from '@/couple/store';
import { useProfileStore } from '@/profile/store';
import { useThemeStore } from '@/theme/store';
import { fonts, THEME_OPTIONS } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { useApi } from '@/utils/api';
import { pickImageSafely } from '@/utils/native-media';
import { PaywallModal } from '@/components/paywall/paywall-modal';
import { BannerAdView } from '@/components/ads/banner-ad-view';
import { styles } from '@/components/profile/styles';

type SettingsRowItem = { icon: IconName; label: string; danger?: boolean; actionKey: string };

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
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
  const { isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Real numbers for the stat row below — added 2026-09-11. Before this,
  // "18 Wallpapers" and "6 Credits Left" were literal hardcoded strings that
  // never moved no matter how much was actually generated or spent; only
  // the "Paired"/"Not Paired" card was ever wired to real state. Fetched on
  // every focus (not just mount) so generating a wallpaper, then coming
  // back to Profile, shows the count going up immediately rather than
  // whatever was true when the tab was first opened this session.
  const api = useApi();
  const [stats, setStats] = useState<{ generationCount: number; credits: number; points: number } | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!isSignedIn) return;
      api
        .getProfile()
        .then((p) => setStats({ generationCount: p.generationCount, credits: p.credits, points: p.points }))
        .catch(() => {
          // Offline/transient — leave whatever was already on screen (or
          // the "—" placeholder below) rather than showing a wrong number.
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSignedIn]),
  );

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
    { icon: 'sparkle', label: t('profile.settings.about'), actionKey: 'about' },
    // Reachable only when signed in as the app owner's own account (see
    // admin/broadcast.tsx's own ADMIN_USER_ID doc comment) — real users
    // never see this row at all, rather than seeing a feature that 403s.
    ...(userId === 'user_3Io0RPzPfuxr3LtBs9RhwPRcU2k'
      ? [{ icon: 'mail', label: 'Send Announcement', actionKey: 'broadcast' } as SettingsRowItem]
      : []),
    { icon: 'logout', label: isSignedIn ? t('profile.settings.signOut') : t('auth.logIn'), danger: !!isSignedIn, actionKey: 'logout' },
    // Only shown once signed in — deleting an account you're not signed
    // into makes no sense, and the server route requires a real session
    // anyway (see accountDelete.ts's requireUser). Deliberately the LAST
    // row, same "most destructive action sits furthest from an accidental
    // tap" placement as Sign Out already had before this was added.
    ...(isSignedIn ? [{ icon: 'trash', label: t('profile.settings.deleteAccount'), danger: true, actionKey: 'deleteAccount' } as SettingsRowItem] : []),
  ];

  async function handlePickAvatar() {
    const pickedUri = await pickImageSafely();
    if (pickedUri) {
      setAvatarUri(pickedUri);
      showAlert(t('profile.avatarUpdatedTitle'), t('profile.avatarUpdatedBody'));
    }
  }

  // Most of these rows still have no real destination (no notifications
  // backend, no settings sub-screens) — say so honestly rather than
  // claiming they're "enabled" or "configured". Sign in/out is now real.
  function handleSettingsAction(row: SettingsRowItem) {
    if (row.actionKey === 'myPosts') {
      router.push('/manage-posts');
      return;
    }
    if (row.actionKey === 'about') {
      router.push('/about');
      return;
    }
    if (row.actionKey === 'deleteAccount') {
      router.push('/delete-account');
      return;
    }
    if (row.actionKey === 'language') {
      router.push('/settings/language');
      return;
    }
    if (row.actionKey === 'notifications') {
      router.push('/settings/notifications');
      return;
    }
    if (row.actionKey === 'privacy') {
      router.push('/settings/privacy');
      return;
    }
    if (row.actionKey === 'broadcast') {
      router.push('/admin/broadcast');
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
              <Text style={[styles.statValue, { color: theme.ink }]}>{stats ? stats.generationCount : '—'}</Text>
              <Text style={[styles.statLabel, { color: theme.inkFaint }]}>{t('profile.wallpapers')}</Text>
            </GlassCard>
            <Pressable style={{ flex: 1 }} onPress={() => setPaywallVisible(true)}>
              <GlassCard radius={16} style={styles.statCard}>
                <Text style={[styles.statValue, { color: theme.accent1 }]}>{stats ? stats.credits : '—'}</Text>
                <Text style={[styles.statLabel, { color: theme.accent1 }]}>{t('profile.creditsLeft')} ⚡</Text>
              </GlassCard>
            </Pressable>
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

          {/* Points earned from the community (see server/src/routes/
           * generations.ts's awardPointsForRegeneration — 100 regenerations
           * of one of your posts = 1 point) redeem 1:1 into spendable
           * credits on tap. Only shown once there's something to redeem —
           * a permanent "0" row for every account that's never been
           * recreated by anyone would just be dead weight on the screen. */}
          {stats && stats.points > 0 ? (
            <Pressable
              onPress={async () => {
                try {
                  const result = await api.redeemPoints();
                  setStats((s) => (s ? { ...s, credits: result.credits, points: result.points } : s));
                  showAlert(t('profile.pointsRedeemedTitle'), t('profile.pointsRedeemedBody', { count: result.credits - (stats?.credits ?? 0) }));
                } catch (err) {
                  showAlert(t('profile.pointsRedeemFailedTitle'), err instanceof Error ? err.message : t('profile.pointsRedeemFailedBody'));
                }
              }}
            >
              <GlassCard radius={18} style={styles.pointsCard}>
                <View style={[styles.pointsIconWrap, { backgroundColor: theme.glass }]}>
                  <Icon name="sparkle" size={18} color={theme.accent1} strokeWidth={1.8} />
                </View>
                <View style={styles.partnerText}>
                  <Text style={[styles.partnerName, { color: theme.ink }]}>
                    {t('profile.pointsEarned', { count: stats.points })}
                  </Text>
                  <Text style={[styles.partnerHint, { color: theme.inkFaint }]}>{t('profile.pointsRedeemHint')}</Text>
                </View>
                <Icon name="chevronRight" size={16} color={theme.inkFaint} strokeWidth={2} />
              </GlassCard>
            </Pressable>
          ) : null}

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

          <BannerAdView onPressCta={() => setPaywallVisible(true)} />

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

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={(updated) => {
          setStats((prev) => (prev ? { ...prev, credits: updated.credits, points: updated.points } : null));
        }}
      />
    </GradientScreen>
  );
}
