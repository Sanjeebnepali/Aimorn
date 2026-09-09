import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GradientButton } from '@/components/primitives/gradient-button';
import { GradientScreen } from '@/components/primitives/gradient-screen';
import { useAppTheme } from '@/theme/use-app-theme';
import { CoupleActiveWallpaperCard } from '../../components/coupleDashboard/CoupleActiveWallpaperCard';
import { CoupleDashboardControls } from '../../components/coupleDashboard/CoupleDashboardControls';
import { CoupleDashboardHeader } from '../../components/coupleDashboard/CoupleDashboardHeader';
import { CoupleDiagnostics } from '../../components/coupleDashboard/CoupleDiagnostics';
import { CouplePackPicker } from '../../components/coupleDashboard/CouplePackPicker';
import { CouplePartnerCard } from '../../components/coupleDashboard/CouplePartnerCard';
import { styles } from '../../components/coupleDashboard/styles';
import {
  emojiForRole,
  getCouplePack,
  labelForRole,
  pickImageForState,
} from '../../couple/packs';
import { formatDistance, formatRelative } from '../../couple/format';
import {
  startCoupleLiveTracking,
  stopCoupleLiveTracking,
} from '../../couple/liveTracking';
import { useCoupleDashboardActions } from '../../couple/useCoupleDashboardActions';
import {
  useCoupleDistance,
  useCouplePackId,
  useCouplePaused,
  useCoupleProximity,
  useCoupleStore,
  useMyRole,
} from '../../couple/store';

/**
 * Couple Dashboard — main connected view.
 *
 * Rewired onto `@/couple/*` (real Neon-backed state) instead of the fake
 * Supabase stub — see `src/app/couple/setup.tsx`'s doc comment for the full
 * story. Two model differences that show up here specifically:
 *
 *   - No `link` object with a `code`/`status` — the real store is flat
 *     (`hasPartner`, `partner`, `myRole`, `partnerRole` directly), reflecting
 *     that pairing already happened by the time this state exists at all.
 *   - Mutations go through `useApi()` → `server/src/routes/couple.ts`.
 *     `unlinkCouple` is followed by `refreshCoupleState()` to pull the
 *     authoritative row back — it changes several fields at once (partner,
 *     role, coupleId) and a fresh GET is the simplest way to land on the
 *     correct "not linked" shape. The settings mutations (pack/pause) skip
 *     that extra round-trip and hand-patch the store straight from the
 *     PATCH response instead: unlike `setCoupleRole` (which really can 409
 *     if your partner already holds the side you picked, so needs a refetch
 *     to see the real outcome), `PATCH /couple/settings` can't be rejected —
 *     either partner may freely set pack/pause/threshold at any time — so
 *     its own response is already the authoritative post-write state.
 *
 * Re-themed 2026-09-08 onto Amora's real gradient-glass system — see
 * `couple/setup.tsx`'s doc comment for the full story. This file was also
 * split further while in here (header → `CoupleDashboardHeader.tsx`,
 * pause/GPS controls → `CoupleDashboardControls.tsx`, mutation handlers →
 * `couple/useCoupleDashboardActions.ts`) to bring it back under this
 * workspace's 350-line-per-file cap (it had drifted to 417 lines carrying
 * all of that inline). No behavior changed — see the doc comments on those
 * files for where each piece's original commentary now lives.
 */
