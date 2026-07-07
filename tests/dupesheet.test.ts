import { describe, expect, test } from 'bun:test';
import { sortedForDupeSheet, toDupeSheetCsv, toDupeSheetHtml } from '../src/shared/export/dupesheet.ts';
import { makeQso } from './fixtures.ts';

describe('sortedForDupeSheet', () => {
  test('sorts by band order (per BANDS, low to high frequency), then mode alpha, then call alpha', () => {
    const qsos = [
      makeQso({ band: '20m', mode: 'CW', call: 'W2BBB' }),
      makeQso({ band: '40m', mode: 'SSB', call: 'W3ZZZ' }),
      makeQso({ band: '20m', mode: 'SSB', call: 'W2AAA' }),
      makeQso({ band: '20m', mode: 'SSB', call: 'W2CCC' }),
    ];
    const sorted = sortedForDupeSheet(qsos);
    expect(sorted.map((q) => `${q.band}/${q.mode}/${q.call}`)).toEqual([
      '40m/SSB/W3ZZZ',
      '20m/CW/W2BBB',
      '20m/SSB/W2AAA',
      '20m/SSB/W2CCC',
    ]);
  });

  test('excludes soft-deleted QSOs', () => {
    const qsos = [makeQso({ deleted: true })];
    expect(sortedForDupeSheet(qsos)).toHaveLength(0);
  });

  test('excludes dupe-flagged QSOs (hybrid two-press logging)', () => {
    const qsos = [makeQso({ dupe: true })];
    expect(sortedForDupeSheet(qsos)).toHaveLength(0);
  });
});

describe('toDupeSheetCsv', () => {
  test('produces a header row plus one row per QSO', () => {
    const qsos = [makeQso({ band: '20m', mode: 'SSB', call: 'W2ABC', rstSent: '59', rstRcvd: '57', theirPark: 'K-5678' })];
    const csv = toDupeSheetCsv(qsos);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Band,Mode,Call,RST Sent,RST Rcvd,Their State,Their Park,My Park,Time (UTC),Station,Operator');
    expect(lines[1]).toContain('20m,SSB,W2ABC,59,57,,K-5678');
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

  test('escapes HTML-significant characters in call', () => {
    const qsos = [makeQso({ call: 'W1<script>' })];
    const html = toDupeSheetHtml(qsos);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
