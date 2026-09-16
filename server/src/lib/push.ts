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
