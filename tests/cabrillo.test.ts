import { describe, expect, test } from 'bun:test';
import { toCabrilloLog } from '../src/shared/export/cabrillo.ts';
import { makeConfig, makeQso } from './fixtures.ts';

describe('toCabrilloLog', () => {
  test('emits the required Cabrillo headers and QSO lines in a fixed, parseable format', () => {
    const config = makeConfig({ clubCall: 'W1CLUB', clubName: 'Test Club', entryClass: '3A', section: 'EPA' });
    const qsos = [
      makeQso({ ts: '2026-06-27T19:05:00.000Z', band: '20m', mode: 'PH', call: 'W2ABC', exchClass: '2B', exchSection: 'WPA', station: 'MAIN' }),
      makeQso({ ts: '2026-06-27T20:10:00.000Z', band: '40m', mode: 'CW', call: 'K3DEF', exchClass: '1A', exchSection: 'MDC', station: 'MAIN' }),
    ];

    const log = toCabrilloLog(qsos, config);
    const lines = log.trim().split('\n');

    expect(lines[0]).toBe('START-OF-LOG: 3.0');
    expect(lines).toContain('CALLSIGN: W1CLUB');
    expect(lines).toContain('CONTEST: ARRL-FIELD-DAY');
    expect(lines).toContain('CLASS: 3A');
    expect(lines).toContain('LOCATION: EPA');
    expect(lines).toContain('CLUB: Test Club');
    expect(lines[lines.length - 1]).toBe('END-OF-LOG:');

    expect(lines).toContain('QSO: 14000 PH 2026-06-27 1905 W1CLUB 3A EPA W2ABC 2B WPA');
    expect(lines).toContain('QSO: 7000 CW 2026-06-27 2010 W1CLUB 3A EPA K3DEF 1A MDC');
  });

  test('maps DIG mode to the DG Cabrillo token', () => {
    const config = makeConfig();
    const qsos = [makeQso({ mode: 'DIG', band: '15m' })];
    const log = toCabrilloLog(qsos, config);
    expect(log).toContain(' DG ');
  });

  test('SAT band emits the literal SAT frequency token', () => {
    const config = makeConfig();
    const qsos = [makeQso({ band: 'SAT', mode: 'PH', satelliteName: 'SO-50' })];
    const log = toCabrilloLog(qsos, config);
    expect(log).toContain('QSO: SAT PH');
  });

  test('GOTA QSOs use the GOTA callsign as the sent call', () => {
    const config = makeConfig({ gotaCall: 'W1GOTA' });
    const qsos = [makeQso({ station: 'GOTA' })];
    const log = toCabrilloLog(qsos, config);
    expect(log).toContain('W1GOTA');
  });

  test('excludes deleted and out-of-window QSOs', () => {
    const config = makeConfig();
    const qsos = [makeQso({ deleted: true }), makeQso({ ts: '2020-01-01T00:00:00.000Z' })];
    const log = toCabrilloLog(qsos, config);
    expect(log.split('\n').filter((l) => l.startsWith('QSO:'))).toHaveLength(0);
  });
});
