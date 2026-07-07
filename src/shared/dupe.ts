import type { ClubConfig, Mode, Qso } from './types.ts';

// Suffix tokens stripped for dupe MATCHING only -- the full call as entered is
// always what gets logged/exported. Covers portable (/P), mobile (/M),
// maritime mobile (/MM), QRP (/QRP), and assisted-operator (/AG) markers.
const SUFFIX_TOKENS = new Set(['P', 'M', 'MM', 'AM', 'QRP', 'AG', 'A']);

export function normalizeCall(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

// Strips known suffix tokens, then -- for compound/prefix-style calls where
// multiple segments remain (e.g. "KH6/W1ABCDEF") -- takes the longest
// remaining segment as the base call. This is a documented, deterministic
// assumption; full DXCC-prefix-table parsing is out of scope for v1.
export function baseCall(raw: string): string {
  const normalized = normalizeCall(raw);
  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.length <= 1) return normalized;

  const remaining = segments.filter((s) => !SUFFIX_TOKENS.has(s));
  const candidates = remaining.length > 0 ? remaining : segments;
  return candidates.reduce((longest, s) => (s.length > longest.length ? s : longest));
}

export function utcDateOf(ts: string): string {
  return ts.slice(0, 10);
}

// Guide section 7.1: a QSO's uniqueness is CALL + UTC QSO_DATE + BAND + MODE
// + STATION_CALLSIGN (the club call -- implicit here, since dupe checks are
// always scoped to one club's log) + SIG_INFO (the hunter's park, only if
// they're also park-to-park). Deliberately does NOT include which internal
// station/radio logged it -- duplicates are tracked club-wide across every
// operator and station using the club call, not per radio.
export function dupeKey(call: string, dateUtc: string, band: string, mode: Mode, theirPark: string | undefined): string {
  return `${baseCall(call)}|${dateUtc}|${band}|${mode}|${theirPark ?? ''}`;
}

export interface WorkedElsewhere {
  band: string;
  mode: Mode;
  ts: string;
  by: string;
}

export type DupeStatus = 'NEW' | 'DUPE' | 'BLOCKED_SELF';

export interface DupeResult {
  status: DupeStatus;
  workedElsewhere: WorkedElsewhere[];
  exactDupe?: Qso;
}

export interface DupeCheckInput {
  call: string;
  band: string;
  mode: Mode;
  theirPark?: string;
  // UTC date ("YYYY-MM-DD") this QSO is being logged under. Callers pass the
  // actual QSO timestamp's date when known (server, post-ts-assignment);
  // the live client-side preview uses "now" since the real ts isn't stamped
  // until the server accepts it.
  dateUtc: string;
}

export function checkDupe(input: DupeCheckInput, log: readonly Qso[], config: Pick<ClubConfig, 'clubCall'>): DupeResult {
  const base = baseCall(input.call);
  const active = log.filter((q) => !q.deleted);

  // Guide section 7.2: a club's stations can never work each other -- since
  // everyone transmits the club call, that's simply "the hunter is us".
  if (base === baseCall(config.clubCall)) {
    return { status: 'BLOCKED_SELF', workedElsewhere: [] };
  }

  const key = dupeKey(input.call, input.dateUtc, input.band, input.mode, input.theirPark);
  const exactDupe = active.find((q) => dupeKey(q.call, utcDateOf(q.ts), q.band, q.mode, q.theirPark) === key);

  const workedElsewhere: WorkedElsewhere[] = active
    .filter((q) => baseCall(q.call) === base && (q.band !== input.band || q.mode !== input.mode))
    .map((q) => ({ band: q.band, mode: q.mode, ts: q.ts, by: q.operatorCall }));

  if (exactDupe) {
    return { status: 'DUPE', workedElsewhere, exactDupe };
  }

  return { status: 'NEW', workedElsewhere };
}
