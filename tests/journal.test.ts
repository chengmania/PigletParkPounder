import { describe, expect, test } from 'bun:test';
import { createInitialState, fold, reservationKey } from '../src/shared/journal.ts';
import type { JournalEvent } from '../src/shared/journal.ts';
import type { ClubConfig, Qso } from '../src/shared/types.ts';

function makeConfig(overrides: Partial<ClubConfig> = {}): ClubConfig {
  return {
    clubName: 'Test Club',
    clubCall: 'W1TEST',
    stations: ['R01'],
    stationParks: { R01: { parkNumber: 'K-1234' } },
    eventStartUtc: '2026-06-27T18:00:00.000Z',
    eventEndUtc: '2026-06-28T20:59:00.000Z',
    ...overrides,
  };
}

function makeQso(overrides: Partial<Qso> = {}): Qso {
  return {
    id: 'q1',
    ts: '2026-06-27T19:00:00.000Z',
    station: 'R01',
    band: '20m',
    mode: 'SSB',
    call: 'W1ABC',
    operatorCall: 'W1OP',
    myPark: 'K-1234',
    rstSent: '59',
    rstRcvd: '59',
    ...overrides,
  };
}

describe('fold', () => {
  test('empty event list yields initial state', () => {
    const state = fold([]);
    expect(state.config).toBeNull();
    expect(state.qsos.size).toBe(0);
  });

  test('config:set fully replaces config on redo', () => {
    const events: JournalEvent[] = [
      { type: 'config:set', ts: 't1', config: makeConfig({ clubName: 'First' }) },
      { type: 'config:set', ts: 't2', config: makeConfig({ clubName: 'Second' }) },
    ];
    const state = fold(events);
    expect(state.config?.clubName).toBe('Second');
  });

  test('reservations are keyed per station+band+mode', () => {
    const events: JournalEvent[] = [
      { type: 'slot:reserve', ts: 't1', band: '20m', mode: 'SSB', station: 'R01', operatorCall: 'W1OP' },
      { type: 'slot:reserve', ts: 't2', band: '20m', mode: 'SSB', station: 'R02', operatorCall: 'W1OP2' },
    ];
    const state = fold(events);
    expect(state.reservations.size).toBe(2);
    expect(state.reservations.get(reservationKey('R01', '20m', 'SSB'))?.operatorCall).toBe('W1OP');
    expect(state.reservations.get(reservationKey('R02', '20m', 'SSB'))?.operatorCall).toBe('W1OP2');
  });

  test('slot:release removes the reservation', () => {
    const events: JournalEvent[] = [
      { type: 'slot:reserve', ts: 't1', band: '20m', mode: 'SSB', station: 'R01', operatorCall: 'W1OP' },
      { type: 'slot:release', ts: 't2', band: '20m', mode: 'SSB', station: 'R01' },
    ];
    const state = fold(events);
    expect(state.reservations.size).toBe(0);
  });

  test('qso:delete is a soft delete -- record stays retrievable', () => {
    const qso = makeQso();
    const events: JournalEvent[] = [
      { type: 'qso:add', ts: 't1', qso, clientId: 'c1' },
      { type: 'qso:delete', ts: 't2', id: qso.id },
    ];
    const state = fold(events);
    expect(state.qsos.get(qso.id)?.deleted).toBe(true);
    expect(state.qsos.size).toBe(1);
  });

  test('qso:edit patches only the whitelisted fields', () => {
    const qso = makeQso();
    const events: JournalEvent[] = [
      { type: 'qso:add', ts: 't1', qso, clientId: 'c1' },
      { type: 'qso:edit', ts: 't2', id: qso.id, patch: { theirPark: 'K-9999' } },
    ];
    const state = fold(events);
    expect(state.qsos.get(qso.id)?.theirPark).toBe('K-9999');
    expect(state.qsos.get(qso.id)?.call).toBe('W1ABC');
  });

  test('qso:add records the clientId -> id mapping for idempotency', () => {
    const qso = makeQso();
    const state = fold([{ type: 'qso:add', ts: 't1', qso, clientId: 'c1' }]);
    expect(state.qsoIdByClientId.get('c1')).toBe(qso.id);
  });

  test('applyEvent does not mutate the input state', () => {
    const before = createInitialState();
    const after = fold([{ type: 'op:join', ts: 't1', call: 'W1OP' }], before);
    expect(before.operators.size).toBe(0);
    expect(after.operators.size).toBe(1);
  });
});
