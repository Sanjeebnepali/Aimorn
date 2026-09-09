import { showAlert } from '@/alerts/store';
import { ensureBackgroundLocationPermission, getBackgroundLocationPermissionStatus } from './location';
import { useCoupleStore } from './store';

/**
 * Prominent, pre-permission disclosure for the couple feature's background
 * location — Play/Apple require this exact shape (a dedicated, hard-to-miss
 * prompt with an affirmative Allow/Not now choice, shown BEFORE the OS
 * location dialog) whenever an app tracks location in the background.
 *
 * The feature this was ported from used a full bottom-sheet component for
 * this; Amora already has a themed alert (`showAlert`, src/alerts/store.ts)
 * used everywhere else in the app for exactly this kind of "explain, then
 * let the user choose" moment (see native-media.ts's permission-denied
 * flow) — reused here rather than adding a new sheet component + the
 * @gorhom/bottom-sheet dependency just for one prompt. The disclosure CONTENT
 * (what's collected, that it runs with the app closed, who it's shared with,
 * how to stop it) is what the platforms actually require; the presentation
 * doesn't have to be a sheet.
 */
function showLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(
      'Location & Your Privacy',
      'Amora uses your location to show your distance to your linked partner and switch your wallpaper when you\'re near them — even when the app is closed. It\'s shared only with your linked partner, never sold or used for advertising, and you can pause sharing or unlink anytime from the Couple dashboard.',
      [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', onPress: () => resolve(true) },
      ],
    );
  });
}

/**
 * THE gated entry point for turning on couple location tracking from an
 * explicit user action (picking a role, or the dashboard's "Check GPS").
 * Skips the disclosure if already granted (nothing to disclose ahead of);
 * otherwise shows the disclosure first and only requests if the user taps
 * Allow. Centralised here so every call site gates the OS dialog the same
 * way.
 */
export async function requestCoupleLocationConsent(): Promise<'granted' | 'foreground-only' | 'denied' | 'declined'> {
  const current = await getBackgroundLocationPermissionStatus();
  if (current === 'granted') {
    // BUG (found 2026-09-08 via live two-account testing): this early return
    // used to skip syncLocationErrorBanner() entirely, so a stale "Location
    // is off" banner — set once by bootstrap.ts's enterParticipating() before
    // permission was granted — never cleared for anyone who ended up already
    // granted by the time they tapped "Check GPS" (e.g. granted it via
    // Android Settings directly instead of the in-app prompt, or — as
    // reproduced here — granted out-of-band). Confirmed live: location was
    // actively flowing (proximity correctly read "near") while the banner
    // still insisted it was off, with no way to clear it from the UI at all
    // since this was the only place that runs on every "Check GPS" tap.
    await syncLocationErrorBanner();
    return 'granted';
  }
  const allowed = await showLocationDisclosure();
  if (!allowed) return 'declined';
  const result = await ensureBackgroundLocationPermission();
  await syncLocationErrorBanner();
  return result;
}

/**
 * Re-reads the current permission status and reflects it in the store's
 * `error` banner (surfaced by CoupleDiagnostics on the dashboard) — the
 * single place that decides what that banner says. Without this, the
 * banner only ever got set ONCE, at the moment pairing+role-pick first made
 * this account "participating" (see bootstrap.ts's `enterParticipating`),
 * and never again — so granting permission afterward (e.g. tapping "Check
 * GPS") left a stale "Location is off" message on screen even though
 * location was now actually flowing. Call this after any point where the
 * OS permission could have changed.
 */
export async function syncLocationErrorBanner(): Promise<'granted' | 'foreground-only' | 'denied'> {
  const status = await getBackgroundLocationPermissionStatus();
  if (status === 'denied') {
    useCoupleStore.getState().setError('Location is off — tap "Check GPS" on the dashboard to enable it.');
  } else if (status === 'foreground-only') {
    useCoupleStore
      .getState()
      .setError(
        'Background location is off. Distance only updates while the app is open — tap "Check GPS" on the dashboard for full tracking.',
      );
  } else {
    useCoupleStore.getState().clearError();
  }
  return status;
}
