import type { ClientMessage } from '../shared/protocol.ts';

const STORAGE_KEY = 'pdd-outbox';

export function loadOutbox(): ClientMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClientMessage[]) : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: ClientMessage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueue(msg: ClientMessage): void {
  const items = loadOutbox();
  items.push(msg);
  saveOutbox(items);
}

export function clearOutbox(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Drains the queue and hands each message to sendFn in original order.
// Callers are expected to have a live connection before calling this.
export function flush(sendFn: (msg: ClientMessage) => void): void {
  const items = loadOutbox();
  clearOutbox();
  for (const item of items) sendFn(item);
}
