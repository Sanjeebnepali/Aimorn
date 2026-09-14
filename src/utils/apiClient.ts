/**
 * The actual fetch/error/204-handling plumbing behind every amora/server
 * call — split out of api.ts 2026-09-14 (alongside coupleApi.ts) so both
 * that file and any other per-domain API builder can import the same
 * `request()` without api.ts <-> coupleApi.ts importing each other
 * directly (a real circular import: api.ts needs coupleApi's builder,
 * coupleApi needs api's request helper). This third file is the shared
 * base both of them depend on instead.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;

/** Clerk's `useAuth().getToken` — every per-domain API builder takes this
 * same shape rather than the whole `useAuth()` result, so it stays
 * testable/callable without a real ClerkProvider tree. */
export type GetToken = () => Promise<string | null>;

export async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
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

  // A couple of endpoints (location push, unlink, account delete) reply 204
  // with no body — response.json() would throw "Unexpected end of JSON
  // input" on that.
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}
