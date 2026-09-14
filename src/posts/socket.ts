import { getClerkInstance } from '@clerk/expo';

/**
 * WebSocket client for one post's live stats (view/regeneration counts) —
 * added 2026-09-11 so the post detail screen (src/app/post/[id].tsx) can
 * show numbers ticking up in real time instead of only on next load, the
 * way watching a TikTok/YouTube counter does. Mirrors src/couple/socket.ts's
 * shape (a connect function returning a teardown callback, capped
 * exponential backoff on reconnect) — see that file's doc comment for why
 * that pattern exists; it's copied here rather than shared because the two
 * sockets otherwise have nothing in common (different server module,
 * different message shape, subscribed to a postId instead of implicit "my
 * own channel").
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function getAuthToken(): Promise<string | null> {
  const clerk = getClerkInstance();
  return (await clerk.session?.getToken()) ?? null;
}

type ServerMessage = { type: 'stats'; viewCount: number; regenerationCount: number };

export type PostSocketEvents = {
  onStats?: (stats: { viewCount: number; regenerationCount: number }) => void;
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
let torndown = true;
let events: PostSocketEvents = {};
let currentPostId: string | null = null;

/** Open a live-stats connection for one post. Returns a teardown function —
 *  call it on unmount (or before connecting to a different post). */
export function connectPostSocket(postId: string, handlers: PostSocketEvents = {}): () => void {
  torndown = false;
  events = handlers;
  currentPostId = postId;
  reconnectDelayMs = 1000;
  void openSocket();

  return () => {
    torndown = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.close(1000, 'client teardown');
    ws = null;
  };
}

async function openSocket(): Promise<void> {
  if (torndown || !currentPostId) return;
  if (!API_URL) return;
  const token = await getAuthToken();
  if (!token || torndown) return; // signed out, or torn down mid-await

  const wsBase = API_URL.replace(/^http/, 'ws');
  const socket = new WebSocket(
    `${wsBase}/posts/stream?token=${encodeURIComponent(token)}&postId=${encodeURIComponent(currentPostId)}`,
  );
  ws = socket;

  socket.onopen = () => {
    reconnectDelayMs = 1000;
  };
  socket.onmessage = (event) => handleMessage(event.data);
  // onerror is always followed by onclose for a WebSocket — reconnect logic
  // lives in one place (onclose) rather than duplicated in both handlers.
  socket.onclose = () => {
    if (ws === socket) ws = null;
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (torndown || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void openSocket();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, reconnectDelayMs * 2);
}

function handleMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;
  let msg: ServerMessage;
  try {
    msg = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }
  if (msg.type === 'stats') {
    events.onStats?.({ viewCount: msg.viewCount, regenerationCount: msg.regenerationCount });
  }
}
