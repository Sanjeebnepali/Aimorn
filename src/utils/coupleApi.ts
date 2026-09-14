/**
 * Couple-proximity API calls — split out of api.ts 2026-09-14 purely to
 * keep that file under the workspace's 350-line limit (see AGENTS.md); no
 * behavior change from when these five methods lived inline there.
 * `useApi()` spreads `buildCoupleApi(getToken)` into its returned object,
 * so every existing call site (`api.getCouple()`, `api.unlinkCouple()`,
 * etc.) is unchanged.
 */
import { request, type GetToken } from './apiClient';
import type { CoupleRole, CoupleResponse } from './apiTypes';

export function buildCoupleApi(getToken: GetToken) {
  return {
    getCouple(): Promise<CoupleResponse> {
      return getToken().then((token) => request<CoupleResponse>('/couple', token));
    },
    setCoupleRole(role: CoupleRole): Promise<{ myRole: CoupleRole; coupleId: string }> {
      return getToken().then((token) =>
        request('/couple/role', token, { method: 'PATCH', body: JSON.stringify({ role }) }),
      );
    },
    setCoupleSettings(input: {
      packId?: string | null;
      /** Switches the active pack to a real AI-generated couple session —
       * must be a COMPLETE, COUPLE-mode generation the caller owns (see
       * server/src/routes/couple.ts). Pass null to clear back to a bundled
       * pack. */
      generationId?: string | null;
      paused?: boolean;
      thresholdM?: number;
    }): Promise<{
      packId: string | null;
      customPackTogetherUrl: string | null;
      customPackAUrl: string | null;
      customPackBUrl: string | null;
      paused: boolean;
      thresholdM: number;
    }> {
      return getToken().then((token) =>
        request('/couple/settings', token, { method: 'PATCH', body: JSON.stringify(input) }),
      );
    },
    unlinkCouple(): Promise<void> {
      return getToken().then((token) => request('/couple/unlink', token, { method: 'POST' }));
    },
    /**
     * Stub — no server route exists yet (see server/src/routes/couple.ts's
     * closing comment). Left wired so the UI scaffolding is real, not
     * pretending to work: this rejects with "Request failed (404)" if
     * actually called, same as any other unimplemented route would.
     */
    reportPartner(reason: string): Promise<void> {
      return getToken().then((token) =>
        request('/couple/report', token, { method: 'POST', body: JSON.stringify({ reason }) }),
      );
    },
  };
}
