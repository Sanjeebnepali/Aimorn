/**
 * Non-hook backend calls for the couple-proximity feature — for the two
 * places that can't use a React hook: the background location TaskManager
 * task (myFix.ts / location.ts) and the WebSocket client's connection URL
 * (socket.ts). Every screen/component instead uses the couple methods on
 * `useApi()` (src/utils/api.ts), same as every other feature in this app —
 * this file exists only for the call sites a hook genuinely can't reach.
 */
import { getClerkInstance } from '@clerk/expo';

import type { CoupleResponse } from '@/utils/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Same singleton Clerk instance `<ClerkProvider>` created at the app root
 * (see `getClerkInstance()`'s own doc comment in @clerk/expo) — calling it
 * again here with no arguments reuses that instance rather than creating a
 * second one, so this is safe from anywhere once the app has booted.
 */
export async function getAuthToken(): Promise<string | null> {
  const clerk = getClerkInstance();
  return (await clerk.session?.getToken()) ?? null;
}

/**
 * Push my latest GPS fix to the server, which then relays it to my
 * partner's open socket (see server/src/routes/couple.ts). Never throws —
 * returns false on any failure so a flaky tick can't crash the background
 * location task; the next tick (or the resilience poll) retries.
 */
export async function pushCoupleLocation(lat: number, lng: number, accuracyM: number | null): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const token = await getAuthToken();
    if (!token) return false;
    const response = await fetch(`${API_URL}/couple/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat, lng, accuracyM }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the caller's full couple-proximity state. Used only from bootstrap.ts
 * — a module, not a component, so it can't use the hook-based `useApi()`
 * every screen uses for the same GET /couple call. Returns null on any
 * failure (signed out, offline, server down) so a bootstrap hiccup degrades
 * to "not linked yet" instead of throwing during app startup.
 */
export async function fetchCouple(): Promise<CoupleResponse | null> {
  if (!API_URL) return null;
  try {
    const token = await getAuthToken();
    const response = await fetch(`${API_URL}/couple`, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) return null;
    return (await response.json()) as CoupleResponse;
  } catch {
    return null;
  }
}

/** The WebSocket URL for the couple-proximity push channel, with a fresh
 *  Clerk token attached — see server/src/realtime/coupleSocket.ts, which
 *  reads this same query param (a raw WS upgrade has no Authorization
 *  header to verify). Null when signed out or the API URL isn't configured. */
export async function coupleSocketUrl(): Promise<string | null> {
  if (!API_URL) return null;
  const token = await getAuthToken();
  if (!token) return null;
  const wsBase = API_URL.replace(/^http/, 'ws');
  return `${wsBase}/couple/stream?token=${encodeURIComponent(token)}`;
}
