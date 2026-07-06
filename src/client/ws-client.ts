import { applyEvent } from '../shared/journal.ts';
import { fullStateToState, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { enqueue, flush } from './outbox.ts';
import { store } from './store.ts';

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;
const PING_INTERVAL_MS = 15_000;

let socket: WebSocket | null = null;
let url = '';
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let manuallyClosed = false;

// Lets screens (e.g. the logging screen's optimistic row) react to the
// server's authoritative response to a specific qso:add without having to
// guess-match it back by call/band/mode.
type QsoAddOutcome = { clientId: string; ok: true } | { clientId: string; ok: false; reason: string };
const qsoAddListeners = new Set<(outcome: QsoAddOutcome) => void>();

export function onQsoAddOutcome(fn: (outcome: QsoAddOutcome) => void): () => void {
  qsoAddListeners.add(fn);
  return () => qsoAddListeners.delete(fn);
}

export function connect(targetUrl: string): void {
  url = targetUrl;
  manuallyClosed = false;
  openSocket();
}

function openSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  store.set({ connection: 'connecting' });
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    store.set({ connection: 'connected' });
    reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

    // A dropped connection loses the server's per-socket operatorCall, so a
    // reconnect must re-hello before anything else on this new socket will
    // be accepted. Message order on a single WebSocket is preserved, so the
    // outbox flush right after is guaranteed to land after the re-hello.
    const you = store.get().you;
    if (you) rawSend({ type: 'hello', operatorCall: you.call });
    flush(rawSend);

    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => rawSend({ type: 'ping', t: Date.now() }), PING_INTERVAL_MS);
  });

  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    handleServerMessage(msg);
  });

  socket.addEventListener('close', () => {
    store.set({ connection: 'offline' });
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    store.set({ connection: 'offline' });
  });
}

function scheduleReconnect(): void {
  if (manuallyClosed || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
}

function rawSend(msg: ClientMessage): void {
  socket!.send(JSON.stringify(msg));
}

// Sends immediately if connected; otherwise queues in the localStorage
// outbox for replay once the connection (and re-hello) completes, per the
// offline-first requirement that a dropped WiFi connection must never stop
// logging.
export function send(msg: ClientMessage): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    rawSend(msg);
  } else {
    enqueue(msg);
  }
}

function handleServerMessage(msg: ServerMessage): void {
  const current = store.get();

  switch (msg.type) {
    case 'welcome': {
      store.set({
        you: msg.you,
        data: fullStateToState(msg.state),
        seq: msg.state.seq,
        serverTimeOffsetMs: new Date(msg.serverNowUtc).getTime() - Date.now(),
      });
      break;
    }
    case 'event': {
      store.set({ data: applyEvent(current.data, msg.event), seq: msg.seq });
      if (msg.event.type === 'qso:add') {
        for (const fn of qsoAddListeners) fn({ clientId: msg.event.clientId, ok: true });
      }
      break;
    }
    case 'reject': {
      console.warn(`[server] rejected ${msg.refType ?? ''}: ${msg.reason}`);
      if (msg.refType === 'qso:add' && msg.clientId) {
        for (const fn of qsoAddListeners) fn({ clientId: msg.clientId, ok: false, reason: msg.reason });
      }
      break;
    }
    case 'pong': {
      store.set({ serverTimeOffsetMs: new Date(msg.serverNowUtc).getTime() - Date.now() });
      break;
    }
  }
}

export function serverNow(): Date {
  return new Date(Date.now() + store.get().serverTimeOffsetMs);
}
