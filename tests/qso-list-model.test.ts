import { describe, expect, test } from 'bun:test';
import { sortNewestFirst, toQsoRow } from '../src/client/qso-list-model.ts';
import { makeQso } from './fixtures.ts';

describe('toQsoRow', () => {
  test('maps all fields correctly', () => {
    const q = makeQso({
      call: 'W2ABC',
      ts: '2026-06-27T19:05:00.000Z',
      band: '20m',
      mode: 'CW',
      rstSent: '599',
      rstRcvd: '579',
      myPark: 'K-1234',
      theirPark: 'K-5678',
      operatorCall: 'W1OP',
      station: 'R01',
    });
    const row = toQsoRow(q, 'W1OP');
    expect(row).toEqual({
      id: q.id,
      call: 'W2ABC',
      utc: '2026-06-27 19:05',
      band: '20m',
      mode: 'CW',
      rstSent: '599',
      rstRcvd: '579',
      myPark: 'K-1234',
      theirPark: 'K-5678',
      operatorCall: 'W1OP',
      station: 'R01',
      isDupe: false,
      isDeleted: false,
      isMine: true,
    });
  });

  test('isMine is false for another operator or a null youCall', () => {
    const q = makeQso({ operatorCall: 'W1OP' });
    expect(toQsoRow(q, 'W2OTHER').isMine).toBe(false);
    expect(toQsoRow(q, null).isMine).toBe(false);
  });

  test('surfaces isDupe and isDeleted flags', () => {
    const q = makeQso({ dupe: true, deleted: true });
    const row = toQsoRow(q, null);
    expect(row.isDupe).toBe(true);
    expect(row.isDeleted).toBe(true);
  });
});

describe('sortNewestFirst', () => {
  test('orders by ts descending', () => {
    const qsos = [
      makeQso({ id: 'a', ts: '2026-06-27T19:00:00.000Z' }),
      makeQso({ id: 'c', ts: '2026-06-27T21:00:00.000Z' }),
      makeQso({ id: 'b', ts: '2026-06-27T20:00:00.000Z' }),
    ];
    expect(sortNewestFirst(qsos).map((q) => q.id)).toEqual(['c', 'b', 'a']);
  });
});
