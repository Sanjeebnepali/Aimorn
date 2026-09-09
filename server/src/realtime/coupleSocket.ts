import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { verifyToken } from '@clerk/backend';
import { WebSocketServer, type WebSocket } from 'ws';

import { env } from '../env.js';

/**
 * Push channel for the couple-proximity feature — replaces what Supabase
 * Realtime did in the feature's original (Supabase) implementation. One
 * process, one in-memory map: fine at this app's current scale (everything
 * else here — the AI generation route, the DB connection — already assumes a
 * single Express instance with no queue/worker split). If this ever needs to
 * run behind more than one instance, this map is the one thing that would
 * need to move to something shared (e.g. Redis pub/sub) — nothing else in
 * this file's callers would change.
 *
 * Auth: a normal Express request gets its Clerk session verified by
 * `clerkMiddleware()` (see index.ts) + `getAuth(req)`. Neither runs for a raw
 * WebSocket upgrade, so this file verifies the token itself via
 * `@clerk/backend`'s standalone `verifyToken()` — the same package
 * `@clerk/express` re-exports `clerkClient` from, just called directly since
 * there's no Express `req`/`res` at this point to hand to the middleware.
 */

const socketsByUserId = new Map<string, WebSocket>();

/** Attaches the couple-proximity WS endpoint (`/couple/stream?token=...`) to
 *  the given HTTP server. Call once, alongside `server.listen()` in index.ts. */
export function attachCoupleSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/couple/stream') {
      // Not ours — leave the socket alone so any other upgrade handler
      // (there isn't one today, but this keeps the door open) can claim it.
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, url: URL) => {
    void authenticateAndRegister(ws, url);
  });
}

async function authenticateAndRegister(ws: WebSocket, url: URL): Promise<void> {
  const token = url.searchParams.get('token');
  if (!token) {
    ws.close(1008, 'Missing token');
    return;
  }

  let userId: string | undefined;
  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    userId = payload.sub;
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }
  if (!userId) {
    ws.close(1008, 'Invalid token');
    return;
  }

  // A second connection from the same user (e.g. app relaunch before the old
  // socket timed out) replaces the old one rather than stacking — only the
  // newest connection should receive pushes.
  socketsByUserId.get(userId)?.close(1000, 'Superseded by a new connection');
  socketsByUserId.set(userId, ws);

  ws.on('close', () => {
    if (socketsByUserId.get(userId) === ws) socketsByUserId.delete(userId);
  });
  ws.on('error', () => {
    if (socketsByUserId.get(userId) === ws) socketsByUserId.delete(userId);
  });
}

export type CoupleSocketMessage =
  | { type: 'partner-location'; lat: number; lng: number; accuracyM: number | null; updatedAt: string }
  | { type: 'settings'; packId: string | null; paused: boolean; thresholdM: number }
  | { type: 'role'; myRole: 'A' | 'B' | null; partnerRole: 'A' | 'B' | null }
  | { type: 'linked'; partnerId: string; partnerDisplayName: string | null }
  | { type: 'unlinked' };

/** Push one message to a user's open socket, if they have one. Silently a
 *  no-op when they don't — every route that calls this treats the push as
 *  best-effort (the REST response + the client's own poll fallback are the
 *  reliable path; this is only the "make it feel instant" path on top). */
export function sendToUser(userId: string, message: CoupleSocketMessage): void {
  const ws = socketsByUserId.get(userId);
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(message));
}
