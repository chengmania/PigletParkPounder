import { describe, expect, test } from 'bun:test';
import { describeDupe } from '../src/client/dupe-live.ts';
import type { DupeResult } from '../src/shared/dupe.ts';
import { makeQso } from './fixtures.ts';

describe('describeDupe', () => {
  test('NEW status', () => {
    const result: DupeResult = { status: 'NEW', workedElsewhere: [] };
    const ui = describeDupe(result);
    expect(ui.label).toBe('NEW');
    expect(ui.className).toBe('dupe-new');
    expect(ui.blockedHard).toBe(false);
    expect(ui.requiresOverride).toBe(false);
  });

  test('DUPE with an exactDupe present includes operator, time, and band/mode in the detail', () => {
    const exactDupe = makeQso({ operatorCall: 'W1FIRST', ts: '2026-06-27T19:05:00.000Z', band: '20m', mode: 'SSB' });
    const result: DupeResult = { status: 'DUPE', workedElsewhere: [], exactDupe };
    const ui = describeDupe(result);
    expect(ui.label).toBe('DUPE');
    expect(ui.className).toBe('dupe-dupe');
    expect(ui.requiresOverride).toBe(true);
    expect(ui.blockedHard).toBe(false);
    expect(ui.workedElsewhereText).toContain('W1FIRST');
    expect(ui.workedElsewhereText).toContain('19:05 UTC');
    expect(ui.workedElsewhereText).toContain('20m/SSB');
  });

  test('DUPE without an exactDupe falls back to the workedElsewhere summary', () => {
    const result: DupeResult = {
      status: 'DUPE',
      workedElsewhere: [{ band: '40m', mode: 'CW', ts: 't', by: 'W1OTHER' }],
    };
    const ui = describeDupe(result);
    expect(ui.workedElsewhereText).toContain('40m/CW');
  });

  test('BLOCKED_SELF is never overridable', () => {
    const result: DupeResult = { status: 'BLOCKED_SELF', workedElsewhere: [] };
    const ui = describeDupe(result);
    expect(ui.blockedHard).toBe(true);
    expect(ui.requiresOverride).toBe(false);
  });
});
