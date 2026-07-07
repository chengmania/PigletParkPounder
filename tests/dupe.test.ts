import { describe, expect, test } from 'bun:test';
import { baseCall, checkDupe, normalizeCall, utcDateOf } from '../src/shared/dupe.ts';
import { makeConfig, makeQso } from './fixtures.ts';

describe('normalizeCall', () => {
  test('trims and uppercases', () => {
    expect(normalizeCall(' w1abc ')).toBe('W1ABC');
  });
});

describe('baseCall', () => {
  test('strips /P', () => expect(baseCall('W1ABC/P')).toBe('W1ABC'));
  test('strips /M', () => expect(baseCall('w1abc/M')).toBe('W1ABC'));
  test('strips /QRP', () => expect(baseCall('W1ABC/QRP')).toBe('W1ABC'));
  test('strips /AG', () => expect(baseCall('W1ABC/AG')).toBe('W1ABC'));
  test('strips /MM', () => expect(baseCall('W1ABC/MM')).toBe('W1ABC'));
  test('picks the longest remaining segment for compound calls', () => {
    expect(baseCall('KH6/W1ABCDEF')).toBe('W1ABCDEF');
  });
});

describe('utcDateOf', () => {
  test('extracts the UTC date portion of an ISO timestamp', () => {
    expect(utcDateOf('2026-06-27T19:00:00.000Z')).toBe('2026-06-27');
  });
});

describe('checkDupe', () => {
  const config = makeConfig();
  const dateUtc = '2026-06-27';

  test('new call, empty log', () => {
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', dateUtc }, [], config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toEqual([]);
  });

  test('exact key already logged is a dupe', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('DUPE');
    expect(result.exactDupe).toBeDefined();
  });

  test('same call, different band -> NEW with workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB' })];
    const result = checkDupe({ call: 'W1ABC', band: '40m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toHaveLength(1);
    expect(result.workedElsewhere[0]?.band).toBe('20m');
  });

  test('same call, different mode -> NEW with workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'CW', dateUtc }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toHaveLength(1);
  });

  test('same call/band/mode/day logged by a different internal station is still a club-wide dupe (guide section 7.1)', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', station: 'R01', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('different UTC day is NEW -- dupes are scoped per day', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', ts: '2026-06-26T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', dateUtc: '2026-06-27' }, log, config);
    expect(result.status).toBe('NEW');
  });

  test('park-to-park: same hunter from a different park is a unique QSO (SIG_INFO differentiates)', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', theirPark: 'K-1111', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', theirPark: 'K-2222', dateUtc }, log, config);
    expect(result.status).toBe('NEW');
  });

  test('park-to-park: same hunter, same park, is a dupe', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', theirPark: 'K-1111', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', theirPark: 'K-1111', dateUtc }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('portable suffix collapses to same base for dupe purposes', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: 'W1ABC/P', band: '20m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('whitespace/case collapse still matches', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', ts: '2026-06-27T19:00:00.000Z' })];
    const result = checkDupe({ call: ' w1abc ', band: '20m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('DUPE');
  });

  test('soft-deleted QSO is ignored for both dupe and workedElsewhere', () => {
    const log = [makeQso({ call: 'W1ABC', band: '20m', mode: 'SSB', deleted: true })];
    const result = checkDupe({ call: 'W1ABC', band: '20m', mode: 'SSB', dateUtc }, log, config);
    expect(result.status).toBe('NEW');
    expect(result.workedElsewhere).toEqual([]);
  });

  test('blocks own club call (guide section 7.2), never overridable via status', () => {
    const result = checkDupe({ call: config.clubCall, band: '20m', mode: 'SSB', dateUtc }, [], config);
    expect(result.status).toBe('BLOCKED_SELF');
  });
});
