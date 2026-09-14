import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { verifyToken } from '@clerk/backend';
import { WebSocketServer, type WebSocket } from 'ws';

import { env } from '../env.js';

/**
 * Push channel for live post stats (view/regeneration counts) — added
 * 2026-09-11 for the post detail screen (src/app/post/[id].tsx) to show
 * numbers ticking up in real time, the way watching a TikTok/YouTube
 * counter does, rather than only updating on the next screen load.
 *
 * Deliberately a SEPARATE socket server from coupleSocket.ts, not a
 * generalization of it, because the two have a genuinely different
 * addressing model: coupleSocket keeps at most one connection PER USER
 * (push "to Alice"); this one keeps a SET of connections PER POST (push
 * "to everyone currently looking at post X" — could be zero people, could
 * be several strangers watching the same post at once). Forcing both into
 * one keyed-by-what map would make neither case clear. Same in-memory-map
 * scale tradeoff as coupleSocket.ts applies here too — see that file's own
 * comment on what moving to multiple instances would require (Redis
 * pub/sub for this map specifically).
 */

const socketsByPostId = new Map<string, Set<WebSocket>>();

/** Attaches the posts-stats WS endpoint (`/posts/stream?token=...&postId=...`)
 *  to the given HTTP server. Call once, alongside attachCoupleSocketServer
 *  in index.ts. */
export function attachPostsSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/posts/stream') {
      // Not ours — leave it alone so coupleSocket.ts's own upgrade handler
      // (registered separately, also filtering on pathname) still gets a
      // chance to claim it.
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
  const postId = url.searchParams.get('postId');
  if (!token || !postId) {
    ws.close(1008, 'Missing token or postId');
    return;
  }

  // Same standalone-verifyToken reasoning as coupleSocket.ts — a raw
  // WebSocket upgrade never runs clerkMiddleware()/getAuth(req). Any
  // signed-in user may watch any post's stats (viewing isn't ownership-
  // gated — see posts.ts's GET /posts/:id), so the only thing this needs
  // to confirm is that the connection belongs to a real signed-in user,
  // not which one.
  try {
    await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  let subscribers = socketsByPostId.get(postId);
  if (!subscribers) {
    subscribers = new Set();
    socketsByPostId.set(postId, subscribers);
  }
  subscribers.add(ws);

  const cleanup = () => {
    const set = socketsByPostId.get(postId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) socketsByPostId.delete(postId);
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

export type PostSocketMessage = { type: 'stats'; viewCount: number; regenerationCount: number };

/** Push a post's latest counts to everyone currently watching it. Silently
 *  a no-op when nobody's connected — every caller treats this as
 *  best-effort on top of the REST response, same as coupleSocket's
 *  sendToUser. */
export function broadcastPostStats(postId: string, stats: { viewCount: number; regenerationCount: number }): void {
  const subscribers = socketsByPostId.get(postId);
  if (!subscribers || subscribers.size === 0) return;
  const payload = JSON.stringify({ type: 'stats', ...stats } satisfies PostSocketMessage);
  for (const ws of subscribers) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
