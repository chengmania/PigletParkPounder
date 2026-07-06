import { describe, expect, test } from 'bun:test';
import { countBySectionClubWide } from '../src/shared/section-counts.ts';
import { makeQso } from './fixtures.ts';

describe('countBySectionClubWide', () => {
  test('counts non-deleted QSOs grouped by exchSection', () => {
    const qsos = [makeQso({ exchSection: 'EPA' }), makeQso({ exchSection: 'EPA' }), makeQso({ exchSection: 'WPA' })];
    expect(countBySectionClubWide(qsos)).toEqual({ EPA: 2, WPA: 1 });
  });

  test('excludes soft-deleted QSOs', () => {
    const qsos = [makeQso({ exchSection: 'EPA', deleted: true })];
    expect(countBySectionClubWide(qsos)).toEqual({});
  });

  test('includes dupe-flagged QSOs (activity map, not a scoring artifact)', () => {
    const qsos = [makeQso({ exchSection: 'EPA', dupe: true })];
    expect(countBySectionClubWide(qsos)).toEqual({ EPA: 1 });
  });
});
