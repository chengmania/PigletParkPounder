import { describe, expect, test } from 'bun:test';
import { isValidCallsign, isValidClass } from '../src/shared/validate.ts';

describe('isValidClass', () => {
  test('accepts a bare class letter', () => {
    expect(isValidClass('3A')).toBe(true);
    expect(isValidClass('1D')).toBe(true);
    expect(isValidClass('1B')).toBe(true);
  });

  test('accepts the documented AB/BB battery-suffix combinations', () => {
    expect(isValidClass('1AB')).toBe(true);
    expect(isValidClass('2BB')).toBe(true);
  });

  test('rejects nonsense battery-suffix combos that are not real FD designations', () => {
    expect(isValidClass('2CB')).toBe(false);
    expect(isValidClass('2DB')).toBe(false);
    expect(isValidClass('2EB')).toBe(false);
    expect(isValidClass('2FB')).toBe(false);
  });

  test('rejects garbage', () => {
    expect(isValidClass('')).toBe(false);
    expect(isValidClass('3Z')).toBe(false);
    expect(isValidClass('A3')).toBe(false);
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
