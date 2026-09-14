import type { CoupleRole } from '@/utils/api';
import { coupleSocketUrl } from './api';
import { useCoupleStore } from './store';

/**
 * WebSocket client for the couple-proximity push channel — the replacement
 * for what a Supabase Realtime subscription did in the feature this was
 * ported from. Mirrors that module's public shape (a connect function
 * returning an unsubscribe/teardown callback) so bootstrap.ts barely
 * changes from the original wiring.
 *
 * Reconnects with capped exponential backoff (1s → 30s) since a mobile
 * connection drops constantly (backgrounding, a tunnel, wifi↔cell
 * handoff) — this is the "make it feel instant" layer on top of the
 * resilience poll bootstrap.ts also runs, not the only path partner
 * updates can arrive by.
 */

type ServerMessage =
  | { type: 'partner-location'; lat: number; lng: number; accuracyM: number | null; updatedAt: string }
  | {
      type: 'settings';
      packId: string | null;
      customPackTogetherUrl: string | null;
      customPackAUrl: string | null;
      customPackBUrl: string | null;
      paused: boolean;
      thresholdM: number;
    }
  | { type: 'role'; myRole: CoupleRole | null; partnerRole: CoupleRole | null }
  | { type: 'linked'; partnerId: string; partnerDisplayName: string | null }
  | { type: 'unlinked' };

export type CoupleSocketEvents = {
  /** The code-sharer's partner just accepted their pairing code — bootstrap
   *  re-fetches GET /couple/profile so the newly-linked partner shows up
   *  without waiting for the next poll. */
  onLinked?: () => void;
  /** The partner unlinked from the other side. */
  onUnlinked?: () => void;
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
let torndown = true;
let events: CoupleSocketEvents = {};

/** Open the socket (idempotent-ish: call `disconnect` first if already
 *  connected for a different couple). Returns a teardown function. */
export function connectCoupleSocket(handlers: CoupleSocketEvents = {}): () => void {
  torndown = false;
  events = handlers;
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
  if (torndown) return;
  const url = await coupleSocketUrl();
  if (!url || torndown) return; // signed out, no API URL, or torn down mid-await

  const socket = new WebSocket(url);
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

  switch (msg.type) {
    case 'partner-location':
      useCoupleStore
        .getState()
        .setPartnerLocation(msg.lat, msg.lng, new Date(msg.updatedAt).getTime(), msg.accuracyM);
      break;
    case 'settings':
      useCoupleStore.getState().setSettings({
        packId: msg.packId,
        customPackTogetherUrl: msg.customPackTogetherUrl,
        customPackAUrl: msg.customPackAUrl,
        customPackBUrl: msg.customPackBUrl,
        paused: msg.paused,
        thresholdM: msg.thresholdM,
      });
      break;
    case 'role': {
      // Sent from the recipient's own point of view — `myRole` is this
      // device's role as the server currently has it (self-healing any
      // drift), `partnerRole` is what the partner just picked.
      const s = useCoupleStore.getState();
      s.setCoupleState({
        hasPartner: s.hasPartner,
        partner: s.partner,
        myRole: msg.myRole,
        partnerRole: msg.partnerRole,
        packId: s.packId,
        customPackTogetherUrl: s.customPackTogetherUrl,
        customPackAUrl: s.customPackAUrl,
        customPackBUrl: s.customPackBUrl,
        paused: s.paused,
        thresholdM: s.thresholdM,
      });
      break;
    }
    case 'linked':
      events.onLinked?.();
      break;
    case 'unlinked':
      events.onUnlinked?.();
      break;
  }
}
