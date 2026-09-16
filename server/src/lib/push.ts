import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { env } from '../env.js';
import { db } from './db.js';

/**
 * Real push notification delivery via Firebase Cloud Messaging — replaces
 * the Notifications settings row's previous dead-placeholder state (Profile
 * → Notifications used to just show "isn't connected yet — this build is a
 * preview"). Raw FCM via firebase-admin, not Expo's own hosted push
 * service: this project has no EAS project linked (builds are local — see
 * AGENTS.md), and Expo's push relay would need these exact same Firebase
 * credentials uploaded to IT anyway, so calling FCM directly skips a
 * redundant hop.
 *
 * `FIREBASE_SERVICE_ACCOUNT_JSON` is optional at boot (see env.ts) — same
 * "fail per-request with a clear 503-shaped no-op, not at server startup"
 * reasoning as storage.ts/revenueCat.ts's own isConfigured() checks, since
 * this server needs to boot and serve every OTHER route even before the
 * user has created a Firebase project and handed over credentials.
 */
let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  if (getApps().length === 0) {
    // Firebase's own downloaded service-account JSON is snake_case
    // (project_id/private_key/client_email) — firebase-admin's cert()
    // accepts that shape directly (confirmed by reading credential-internal.js's
    // own ServiceAccount constructor: it copies either the camelCase or the
    // snake_case key), so this can be parsed and passed straight through
    // with no manual field remapping.
    initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  }
  initialized = true;
  return true;
}

export function isPushConfigured(): boolean {
  return !!env.FIREBASE_SERVICE_ACCOUNT_JSON;
}

/**
 * The one FCM topic every opted-in device belongs to — what lets
 * sendBroadcastNotification() below reach every user with a single FCM
 * call instead of one send per row in the User table (which wouldn't
 * scale, and FCM's own multicast send() caps at 500 tokens per call
 * anyway). Topic membership, not the User.notificationsEnabled column
 * alone, is what actually gates delivery here — a broadcast is a plain
 * fire-and-forget to this topic name, so a user who's toggled
 * notifications off MUST be unsubscribed at that moment (see
 * routes/profile.ts's push-token/notification-settings handlers, the only
 * two places that call subscribe/unsubscribeFromBroadcastTopic) rather
 * than filtered out at send time, which topic sends have no hook for.
 */
const BROADCAST_TOPIC = 'all-users';

/** Best-effort, same reasoning as sendPushToUser below — a failed
 * subscribe just means this device misses broadcasts until the next
 * successful token registration, never something worth failing the
 * caller's own real request over. */
export async function subscribeToBroadcastTopic(token: string): Promise<void> {
  if (!ensureInitialized()) return;
  await getMessaging().subscribeToTopic([token], BROADCAST_TOPIC).catch((err) => {
    console.warn('subscribeToBroadcastTopic failed:', err);
  });
}

export async function unsubscribeFromBroadcastTopic(token: string): Promise<void> {
  if (!ensureInitialized()) return;
  await getMessaging().unsubscribeFromTopic([token], BROADCAST_TOPIC).catch((err) => {
    console.warn('unsubscribeFromBroadcastTopic failed:', err);
  });
}

/**
 * Sends one push to EVERY subscribed device at once — the "new feature,
 * event, announcement" kind of notification every app sends, distinct
 * from sendPushToUser's one-to-one personal pushes (partner paired, etc).
 * Real callers: POST /admin/broadcast (routes/profile.ts), gated to the
 * app owner's own account via ADMIN_USER_ID — there's no in-app UI for
 * anyone else to reach this, same "one trusted operator, no separate
 * admin auth system" shape as a solo-developer app needs.
 */
export async function sendBroadcastNotification(
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<void> {
  if (!ensureInitialized()) throw new Error('Push notifications aren’t configured (no Firebase credentials).');
  await getMessaging().send({
    topic: BROADCAST_TOPIC,
    notification,
    data,
    android: { priority: 'high' },
  });
  // One row covers every recipient (see NotificationScope's own doc
  // comment) — written after a successful send, not before: an admin
  // broadcast that fails to send shouldn't leave a phantom row in
  // everyone's in-app history for something that never actually went out.
  await db.notification.create({
    data: { scope: 'BROADCAST', title: notification.title, body: notification.body },
  });
}

/**
 * Sends one push to whatever device `userId` last registered a token from
 * (see PATCH /profile/push-token) — best-effort and silent on every
 * failure mode (not configured, no token yet, notifications muted, or a
 * real FCM error like an expired/uninstalled-app token), the same
 * "a notification is a nice-to-have, never load-bearing" reasoning
 * `refreshCoupleGeofence`'s own callers already use elsewhere in this
 * codebase — nothing that triggers a push (pairing, in couple.ts) should
 * ever fail its own real request just because a push couldn't go out.
 */
export async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<void> {
  // Recorded in the in-app Notification History regardless of whether the
  // OS push itself actually goes out below (no token yet, muted, FCM
  // down) — this row means "this real event happened to you," which is
  // still true, and still worth seeing next time this user opens the
  // in-app feed, even on a device that never got the live push for it.
  await db.notification.create({ data: { scope: 'PERSONAL', userId, title: notification.title, body: notification.body } }).catch((err) => {
    console.warn('sendPushToUser: failed to record notification history:', err);
  });

  if (!ensureInitialized()) return;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, notificationsEnabled: true },
    });
    if (!user?.pushToken || !user.notificationsEnabled) return;

    await getMessaging().send({
      token: user.pushToken,
      notification,
      data,
      android: { priority: 'high' },
    });
  } catch (err) {
    // An expired/uninstalled-app token is the single most common real
    // failure here (FCM's own docs call this out explicitly) — clearing it
    // stops every future send for this user from repeating the same failed
    // call forever, self-healing the same way a stale token naturally
    // resolves itself the next time this user's device re-registers one.
    const code = (err as { errorInfo?: { code?: string } } | null)?.errorInfo?.code;
    if (code === 'messaging/registration-token-not-registered') {
      await db.user.update({ where: { id: userId }, data: { pushToken: null } }).catch(() => {});
      return;
    }
    console.warn('sendPushToUser failed:', err);
  }
}
