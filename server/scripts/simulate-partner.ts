/**
 * DEV/TESTING UTILITY — not part of the shipped app or server.
 *
 * Simulates a second, real Amora account acting as the "partner" side of the
 * couple-proximity feature, so the pairing → role-pick → live-location →
 * WebSocket-push chain can be exercised end-to-end against the REAL backend
 * (Express + Prisma + Neon) and REAL Clerk auth, without needing a second
 * physical device or Android emulator. (See the 2026-09-08 session notes:
 * this dev machine can't run a full second Android UI alongside Metro + the
 * backend without hitting an out-of-memory wall — the emulator alone costs
 * 1.3-1.9 GB. A scripted partner costs a few MB and exercises the same real
 * server-side logic; only the second UI's own rendering goes untested.)
 *
 * Nothing here is mocked: it creates a genuine Clerk user via the Backend
 * API (the same CLERK_SECRET_KEY the server itself trusts), mints a real
 * session + JWT the same way a signed-in app would, and calls the same REST
 * routes + WebSocket the real client (`src/utils/api.ts`, `src/couple/*`)
 * uses. Anything this script triggers writes to the real Neon `User`,
 * `Couple`, and `CoupleLocation` tables.
 *
 * State (the created user id + session token) persists to a JSON file
 * outside the repo (see STATE_PATH) so separate command invocations reuse
 * the same simulated identity instead of minting a fresh Clerk user every
 * time.
 *
 * Usage (run from server/, needs its .env for CLERK_SECRET_KEY):
 *   npx tsx scripts/simulate-partner.ts pair <PAIRING_CODE> [displayName]
 *   npx tsx scripts/simulate-partner.ts role <A|B>
 *   npx tsx scripts/simulate-partner.ts push <lat> <lng> [accuracyM]
 *   npx tsx scripts/simulate-partner.ts listen [durationSeconds]
 *   npx tsx scripts/simulate-partner.ts whoami
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import WebSocket from 'ws';

const API_BASE = process.env.SIM_API_BASE ?? 'http://localhost:4000';
// Kept outside the repo — this is throwaway run state for a manual test
// tool, not project data.
const STATE_PATH =
  process.env.SIM_STATE_PATH ??
  'C:/Users/Sanju/AppData/Local/Temp/claude/D--Ai-walp/a93fcf4d-eb8b-452c-a8b1-d3c3674ffbf7/scratchpad/simulate-partner-state.json';

type State = { userId: string; sessionId: string };

function loadState(): State | null {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error('CLERK_SECRET_KEY missing — run this from server/ so its .env loads.');
}
const clerk = createClerkClient({ secretKey });

/**
 * Ensures a simulated Clerk user + session exist, reusing whatever the last
 * invocation created (see STATE_PATH) so `pair`, `role`, and `push` can be
 * separate command runs against the same simulated identity. A fresh
 * session is minted only the first time — Clerk sessions are long-lived
 * enough for a single test session's worth of commands.
 */
async function getOrCreateIdentity(): Promise<State> {
  const existing = loadState();
  if (existing) return existing;

  const suffix = Date.now();
  const user = await clerk.users.createUser({
    emailAddress: [`amora-sim-partner-${suffix}@example.com`],
    password: `Sim-${suffix}-!Aa1`,
    firstName: 'Test',
    lastName: 'Partner',
    skipPasswordChecks: true,
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  const state: State = { userId: user.id, sessionId: session.id };
  saveState(state);
  console.log(`Created simulated Clerk user ${user.id}`);
  return state;
}

async function getBearerToken(sessionId: string): Promise<string> {
  const token = await clerk.sessions.getToken(sessionId);
  return token.jwt;
}

async function api(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

async function cmdPair(code: string, displayName: string): Promise<void> {
  const { sessionId } = await getOrCreateIdentity();
  const token = await getBearerToken(sessionId);

  // Onboard first so the sharer's dashboard shows a real name instead of
  // the "your partner" fallback — see profile.ts's toProfileJson.
  await api('/profile/onboarding', token, {
    method: 'POST',
    body: JSON.stringify({ displayName, stylePreference: 'default', usageMode: 'COUPLE' }),
  });

  const res = await api('/profile/pair', token, { method: 'POST', body: JSON.stringify({ code }) });
  const body = await res.json();
  console.log('Paired ✓', body);
}

async function cmdRole(role: 'A' | 'B'): Promise<void> {
  const state = loadState();
  if (!state) throw new Error('No simulated identity yet — run `pair` first.');
  const token = await getBearerToken(state.sessionId);
  const res = await api('/couple/role', token, { method: 'PATCH', body: JSON.stringify({ role }) });
  console.log('Role set ✓', await res.json());
}

async function cmdPush(lat: number, lng: number, accuracyM: number | null): Promise<void> {
  const state = loadState();
  if (!state) throw new Error('No simulated identity yet — run `pair` first.');
  const token = await getBearerToken(state.sessionId);
  await api('/couple/location', token, {
    method: 'POST',
    body: JSON.stringify({ lat, lng, accuracyM }),
  });
  console.log(`Pushed location ✓ lat=${lat} lng=${lng} accuracyM=${accuracyM ?? 'null'}`);
}

async function cmdListen(durationSeconds: number): Promise<void> {
  const state = loadState();
  if (!state) throw new Error('No simulated identity yet — run `pair` first.');
  const token = await getBearerToken(state.sessionId);
  const wsUrl = `${API_BASE.replace('http', 'ws')}/couple/stream?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => console.log(`Listening on ${wsUrl} for ${durationSeconds}s — waiting for partner-location pushes…`));
    ws.on('message', (data) => console.log('◀ received:', data.toString()));
    ws.on('error', reject);
    ws.on('close', (code, reason) => console.log(`Socket closed (${code}) ${reason.toString()}`));
    setTimeout(() => {
      ws.close();
      resolve();
    }, durationSeconds * 1000);
  });
}

async function cmdWhoami(): Promise<void> {
  const state = loadState();
  if (!state) {
    console.log('No simulated identity yet.');
    return;
  }
  const token = await getBearerToken(state.sessionId);
  const res = await api('/profile/me', token);
  console.log(await res.json());
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'pair':
      await cmdPair(args[0], args[1] ?? 'Test Partner');
      break;
    case 'role':
      await cmdRole(args[0] as 'A' | 'B');
      break;
    case 'push':
      await cmdPush(Number(args[0]), Number(args[1]), args[2] ? Number(args[2]) : null);
      break;
    case 'listen':
      await cmdListen(args[0] ? Number(args[0]) : 30);
      break;
    case 'whoami':
      await cmdWhoami();
      break;
    default:
      console.error('Usage: pair <code> [name] | role <A|B> | push <lat> <lng> [accuracyM] | listen [sec] | whoami');
      process.exitCode = 1;
  }
}

void main();
