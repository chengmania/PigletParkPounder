import type { ClubConfig, Qso } from '../src/shared/types.ts';

export function makeConfig(overrides: Partial<ClubConfig> = {}): ClubConfig {
  return {
    clubName: 'Test Club',
    clubCall: 'W1CLUB',
    stations: ['R01'],
    stationParks: { R01: { parkNumber: 'K-1234', parkName: 'Test Park', state: 'PA' } },
    eventStartUtc: '2026-06-27T18:00:00.000Z',
    eventEndUtc: '2026-06-28T20:59:00.000Z',
    ...overrides,
  };
}

let qsoCounter = 0;
export function makeQso(overrides: Partial<Qso> = {}): Qso {
  qsoCounter += 1;
  return {
    id: `q${qsoCounter}`,
    ts: '2026-06-27T19:00:00.000Z',
    station: 'R01',
    band: '20m',
    mode: 'SSB',
    call: 'W1ABC',
    operatorCall: 'W1OP',
    myPark: 'K-1234',
    myState: 'PA',
    rstSent: '59',
    rstRcvd: '59',
    ...overrides,
  };
}
