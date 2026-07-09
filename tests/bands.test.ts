import { describe, expect, test } from 'bun:test';
import { modeGroupsForBand } from '../src/shared/bands.ts';

describe('modeGroupsForBand', () => {
  test('HF bands (160m-10m) offer SSB/CW/DIGI -- no FM', () => {
    for (const band of ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m']) {
      expect(modeGroupsForBand(band).map((g) => g.id)).toEqual(['SSB', 'CW', 'DIGI']);
    }
  });

  test('VHF/UHF bands (6m-70cm) offer SSB/CW/FM/DIGI', () => {
    for (const band of ['6m', '2m', '70cm']) {
      expect(modeGroupsForBand(band).map((g) => g.id)).toEqual(['SSB', 'CW', 'FM', 'DIGI']);
    }
  });
});
