import { type Href, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

import { premiumAlert } from '../components/PremiumAlert';
import { reportContent } from '../components/ReportContentModal';
import { enforceSingleDriver } from '../lib/automationMode';
import { toast } from '../lib/toast';
import { setDeviceWallpaper } from '../utils/native-media';
import { useApi } from '../utils/api';
import { refreshCoupleState } from './bootstrap';
import { requestCoupleLocationConsent } from './locationConsent';
import { startCoupleLocation } from './location';
import { couplePacks } from './packs';
import { applyProximityWallpaper, resolveCoupleImageUri } from './wallpaper';
import { useCoupleStore } from './store';

/**
 * All the Couple Dashboard's mutation handlers (pack switch, pause toggle,
 * unlink, report, permission check) plus the `busy`/`picking` state they
 * share. Pulled out of `app/couple/dashboard.tsx` itself during the
 * 2026-09-08 re-theme so that file could stay a thin render/compose layer
 * under this workspace's 350-line-per-file cap (it had drifted to 417 lines
 * carrying all of this inline) — see that file's doc comment for the fuller
 * story. Nothing here changed behavior, only its address; every comment
 * below is carried over verbatim from where it used to live.
 */
export function useCoupleDashboardActions({
  packId,
  paused,
  partnerId,
  partnerName,
}: {
  packId: string | null;
  paused: boolean;
  partnerId: string | undefined;
  partnerName: string;
}) {
  const router = useRouter();
  const api = useApi();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  /**
   * Switches to one of the caller's own real AI-generated couple photos —
   * parallel to onPickPack below but through `generationId` instead of
   * `packId` (see server/src/routes/couple.ts's PATCH /couple/settings).
   * Added 2026-09-11 alongside CouplePackPicker's new "Your Creations"
   * section: previously the ONLY way to activate a real generation as the
   * couple pack was result/[id].tsx's "Use as Our Couple Pack" button,
   * right after generating it — there was no way to reselect an older one,
   * or any indication in the picker itself that a custom pack was active at
   * all (see CouplePackPicker.tsx's own comment on this).
   */
  const onPickGeneration = useCallback(
    async (generationId: string) => {
      if (generationId === packId) return;
      setPicking(true);
      try {
        const settings = await api.setCoupleSettings({ generationId });
        useCoupleStore.getState().setSettings(settings);
        toast(t('couple.dashboard.packSwitched'));
        void applyProximityWallpaper();
      } catch (err) {
        toast(err instanceof Error ? err.message : t('couple.dashboard.couldNotSave'));
      } finally {
        setPicking(false);
      }
    },
    [packId, api, t],
  );

  const onPickPack = useCallback(
    async (newPackId: string) => {
      if (newPackId === packId) return;
      setPicking(true);
      try {
        // Unlike setCoupleRole (which can 409 on a conflict the caller
        // couldn't have predicted — see dashboard.tsx's doc comment),
        // settings changes have no rejection path: either partner may
        // freely set pack/pause/threshold at any time
        // (server/src/routes/couple.ts's own comment on PATCH
        // /couple/settings). So the mutation's own response IS the
        // authoritative post-write state — patching the store from it
        // directly is exactly as correct as a GET /couple refetch, just
        // without a second network round-trip. Confirmed live
        // (2026-09-08): the extra refetch was a real, measurable part of
        // why pack switching felt slow.
        const settings = await api.setCoupleSettings({ packId: newPackId });
        useCoupleStore.getState().setSettings(settings);
        toast(t('couple.dashboard.packSwitched'));
        // Bootstrap's store-effect (wireStoreEffects, on the packId change
        // refreshCoupleState() just triggered) already fires
        // applyProximityWallpaper reactively — an extra awaited call here
        // was fully redundant (same dedup key, short-circuits to a no-op)
        // and, confirmed live (2026-09-08), made pack switching feel slow:
        // it held `picking` (and the spinner) open for an extra native
        // wallpaper-write on top of the two network round-trips above,
        // despite the comment's original "zero perceived lag" intent being
        // the opposite of what actually happened. Fire-and-forget instead —
        // the reactive path still applies it, just without blocking this UI.
        void applyProximityWallpaper();
      } catch (err) {
        toast(err instanceof Error ? err.message : t('couple.dashboard.couldNotSave'));
      } finally {
        setPicking(false);
      }
    },
    [packId, api, t],
  );

  const onTogglePause = useCallback(async () => {
    setBusy(true);
    try {
      const wasPaused = paused;
      // Same reasoning as onPickPack above — settings changes can't be
      // rejected, so patch the store from this response instead of an extra
      // GET /couple round-trip.
      const settings = await api.setCoupleSettings({ paused: !paused });
      useCoupleStore.getState().setSettings(settings);
      if (wasPaused) {
        // Resuming Couple = claim the driver slot: stop Theme/Mood/Friend so
        // they don't fight over the wallpaper.
        const stopped = await enforceSingleDriver('couple');
        toast(
          stopped.length
            ? t('couple.dashboard.sharingResumedWith', { stopped: stopped.join(' + ') })
            : t('couple.dashboard.sharingResumed'),
        );
      } else {
        toast(t('couple.dashboard.sharingPaused'));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t('couple.dashboard.couldNotUpdate'));
    } finally {
      setBusy(false);
    }
  }, [paused, api, t]);

  const onUnlink = useCallback(() => {
    premiumAlert({
      title: t('couple.dashboard.unlinkCoupleTitle'),
      message: t('couple.dashboard.unlinkCoupleBody', { name: partnerName }),
      icon: 'unlink-outline',
      buttons: [
        { text: t('couple.dashboard.cancel'), style: 'cancel' },
        {
          text: t('couple.dashboard.unlink'),
          onPress: async () => {
            // Feedback the instant the tap lands — the confirm sheet is
            // already gone by the time this runs, so with no busy state the
            // screen looked frozen for however long the RPC round-trip took.
            setBusy(true);
            toast(t('couple.dashboard.unlinking'));
            try {
              await api.unlinkCouple();
              await refreshCoupleState();
              // Real bug, reported live: the couple photo used to just stay
              // applied as the device wallpaper after unlinking — nothing
              // ever told Android to change it, since a wallpaper is a
              // system-level setting that persists until something
              // explicitly sets a new one. Landing on Home (below) gave the
              // user a way to pick a fresh one manually, but they'd see the
              // ex-partner's photo every time they unlocked their phone
              // until they noticed and did that themselves. Applying one of
              // the app's own bundled packs here — any of them, this is
              // just "not a stale couple photo," not a meaningful choice —
              // means the wallpaper is already sane the instant unlink
              // finishes. Best-effort: unlink itself already succeeded by
              // this point, so a failure here (no storage permission this
              // moment, say) shouldn't surface as an "unlink failed" error.
              try {
                const defaultUri = await resolveCoupleImageUri(couplePacks[0].togetherImage);
                await setDeviceWallpaper(defaultUri, 'both');
              } catch {
                /* best-effort — see comment above */
              }
              // Land on Home instead of the re-pairing (Couple Setup) screen —
              // that screen has no path back to a normal wallpaper, so the
              // couple photo stayed applied with no obvious way to change it.
              // Home lets the user pick a fresh wallpaper immediately.
              toast(t('couple.dashboard.unlinked'));
              router.replace('/(tabs)' as Href);
            } catch (err) {
              toast(err instanceof Error ? err.message : t('couple.dashboard.couldNotUnlink'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    });
  }, [partnerName, router, api, t]);

  // L12 (PLAY_STORE_COMPLIANCE.md): the couple feature had no way to report
  // a partner, only unlink. Uses the same shared report sink B5 built.
  // NOTE: server/src/routes/couple.ts's POST /couple/report is deliberately
  // not implemented yet (no moderation queue exists) — this call 404s.
  const onReportPartner = useCallback(() => {
    reportContent({ surface: 'couple_partner', targetUserId: partnerId });
  }, [partnerId]);

  const onMenu = useCallback(() => {
    premiumAlert({
      title: t('couple.dashboard.coupleOptions'),
      icon: 'ellipsis-horizontal',
      buttons: [
        { text: t('couple.dashboard.cancel'), style: 'cancel' },
        { text: t('couple.dashboard.reportPartner'), onPress: onReportPartner },
        { text: t('couple.dashboard.unlink'), style: 'destructive', onPress: onUnlink },
      ],
    });
  }, [onReportPartner, onUnlink, t]);

  const onCheckPermission = useCallback(async () => {
    setBusy(true);
    try {
      const status = await requestCoupleLocationConsent();
      if (status === 'declined') return;
      if (status === 'denied') {
        premiumAlert({
          title: t('couple.dashboard.locationDeniedTitle'),
          message: t('couple.dashboard.locationDeniedBody'),
          icon: 'location-outline',
          buttons: [
            { text: t('couple.dashboard.cancel'), style: 'cancel' },
            { text: t('couple.dashboard.openSettings'), onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      if (status === 'foreground-only') {
        premiumAlert({
          title: t('couple.dashboard.backgroundAccessTitle'),
          message: t('couple.dashboard.backgroundAccessBody'),
          icon: 'navigate-circle-outline',
          buttons: [
            { text: t('couple.dashboard.later'), style: 'cancel' },
            { text: t('couple.dashboard.openSettings'), onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      // startCoupleLocation() no-ops (returns false) when this account
      // hasn't picked a role yet — couple/location.ts's isParticipating()
      // requires hasPartner AND myRole, not just hasPartner (proximity
      // opt-in and pairing happen at separate times here). Surface that
      // honestly instead of claiming success either way.
      const started = await startCoupleLocation();
      toast(started ? t('couple.dashboard.locationActive') : t('couple.dashboard.pickSideFirst'));
    } catch (err) {
      // Was previously uncaught: any failure here (e.g. the native-manifest
      // gap fixed 2026-09-08, or another unexpected rejection) aborted this
      // whole handler silently — busy just cleared with nothing visibly
      // happening, no toast, no error, no way to tell anything went wrong.
      toast(err instanceof Error ? err.message : t('couple.dashboard.couldNotCheckPermission'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  return { busy, picking, onPickPack, onPickGeneration, onTogglePause, onMenu, onCheckPermission };
}
