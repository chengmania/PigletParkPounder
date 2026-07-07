import { describe, expect, test } from 'bun:test';
import { COUNTRY_CENTROIDS, lookupHunterLocation, US_STATE_CENTROIDS } from '../src/shared/hunter-locations.ts';

describe('lookupHunterLocation', () => {
  test('matches a 2-letter US state code', () => {
    const loc = lookupHunterLocation('FL');
    expect(loc?.label).toBe('Florida');
    expect(loc?.lat).toBeCloseTo(US_STATE_CENTROIDS.FL!.lat);
  });

  test('matches a full US state name, case-insensitively', () => {
    expect(lookupHunterLocation('florida')?.label).toBe('Florida');
    expect(lookupHunterLocation('Pennsylvania')?.label).toBe('Pennsylvania');
  });

  test('matches an ISO 3166-1 alpha-2 country code (one that does not collide with a US state code)', () => {
    const loc = lookupHunterLocation('JP');
    expect(loc?.label).toBe('Japan');
  });

  test('a US state code wins over a colliding ISO country code (DE -> Delaware, not Germany)', () => {
    expect(lookupHunterLocation('DE')?.label).toBe('Delaware');
  });

  test('matches a full country name, case-insensitively', () => {
    expect(lookupHunterLocation('germany')?.label).toBe('Germany');
    expect(lookupHunterLocation('Japan')?.label).toBe('Japan');
  });

  test('matches a common DXCC prefix alias for a DX contact', () => {
    expect(lookupHunterLocation('DL')?.label).toBe('Germany');
    expect(lookupHunterLocation('JA')?.label).toBe('Japan');
    expect(lookupHunterLocation('VK')?.label).toBe('Australia');
  });

  test('a bare "DX" marker with no country given yields no pin', () => {
    expect(lookupHunterLocation('DX')).toBeUndefined();
  });

  test('unrecognized text yields no pin (never blocks or guesses wrong)', () => {
    expect(lookupHunterLocation('somewhere out there')).toBeUndefined();
  });

  test('blank/undefined input yields no pin', () => {
    expect(lookupHunterLocation('')).toBeUndefined();
    expect(lookupHunterLocation('   ')).toBeUndefined();
    expect(lookupHunterLocation(undefined)).toBeUndefined();
  });

  test('US state reading wins over a colliding ISO country code (IN -> Indiana, not India)', () => {
    expect(lookupHunterLocation('IN')?.label).toBe('Indiana');
    expect(COUNTRY_CENTROIDS.IN?.name).toBe('India'); // the collision really exists in the data
  });

  test('US state name wins over an identically-named country (Georgia)', () => {
    expect(lookupHunterLocation('Georgia')?.label).toBe('Georgia');
    expect(lookupHunterLocation('Georgia')?.lat).toBeCloseTo(US_STATE_CENTROIDS.GA!.lat);
  });
});
