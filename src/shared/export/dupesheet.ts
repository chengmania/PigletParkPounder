import { BANDS } from '../bands.ts';
import type { Mode, Qso } from '../types.ts';

const MODE_ORDER: Record<Mode, number> = { PH: 0, CW: 1, DIG: 2 };

function bandSortIndex(bandId: string): number {
  const idx = BANDS.findIndex((b) => b.id === bandId);
  return idx === -1 ? BANDS.length : idx;
}

// Rule 8.3.2.1: stations worked, sorted by band then mode, alpha order.
export function sortedForDupeSheet(qsos: readonly Qso[]): Qso[] {
  return [...qsos]
    .filter((q) => !q.deleted)
    .sort((a, b) => {
      const bandDiff = bandSortIndex(a.band) - bandSortIndex(b.band);
      if (bandDiff !== 0) return bandDiff;
      const modeDiff = MODE_ORDER[a.mode] - MODE_ORDER[b.mode];
      if (modeDiff !== 0) return modeDiff;
      return a.call.localeCompare(b.call);
    });
}

const CSV_HEADER = 'Band,Mode,Call,Class,Section,Time (UTC),Station,Operator';

function csvRow(q: Qso): string {
  return [q.band, q.mode, q.call, q.exchClass, q.exchSection, q.ts, q.station, q.operatorCall].join(',');
}

export function toDupeSheetCsv(qsos: readonly Qso[]): string {
  const rows = sortedForDupeSheet(qsos);
  return [CSV_HEADER, ...rows.map(csvRow)].join('\n') + '\n';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toDupeSheetHtml(qsos: readonly Qso[]): string {
  const rows = sortedForDupeSheet(qsos);
  const body = rows
    .map(
      (q) =>
        `<tr><td>${q.band}</td><td>${q.mode}</td><td>${escapeHtml(q.call)}</td><td>${escapeHtml(q.exchClass)}</td>` +
        `<td>${escapeHtml(q.exchSection)}</td><td>${q.ts}</td><td>${q.station}</td><td>${escapeHtml(q.operatorCall)}</td></tr>`,
    )
    .join('\n');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Dupe Sheet</title>' +
    '<style>table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px}</style></head><body>' +
    '<table><thead><tr><th>Band</th><th>Mode</th><th>Call</th><th>Class</th><th>Section</th>' +
    `<th>Time (UTC)</th><th>Station</th><th>Operator</th></tr></thead><tbody>${body}</tbody></table></body></html>`
  );
}
