import type { Qso } from './types.ts';

// Dupe-flagged QSOs are intentionally INCLUDED here -- the section map is an
// activity visualization ("someone was contacted from that section"), not a
// scoring artifact, so this deliberately differs from scoring.ts's
// isScoreEligible() exclusion of dupes.
export function countBySectionClubWide(qsos: Iterable<Qso>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of qsos) {
    if (q.deleted) continue;
    counts[q.exchSection] = (counts[q.exchSection] ?? 0) + 1;
  }
  return counts;
}
