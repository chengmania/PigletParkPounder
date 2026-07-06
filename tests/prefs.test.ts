import { beforeEach, describe, expect, test } from 'bun:test';
import { readBoolPref, writeBoolPref } from '../src/client/prefs.ts';

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

describe('readBoolPref / writeBoolPref', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns the fallback when nothing is stored', () => {
    expect(readBoolPref('pdd-test-pref', true)).toBe(true);
    expect(readBoolPref('pdd-test-pref', false)).toBe(false);
  });

  test('round-trips a stored true/false value', () => {
    writeBoolPref('pdd-test-pref', true);
    expect(readBoolPref('pdd-test-pref', false)).toBe(true);
    writeBoolPref('pdd-test-pref', false);
    expect(readBoolPref('pdd-test-pref', true)).toBe(false);
  });

  test('falls back on garbage stored values', () => {
    localStorage.setItem('pdd-test-pref', 'garbage');
    expect(readBoolPref('pdd-test-pref', true)).toBe(true);
  });
});
