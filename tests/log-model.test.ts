import { describe, expect, test } from 'bun:test';
import { buildIdentity } from '../src/client/log-model.ts';
import { makeConfig } from './fixtures.ts';

describe('buildIdentity', () => {
  test('empty state with no config and no reservation', () => {
    const identity = buildIdentity(null, null);
    expect(identity).toEqual({ callsign: '', entryClass: '', section: '', bandMode: null, isGota: false });
  });

  test('MAIN context shows the club callsign', () => {
    const config = makeConfig({ clubCall: 'W1CLUB', entryClass: '3A', section: 'EPA' });
    const identity = buildIdentity(config, { station: 'MAIN', band: '20m', mode: 'PH' });
    expect(identity).toEqual({ callsign: 'W1CLUB', entryClass: '3A', section: 'EPA', bandMode: '20m PH', isGota: false });
  });

  test('GOTA context shows the GOTA callsign and flags isGota', () => {
    const config = makeConfig({ clubCall: 'W1CLUB', gotaCall: 'W1GOTA', entryClass: '3A', section: 'EPA' });
    const identity = buildIdentity(config, { station: 'GOTA', band: '40m', mode: 'CW' });
    expect(identity).toEqual({ callsign: 'W1GOTA', entryClass: '3A', section: 'EPA', bandMode: '40m CW', isGota: true });
  });

  test('config present but no reservation yet -- bandMode is null', () => {
    const config = makeConfig();
    const identity = buildIdentity(config, null);
    expect(identity.bandMode).toBeNull();
  });
});
