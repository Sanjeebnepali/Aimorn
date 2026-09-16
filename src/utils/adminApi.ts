/**
 * App-owner-only API calls — split out of api.ts (same "keep it under the
 * workspace's 350-line limit" reasoning as coupleApi.ts) rather than
 * inlined there, since api.ts was already right at the cap. Server-side
 * gating (routes/admin.ts's requireAdmin) is the real security boundary —
 * this file has no special auth of its own, it's the same Clerk-token
 * request() every other API call uses.
 */
import { request, type GetToken } from './apiClient';

export function buildAdminApi(getToken: GetToken) {
  return {
    /** Sends one push to every opted-in user at once (see server's
     * lib/push.ts sendBroadcastNotification) — 403s for anyone but the
     * account matching the server's ADMIN_USER_ID. */
    sendBroadcast(title: string, body: string): Promise<void> {
      return getToken().then((token) =>
        request('/admin/broadcast', token, { method: 'POST', body: JSON.stringify({ title, body }) }),
      );
    },
  };
}
