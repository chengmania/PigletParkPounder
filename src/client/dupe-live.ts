import type { DupeResult } from '../shared/dupe.ts';

export interface DupeUiStatus {
  label: string;
  className: string;
  // BLOCKED_* statuses can never be logged, even with override.
  blockedHard: boolean;
  // A plain DUPE can be logged, but only with an explicit override confirmation.
  requiresOverride: boolean;
  workedElsewhereText?: string;
}

function formatUtcTime(ts: string): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

export function describeDupe(result: DupeResult): DupeUiStatus {
  const workedElsewhereText = result.workedElsewhere.length
    ? `Worked elsewhere: ${result.workedElsewhere.map((w) => `${w.band}/${w.mode}`).join(', ')}`
    : undefined;

  switch (result.status) {
    case 'NEW':
      return { label: 'NEW', className: 'dupe-new', blockedHard: false, requiresOverride: false, workedElsewhereText };
    case 'DUPE': {
      // result.workedElsewhere only populates for OTHER band/mode matches --
      // for the exact same-band/mode/station dupe (the common case), it's
      // empty, so the message would otherwise say nothing about where/when/
      // by whom it was first worked. Use exactDupe instead, which is always
      // set for a DUPE status.
      const first = result.exactDupe;
      const detail = first
        ? `First worked by ${first.operatorCall} at ${formatUtcTime(first.ts)} on ${first.band}/${first.mode}`
        : workedElsewhereText;
      return { label: 'DUPE', className: 'dupe-dupe', blockedHard: false, requiresOverride: true, workedElsewhereText: detail };
    }
    case 'BLOCKED_SELF':
      return { label: "BLOCKED -- that's your own club call", className: 'dupe-blocked', blockedHard: true, requiresOverride: false };
  }
}
