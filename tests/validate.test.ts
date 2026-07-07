import { describe, expect, test } from 'bun:test';
import { isValidCallsign, isValidParkList, isValidParkNumber, splitParkList } from '../src/shared/validate.ts';

describe('isValidParkNumber', () => {
  test('accepts plausible POTA park references', () => {
    expect(isValidParkNumber('K-1234')).toBe(true);
    expect(isValidParkNumber('VE-0001')).toBe(true);
    expect(isValidParkNumber('G-12345')).toBe(true);
    expect(isValidParkNumber('k-1234')).toBe(true);
  });

  test('rejects garbage', () => {
    expect(isValidParkNumber('')).toBe(false);
    expect(isValidParkNumber('K1234')).toBe(false);
    expect(isValidParkNumber('K-12')).toBe(false);
    expect(isValidParkNumber('TOOLONGPREFIX-1234')).toBe(false);
  });
});

describe('splitParkList', () => {
  test('splits, trims, and uppercases comma-separated parks', () => {
    expect(splitParkList('k-1234, k-5678')).toEqual(['K-1234', 'K-5678']);
  });

  test('single park -> single-element array', () => {
    expect(splitParkList('K-1234')).toEqual(['K-1234']);
  });

  test('empty segments are dropped', () => {
    expect(splitParkList('K-1234,,K-5678,')).toEqual(['K-1234', 'K-5678']);
  });
});

describe('isValidParkList', () => {
  test('accepts a single valid park', () => {
    expect(isValidParkList('K-1234')).toBe(true);
  });

  test('accepts multiple valid comma-separated parks (simultaneous multi-park activation)', () => {
    expect(isValidParkList('K-1234, K-5678')).toBe(true);
  });

  test('rejects if any segment is invalid', () => {
    expect(isValidParkList('K-1234, not-a-park')).toBe(false);
  });

  test('rejects empty input', () => {
    expect(isValidParkList('')).toBe(false);
    expect(isValidParkList(',,,')).toBe(false);
  });
});

describe('isValidCallsign', () => {
  test('accepts plausible ham callsigns', () => {
    expect(isValidCallsign('W1ABC')).toBe(true);
    expect(isValidCallsign('K5X')).toBe(true);
  });

  test('rejects empty/too-short input', () => {
    expect(isValidCallsign('')).toBe(false);
    expect(isValidCallsign('AB')).toBe(false);
  });
});