export default function CoupleDashboard() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const hasPartner = useCoupleStore((s) => s.hasPartner);
  const partner = useCoupleStore((s) => s.partner);
  const myRole = useMyRole();
  const partnerRole = useCoupleStore((s) => s.partnerRole);
  const proximity = useCoupleProximity();
  const distanceM = useCoupleDistance();
  const paused = useCouplePaused();
  const packId = useCouplePackId();
  const partnerUpdatedAt = useCoupleStore((s) => s.partnerUpdatedAt);
  const error = useCoupleStore((s) => s.error);

  const activePack = useMemo(() => getCouplePack(packId), [packId]);

  // While this screen is focused, refresh our GPS + the partner's position
  // fast (Uber-style live distance) instead of the slow battery-saving
  // background cadence; revert on blur/unmount. Before the early return so the
  // hook order stays stable — the tracker itself no-ops when not linked.
  useFocusEffect(
    useCallback(() => {
      startCoupleLiveTracking();
      return () => stopCoupleLiveTracking();
    }, []),
  );

  const partnerName = partner?.displayName ?? t('profile.defaultPartner');
  const { busy, picking, onPickPack, onTogglePause, onMenu, onCheckPermission } = useCoupleDashboardActions({
    packId,
    paused,
    partnerId: partner?.id,
    partnerName,
  });

  const myRoleLabel = myRole ? labelForRole(activePack, myRole) : '—';
  const myRoleEmoji = myRole ? emojiForRole(activePack, myRole) : null;
  const partnerRoleLabel = partnerRole ? labelForRole(activePack, partnerRole) : '—';
  const partnerRoleEmoji = partnerRole ? emojiForRole(activePack, partnerRole) : null;

  const distanceLabel = useMemo(() => formatDistance(distanceM), [distanceM]);
  const proximityLabel =
    proximity === 'near' ? t('couple.dashboard.together') : proximity === 'far' ? t('couple.dashboard.apart') : '—';
  // near/far reuse the theme's own two accents (matches every other live
  // indicator in the app); unknown falls back to the muted ink tone rather
  // than a fixed grey so it still tracks the active palette.
  const proximityColor =
    proximity === 'near' ? theme.accent1 : proximity === 'far' ? theme.accent2 : theme.inkFaint;
  const lastUpdate = partnerUpdatedAt
    ? formatRelative(Date.now() - partnerUpdatedAt)
    : t('couple.dashboard.noDataYet');

  // What's actually applied right now: together image, or my-solo from
  // the pack. Drives the "Active wallpaper" card.
  const activeImage = useMemo(() => {
    if (!myRole) return null;
    return pickImageForState(
      activePack,
      myRole,
      proximity === 'near' ? 'near' : 'far',
    );
  }, [activePack, myRole, proximity]);

  // Rendered here (JSX-level), not as an early `return` above the hooks —
  // `hasPartner` can flip to false on a LIVE re-render of this same mounted
  // screen (the partner unlinks while you're looking at the dashboard; the
  // socket's 'unlinked' handler in couple/bootstrap.ts re-hydrates the
  // store). An early return positioned between hook calls would make React
  // call a different number of hooks across renders of the same instance —
  // "Rendered fewer hooks than during the previous render," a hard crash.
  // Every hook above (including the useCallback handlers below) must run
  // unconditionally on every render regardless of hasPartner.
  if (!hasPartner) {
    return (
      <GradientScreen>
        <SafeAreaView style={styles.fill} edges={['top']}>
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>{t('couple.dashboard.notLinkedYet')}</Text>
            <GradientButton
              label={t('couple.dashboard.openSetup')}
              fullWidth={false}
              onPress={() => router.replace('/couple/setup' as Href)}
            />
          </View>
        </SafeAreaView>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <StatusBar style="light" />

        <CoupleDashboardHeader
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/gallery' as Href))}
          onMenu={onMenu}
        />

        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <CouplePartnerCard
            partnerName={partnerName}
            partnerRoleEmoji={partnerRoleEmoji}
            myRoleEmoji={myRoleEmoji}
            myRoleLabel={myRoleLabel}
            partnerRoleLabel={partnerRoleLabel}
            proximityColor={proximityColor}
            proximityLabel={proximityLabel}
            distanceLabel={distanceLabel}
            lastUpdate={lastUpdate}
            paused={paused}
          />

          <CoupleDiagnostics />

          <CoupleActiveWallpaperCard
            activeImage={activeImage}
            activePack={activePack}
            myRoleLabel={myRoleLabel}
            onPreview={() => router.push('/couple/preview' as Href)}
          />

          <CouplePackPicker packId={packId} picking={picking} onPickPack={onPickPack} />

          <CoupleDashboardControls
            paused={paused}
            busy={busy}
            partnerName={partnerName}
            error={error}
            onTogglePause={onTogglePause}
            onCheckPermission={onCheckPermission}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}
