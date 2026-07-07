import { describe, expect, test } from 'bun:test';
import { buildIdentity } from '../src/client/log-model.ts';
import { makeConfig } from './fixtures.ts';

describe('buildIdentity', () => {
  test('empty state with no config and no reservation', () => {
    const identity = buildIdentity(null, null);
    expect(identity).toEqual({ callsign: '', station: '', park: '', bandMode: null });
  });

  test('shows the club callsign, station id, and that station\'s assigned park', () => {
    const config = makeConfig({ clubCall: 'W1CLUB', stations: ['R01'], stationParks: { R01: { parkNumber: 'K-1234' } } });
    const identity = buildIdentity(config, { station: 'R01', band: '20m', mode: 'SSB' });
    expect(identity).toEqual({ callsign: 'W1CLUB', station: 'R01', park: 'K-1234', bandMode: '20m SSB' });
  });

  test('a station with no park assignment yields an empty park', () => {
    const config = makeConfig({ stations: ['R01', 'R02'], stationParks: { R01: { parkNumber: 'K-1234' } } });
    const identity = buildIdentity(config, { station: 'R02', band: '40m', mode: 'CW' });
    expect(identity.park).toBe('');
  });

  test('config present but no reservation yet -- bandMode is null', () => {
    const config = makeConfig();
    const identity = buildIdentity(config, null);
    expect(identity.bandMode).toBeNull();
  });
});
