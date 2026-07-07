// Permissive ham-format check: reject empty/too-short only, don't over-constrain
// since real-world callsign grammar (prefixes, portable suffixes, DX formats)
// varies far more than a single regex can safely encode.
export const CALLSIGN_REGEX = /^[A-Z0-9]{3,3}[A-Z0-9/]{0,7}$/;

// POTA park reference: a 1-4 character entity/program prefix (e.g. "K", "VE",
// "G", "JA"), a hyphen, and a 4-5 digit park number (e.g. "K-1234",
// "VE-0001"). Deliberately permissive -- POTA's full prefix list spans every
// participating DXCC entity plus special program prefixes, so this only
// rejects obviously-malformed input.
export const PARK_REGEX = /^[A-Z0-9]{1,4}-\d{4,5}$/;

export function isValidCallsign(call: string): boolean {
  return CALLSIGN_REGEX.test(call.trim().toUpperCase());
}

export function isValidParkNumber(park: string): boolean {
  return PARK_REGEX.test(park.trim().toUpperCase());
}

// Splits a comma-separated park list (a station simultaneously activating
// more than one overlapping park -- a park within a park, a trail crossing a
// boundary, etc.) into its trimmed, uppercased segments.
export function splitParkList(parks: string): string[] {
  return parks
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);
}

export function isValidParkList(parks: string): boolean {
  const segments = splitParkList(parks);
  return segments.length > 0 && segments.every(isValidParkNumber);
}
