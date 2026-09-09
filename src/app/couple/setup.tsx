import { useAuth } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GradientScreen } from '@/components/primitives/gradient-screen';
import { Icon } from '@/components/primitives/icon';
import { IconButton } from '@/components/primitives/icon-button';
import { fonts } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { AcceptCard } from '../../components/coupleSetup/AcceptCard';
import { YourCodeCard } from '../../components/coupleSetup/YourCodeCard';
import { styles } from '../../components/coupleSetup/styles';
import { refreshCoupleState } from '../../couple/bootstrap';
import { useCoupleStore } from '../../couple/store';
import { requestCoupleLocationConsent } from '../../couple/locationConsent';
import { toast } from '../../lib/toast';
import { type CoupleRole, type ProfileResponse, useApi } from '../../utils/api';

/**
 * Couple Setup — generate OR accept.
 *
 * Rewired onto Amora's real backend (Express + Prisma + Neon — see
 * `docs/session-handoff-2026-09-03.md` and `server/src/routes/{profile,couple}.ts`),
 * replacing the donor app's Supabase calls (`lib/couple.ts`, now deleted).
 * The pairing MODEL is different, not just the transport, so this isn't a
 * pure import swap — see the inline notes below for what changed and why:
 *
 *   - Codes are permanent (minted once at onboarding, `POST /profile/onboarding`),
 *     not generated on demand — there is no "create" step, just "show my code."
 *   - Pairing (`POST /profile/pair`) takes no pack/role — those are chosen
 *     AFTER pairing via `PATCH /couple/role` + `/couple/settings`, so a pack/
 *     role carried in from the preview screen is applied here as a follow-up
 *     call once pairing succeeds, not baked into the pairing request itself.
 *   - No local-only "pending" link state to lose on reinstall (the donor
 *     app's Supabase row could go stale locally) — `GET /couple` is always
 *     re-fetched fresh from the signed-in Clerk account on every launch
 *     (`bootstrapCoupleFeature`), so the old "Restore" banner solved a
 *     problem this backend doesn't have. Dropped, not ported.
 *   - No subscription/premium gate — `@/couple/paywall`'s `hasCouplePremium()`
 *     is a permanent `true` today (Amora has no billing infra at all yet;
 *     see that file's doc comment), so the donor app's Couple-Premium lock
 *     button was removed rather than wired to a check that can never fail.
 *
 * Re-themed 2026-09-08 onto Amora's real gradient-glass system (`GradientScreen`
 * / `GlassCard` / `useAppTheme()`) — this screen used to render through the
 * flat-dark `contexts/ThemeContext` carried over unmodified from the donor
 * app, which is why it looked like a different app spliced into Amora. Only
 * the render layer changed here; every handler above is untouched.
 */
