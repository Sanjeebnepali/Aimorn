/**
 * Content/person reporting — split out of api.ts (same "keep it under the
 * workspace's 350-line limit" reasoning as coupleApi.ts/notificationsApi.ts).
 * The one call behind ReportContentModal.tsx's submit button, for all three
 * ReportContext surfaces (see lib/reportContent.ts) — replaces the old
 * couple-only `reportPartner()`/`POST /couple/report`, which 404'd by
 * design until this real endpoint (server routes/reports.ts) existed.
 */
import { request, type GetToken } from './apiClient';
import type { ReportContext, ReportReason } from '../lib/reportContent';

export function buildReportApi(getToken: GetToken) {
  return {
    submitReport(ctx: ReportContext, reason: ReportReason, details?: string): Promise<void> {
      return getToken().then((token) =>
        request('/reports', token, {
          method: 'POST',
          body: JSON.stringify({
            surface: ctx.surface,
            reason,
            details: details?.trim() || undefined,
            targetUserId: ctx.targetUserId,
            contentId: ctx.wallpaperId,
            prompt: ctx.prompt,
            provider: ctx.provider,
            model: ctx.model,
          }),
        }),
      );
    },
  };
}
