import { describe, expect, test } from 'bun:test';
import { sortedForDupeSheet, toDupeSheetCsv, toDupeSheetHtml } from '../src/shared/export/dupesheet.ts';
import { makeQso } from './fixtures.ts';

describe('sortedForDupeSheet', () => {
  test('sorts by band order (per BANDS, low to high frequency), then mode order, then call alpha', () => {
    const qsos = [
      makeQso({ band: '20m', mode: 'CW', call: 'W2BBB' }),
      makeQso({ band: '40m', mode: 'PH', call: 'W3ZZZ' }),
      makeQso({ band: '20m', mode: 'PH', call: 'W2AAA' }),
      makeQso({ band: '20m', mode: 'PH', call: 'W2CCC' }),
    ];
    const sorted = sortedForDupeSheet(qsos);
    expect(sorted.map((q) => `${q.band}/${q.mode}/${q.call}`)).toEqual([
      '40m/PH/W3ZZZ',
      '20m/PH/W2AAA',
      '20m/PH/W2CCC',
      '20m/CW/W2BBB',
    ]);
  });

  test('excludes soft-deleted QSOs', () => {
    const qsos = [makeQso({ deleted: true })];
    expect(sortedForDupeSheet(qsos)).toHaveLength(0);
  });
});

describe('toDupeSheetCsv', () => {
  test('produces a header row plus one row per QSO', () => {
    const qsos = [makeQso({ band: '20m', mode: 'PH', call: 'W2ABC', exchClass: '3A', exchSection: 'EPA' })];
    const csv = toDupeSheetCsv(qsos);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Band,Mode,Call,Class,Section,Time (UTC),Station,Operator');
    expect(lines[1]).toContain('20m,PH,W2ABC,3A,EPA');
  });
});

describe('toDupeSheetHtml', () => {
  test('produces a table with one row per QSO', () => {
    const qsos = [makeQso({ call: 'W2ABC' }), makeQso({ call: 'W3DEF' })];
    const html = toDupeSheetHtml(qsos);
    expect(html).toContain('<table>');
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // header + 2 rows
    expect(html).toContain('W2ABC');
    expect(html).toContain('W3DEF');
  });

  test('escapes HTML-significant characters in call/class/section', () => {
    const qsos = [makeQso({ call: 'W1<script>' })];
    const html = toDupeSheetHtml(qsos);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
