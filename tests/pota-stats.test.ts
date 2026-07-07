import { describe, expect, test } from 'bun:test';
import { ACTIVATION_THRESHOLD, computeStats } from '../src/shared/pota-stats.ts';
import { makeQso } from './fixtures.ts';

describe('computeStats', () => {
  test('empty log', () => {
    const stats = computeStats([]);
    expect(stats.totalQsos).toBe(0);
    expect(stats.uniqueCallsigns).toBe(0);
    expect(stats.parkToParkCount).toBe(0);
    expect(stats.perPark).toEqual([]);
  });

  test('excludes deleted and dupe-flagged QSOs from totals', () => {
    const qsos = [makeQso({ call: 'W2ABC' }), makeQso({ call: 'W3DEF', deleted: true }), makeQso({ call: 'W4GHI', dupe: true })];
    const stats = computeStats(qsos);
    expect(stats.totalQsos).toBe(1);
    expect(stats.uniqueCallsigns).toBe(1);
  });

  test('counts unique callsigns by base call, ignoring portable suffixes', () => {
    const qsos = [makeQso({ call: 'W2ABC' }), makeQso({ call: 'W2ABC/P' })];
    const stats = computeStats(qsos);
    expect(stats.totalQsos).toBe(2);
    expect(stats.uniqueCallsigns).toBe(1);
  });

  test('counts park-to-park QSOs', () => {
    const qsos = [makeQso({ call: 'W2ABC', theirPark: 'K-9999' }), makeQso({ call: 'W3DEF' })];
    const stats = computeStats(qsos);
    expect(stats.parkToParkCount).toBe(1);
  });

  test('tallies per-operator/band/mode counts', () => {
    const qsos = [
      makeQso({ call: 'W2ABC', operatorCall: 'W1OP', band: '20m', mode: 'SSB' }),
      makeQso({ call: 'W3DEF', operatorCall: 'W1OP', band: '40m', mode: 'CW' }),
      makeQso({ call: 'W4GHI', operatorCall: 'W2OP', band: '20m', mode: 'SSB' }),
    ];
    const stats = computeStats(qsos);
    expect(stats.perOperator).toEqual({ W1OP: 2, W2OP: 1 });
    expect(stats.perBand['20m']).toBe(2);
    expect(stats.perMode.SSB).toBe(2);
  });

  test('groups per-park stats by (myPark, UTC day) and flags activation credit at the threshold', () => {
    const qsos = Array.from({ length: ACTIVATION_THRESHOLD }, (_, i) =>
      makeQso({ call: `W1AAA${i}`, myPark: 'K-1234', myState: 'PA', ts: '2026-06-27T19:00:00.000Z' }),
    );
    const stats = computeStats(qsos);
    expect(stats.perPark).toHaveLength(1);
    expect(stats.perPark[0]).toMatchObject({ park: 'K-1234', state: 'PA', dateUtc: '2026-06-27', qsoCount: 10, uniqueCallsigns: 10, activated: true });
  });

  test('below the activation threshold, activated is false', () => {
    const qsos = [makeQso({ call: 'W1AAA', myPark: 'K-1234' })];
    const stats = computeStats(qsos);
    expect(stats.perPark[0]?.activated).toBe(false);
  });

  test('the same park on different UTC days is tracked separately', () => {
    const qsos = [
      makeQso({ call: 'W1AAA', myPark: 'K-1234', ts: '2026-06-27T19:00:00.000Z' }),
      makeQso({ call: 'W1BBB', myPark: 'K-1234', ts: '2026-06-28T19:00:00.000Z' }),
    ];
    const stats = computeStats(qsos);
    expect(stats.perPark).toHaveLength(2);
  });

  test('a simultaneous multi-park activation (comma-separated myPark) credits each park independently', () => {
    const qsos = [
      makeQso({ call: 'W1AAA', myPark: 'K-1234,K-5678', ts: '2026-06-27T19:00:00.000Z' }),
      makeQso({ call: 'W1BBB', myPark: 'K-1234,K-5678', ts: '2026-06-27T19:05:00.000Z' }),
    ];
    const stats = computeStats(qsos);
    expect(stats.perPark).toHaveLength(2);
    const parks = stats.perPark.map((p) => p.park).sort();
    expect(parks).toEqual(['K-1234', 'K-5678']);
    for (const p of stats.perPark) {
      expect(p.qsoCount).toBe(2);
      expect(p.uniqueCallsigns).toBe(2);
    }
  });
});
