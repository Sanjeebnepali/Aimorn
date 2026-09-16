import { Platform } from 'react-native';

import type { useApi } from '@/utils/api';

/**
 * Real push notifications — replaces the Notifications settings row's old
 * dead-placeholder alert. Raw FCM device tokens via expo-notifications'
 * getDevicePushTokenAsync(), not Expo's own hosted push token: this project
 * has no EAS project linked (builds are local — see AGENTS.md), and Expo's
 * push relay would need the exact same Firebase credentials uploaded to IT
 * anyway (see server/src/lib/push.ts's own doc comment), so this app talks
 * to FCM directly instead of adding a redundant hop.
 *
 * Deliberately `require()`s expo-notifications lazily inside each function
 * instead of a static top-level `import` — confirmed live 2026-09-16 that a
 * static import throws synchronously, AT MODULE-EVALUATION TIME, the moment
 * expo-notifications' native module doesn't exist yet in the currently-
 * installed build (true for any new native module until the next native
 * rebuild — pure JS/Fast Refresh can never add native code to an
 * already-built APK). A static import's throw happens before any of this
 * file's own try/catch blocks can run, since it fires while the IMPORTING
 * module (this file, and transitively RootLayout) is still being evaluated
 * — it took down the entire app (every route, not just notification
 * screens) the first time this was a static import. `require()` inside a
 * function body defers that same throw to the moment the function is
 * actually CALLED, which every exported function here already wraps in a
 * try/catch.
 */
function loadNotifications(): typeof import('expo-notifications') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

/**
 * Foreground display behavior — shown as a banner even while the app is
 * open, matching what a backgrounded/closed app gets automatically from the
 * OS. Called once, at RootLayout's own module scope (same "boot-once,
 * before any screen" timing as configureAds()/configurePurchases()).
 */
export function configureNotificationHandler(): void {
  try {
    const Notifications = loadNotifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // See this file's own doc comment — an optional SDK whose native side
    // isn't built yet must never be able to crash app boot, same reasoning
    // as configureAds()/configurePurchases() a few lines up in _layout.tsx.
  }
}

/**
 * Requests OS permission (a no-op if already granted or already denied —
 * Android/iOS both refuse to re-prompt once a user has answered once) and,
 * if granted, registers this device's real token with the server. Called
 * from RootLayout's sign-in effect (alongside bootstrapCoupleFeature/
 * loginPurchases) so a signed-in user's token is always fresh — an FCM
 * token can rotate at any time per Google's own docs, so "just once at
 * signup" would silently go stale over the life of an install.
 *
 * Deliberately swallows every failure (permission denied, native module not
 * built yet, no Firebase project configured, offline) — a push notification
 * is a nice-to-have, never something that should block or alert during
 * normal sign-in.
 */
export async function registerForPushNotifications(api: ReturnType<typeof useApi>): Promise<void> {
  try {
    const Notifications = loadNotifications();
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    // Android 8+ requires a channel to be registered before a notification
    // can display at all — a missing channel silently drops the
    // notification with no error anywhere, confirmed against Android's own
    // notification-channel docs. iOS has no such concept and ignores this.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    await api.registerPushToken(devicePushToken.data as string);
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

/** Same lazy-load reasoning as this file's own doc comment — the
 * Notifications settings screen needs direct access to a couple more
 * expo-notifications calls (getPermissionsAsync for its initial read,
 * openSettings' precondition) that don't belong duplicated into this
 * file's own exports. */
export function tryLoadNotifications(): typeof import('expo-notifications') | null {
  try {
    return loadNotifications();
  } catch {
    return null;
  }
}
