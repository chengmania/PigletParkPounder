import { describe, expect, test } from 'bun:test';
import { MODE_IDS, modeGroupOf, modesInGroup } from '../src/shared/modes.ts';

describe('modeGroupOf', () => {
  test('SSB/CW/FM map to their own group', () => {
    expect(modeGroupOf('SSB')).toBe('SSB');
    expect(modeGroupOf('CW')).toBe('CW');
    expect(modeGroupOf('FM')).toBe('FM');
  });

  test('every digital submode maps to DIGI', () => {
    for (const id of ['FT8', 'FT4', 'RTTY', 'PSK31']) expect(modeGroupOf(id)).toBe('DIGI');
  });

  test('AM was dropped -- not a valid mode id anymore', () => {
    expect(MODE_IDS).not.toContain('AM');
  });
});

describe('modesInGroup', () => {
  test('SSB/CW/FM groups have exactly one member, themselves', () => {
    expect(modesInGroup('SSB').map((m) => m.id)).toEqual(['SSB']);
    expect(modesInGroup('CW').map((m) => m.id)).toEqual(['CW']);
    expect(modesInGroup('FM').map((m) => m.id)).toEqual(['FM']);
  });

  test('DIGI expands to all four digital submodes', () => {
    expect(modesInGroup('DIGI').map((m) => m.id)).toEqual(['FT8', 'FT4', 'RTTY', 'PSK31']);
  });
});
