/**
 * In-app Notification History API calls — split out of api.ts (same
 * "keep it under the workspace's 350-line limit" reasoning as
 * coupleApi.ts/adminApi.ts).
 */
import { request, type GetToken } from './apiClient';
import type { NotificationsResponse } from './apiTypes';

export function buildNotificationsApi(getToken: GetToken) {
  return {
    /** `cursor` pages backward through older notifications — omit for the
     * first page. See server's routes/notifications.ts for the merged
     * personal+broadcast shape and why unreadCount is a separate,
     * always-accurate count rather than just "unread items on this page". */
    getNotifications(cursor?: string): Promise<NotificationsResponse> {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return getToken().then((token) => request<NotificationsResponse>(`/notifications${query}`, token));
    },
    /** Call once, after the feed's first page has rendered (so the user
     * still sees what WAS unread) — see server's own doc comment on why
     * this is a single timestamp, not per-item read state. */
    markNotificationsViewed(): Promise<void> {
      return getToken().then((token) => request('/notifications/mark-viewed', token, { method: 'POST' }));
    },
  };
}
