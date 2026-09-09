/**
 * Thin fetch wrapper for amora/server, bound to the current Clerk session.
 * A hook (not a plain export) because every call needs a fresh token via
 * getToken(), and that's only available from useAuth() inside a component.
 */
import { useAuth } from '@clerk/expo';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type UsageMode = 'SOLO' | 'COUPLE';

export type ProfileResponse = {
  id: string;
  displayName: string | null;
  avatarKey: string | null;
  stylePreference: string | null;
  usageMode: UsageMode | null;
  username: string | null;
  pairingCode: string | null;
  hasPartner: boolean;
  onboarded: boolean;
};

export type CoupleRole = 'A' | 'B';

export type CoupleResponse = {
  hasPartner: boolean;
  partner: { id: string; displayName: string | null; avatarKey: string | null } | null;
  myRole: CoupleRole | null;
  partnerRole: CoupleRole | null;
  packId: string | null;
  paused: boolean;
  thresholdM: number;
  partnerLocation: { lat: number; lng: number; accuracyM: number | null; updatedAt: string } | null;
};

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  // Same "fail loud, not silently" idea as server/src/env.ts and the Clerk
  // publishable-key check in _layout.tsx — a missing API URL should read as
  // a config mistake, not manifest as an inexplicable network error later.
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — copy .env.example to .env and fill it in.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    // Route handlers return `{ error: string }` for expected failures (bad
    // code, already paired, etc.) — surface that message verbatim when
    // present instead of a generic "request failed".
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  // A couple of endpoints (location push, unlink) reply 204 with no body —
  // response.json() would throw "Unexpected end of JSON input" on that.
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export function useApi() {
  const { getToken } = useAuth();

  return {
    getProfile(): Promise<ProfileResponse> {
      return getToken().then((token) => request<ProfileResponse>('/profile/me', token));
    },
    submitOnboarding(input: {
      displayName: string;
      avatarKey?: string;
      stylePreference: string;
      usageMode: UsageMode;
    }): Promise<ProfileResponse> {
      return getToken().then((token) =>
        request<ProfileResponse>('/profile/onboarding', token, { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    redeemPairingCode(code: string): Promise<ProfileResponse> {
      return getToken().then((token) =>
        request<ProfileResponse>('/profile/pair', token, { method: 'POST', body: JSON.stringify({ code }) }),
      );
    },

    // ─── Couple proximity ────────────────────────────────────────────────
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
      paused?: boolean;
      thresholdM?: number;
    }): Promise<{ packId: string | null; paused: boolean; thresholdM: number }> {
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
