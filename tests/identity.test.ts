import { beforeEach, describe, expect, test } from 'bun:test';
import { clearIdentity, loadIdentity, saveIdentity } from '../src/client/identity.ts';

// bun:test's runtime has no browser globals -- provide a minimal in-memory
// localStorage shim so this pure-logic module can be exercised directly.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

describe('saveIdentity / loadIdentity / clearIdentity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns null when nothing is stored', () => {
    expect(loadIdentity()).toBeNull();
  });

  test('round-trips a saved identity', () => {
    saveIdentity({ call: 'W1AW', name: 'Hiram' });
    expect(loadIdentity()).toEqual({ call: 'W1AW', name: 'Hiram' });
  });

  test('clearIdentity removes the stored identity', () => {
    saveIdentity({ call: 'W1AW' });
    clearIdentity();
    expect(loadIdentity()).toBeNull();
  });

  test('falls back to null on garbage or call-less stored values', () => {
    localStorage.setItem('ppp-identity', 'not json');
    expect(loadIdentity()).toBeNull();
    localStorage.setItem('ppp-identity', JSON.stringify({ name: 'no call' }));
    expect(loadIdentity()).toBeNull();
  });
});