export default function CoupleSetup() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const api = useApi();
  const { isSignedIn } = useAuth();
  const hasPartner = useCoupleStore((s) => s.hasPartner);

  const [profile, setProfile] = useState<ProfileResponse | null>(null);

  // Carried in from the preview screen: which pack/side the user picked
  // there, applied via PATCH calls right after pairing succeeds (see
  // onAccept below) — Amora's pairing endpoint itself takes no pack/role.
  const params = useLocalSearchParams<{ packId?: string; role?: string }>();
  const carriedRole: CoupleRole | null = params.role === 'A' || params.role === 'B' ? params.role : null;
  const carriedPackId = params.packId ?? null;

  const [busy, setBusy] = useState<'accept' | null>(null);
  const [enterInput, setEnterInput] = useState('');
  const [acceptRole, setAcceptRole] = useState<CoupleRole | null>(carriedRole);

  // Already linked (e.g. the user backed into this screen) — bounce straight
  // to the dashboard instead of showing a pairing UI that no longer applies.
  useEffect(() => {
    if (hasPartner) router.replace('/couple/dashboard' as Href);
  }, [hasPartner, router]);

  // Fetch the account's permanent pairing code to display in the share card.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    api
      .getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err: Error) => toast(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const onCopy = useCallback(async () => {
    if (!profile?.pairingCode) return;
    await Clipboard.setStringAsync(profile.pairingCode);
    toast(t('couple.setup.codeCopied'));
  }, [profile?.pairingCode, t]);

  const onShare = useCallback(async () => {
    if (!profile?.pairingCode) return;
    await Share.share({ message: t('couple.setup.shareMessage', { code: profile.pairingCode }) });
  }, [profile?.pairingCode, t]);

  const onAccept = useCallback(async () => {
    if (!isSignedIn) {
      toast(t('couple.setup.signInFirst'));
      return;
    }
    const code = enterInput.trim().toUpperCase();
    if (code.length !== 6) {
      toast(t('couple.setup.codeMustBe6'));
      return;
    }
    setBusy('accept');
    try {
      // Same disclosure-before-effect reasoning as the donor app: this call
      // flips `hasPartner` (via the follow-up refreshCoupleState below)
      // before the user has necessarily seen a location prompt.
      const consent = await requestCoupleLocationConsent();
      if (consent === 'declined') {
        toast(t('couple.setup.declinedLocation'));
      }
      await api.redeemPairingCode(code);
      // Apply the role/pack carried from preview.tsx now that we have a
      // partner to apply them against — the pairing call itself couldn't
      // take them. "Auto" (acceptRole === null) skips role-setting; the
      // user picks a side later from preview/dashboard instead.
      //
      // IMPORTANT ordering: PATCH /couple/settings 400s with "Pick a side
      // before changing settings" until a Couple row exists, and that row
      // is only ever created inside PATCH /couple/role's first call from
      // either side (server/src/routes/couple.ts) — so a carried pack can
      // only be applied when a role is ALSO being applied in this same
      // request. "Auto" + a carried pack means the pack pick is dropped
      // here (told to the user below) rather than firing a request that's
      // guaranteed to fail.
      if (acceptRole) {
        await api.setCoupleRole(acceptRole).catch((err: Error) => toast(err.message));
        if (carriedPackId) {
          await api.setCoupleSettings({ packId: carriedPackId }).catch((err: Error) => toast(err.message));
        }
      } else if (carriedPackId) {
        toast(t('couple.setup.packAppliesFromDashboard'));
      }
      await refreshCoupleState();
      toast(t('couple.setup.linked'));
      router.replace('/couple/dashboard' as Href);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('couple.setup.couldNotLink'));
    } finally {
      setBusy(null);
    }
  }, [isSignedIn, enterInput, acceptRole, carriedPackId, router, api, t]);

  return (
    <GradientScreen>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => router.back()} />
          <Text style={[styles.title, { color: theme.ink }]}>{t('couple.setup.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {carriedPackId ? (
            <Text style={[styles.orText, { color: theme.inkSoft, fontFamily: fonts.body }]}>
              {t('couple.setup.carriedPack')}
            </Text>
          ) : null}

          {/* ─── YOUR CODE CARD ─── */}
          <YourCodeCard
            pairingCode={profile?.pairingCode ?? null}
            theme={theme}
            onCopy={onCopy}
            onShare={onShare}
            router={router}
          />

          {/* ─── OR DIVIDER ─── */}
          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: theme.glassBorder }]} />
            <Text style={[styles.orText, { color: theme.inkFaint }]}>{t('couple.setup.or')}</Text>
            <View style={[styles.orLine, { backgroundColor: theme.glassBorder }]} />
          </View>

          {/* ─── ACCEPT CARD ─── */}
          <AcceptCard
            theme={theme}
            enterInput={enterInput}
            setEnterInput={setEnterInput}
            acceptRole={acceptRole}
            setAcceptRole={setAcceptRole}
            busy={busy}
            onAccept={onAccept}
          />

          <Text style={[styles.privacyText, { color: theme.inkFaint }]}>
            <Icon name="lock" size={11} color={theme.accent2} />
            {'  '}
            {t('couple.setup.privacyNote')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </GradientScreen>
  );
}
