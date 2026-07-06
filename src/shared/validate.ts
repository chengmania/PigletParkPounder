// Permissive ham-format check: reject empty/too-short only, don't over-constrain
// since real-world callsign grammar (prefixes, portable suffixes, DX formats)
// varies far more than a single regex can safely encode.
export const CALLSIGN_REGEX = /^[A-Z0-9]{3,3}[A-Z0-9/]{0,7}$/;

// Entry class, e.g. "3A", "1B", or the battery variants "1AB"/"1BB".
//
// This deliberately accepts a bare class letter (A-F) OR the two documented
// Battery-suffix combinations AB/BB -- Class A or B stations claiming the
// emergency-power/battery sub-designation. A simpler-looking pattern like
// `^\d{1,2}[A-F]B?$` would also accept nonsense combos like "2DB"/"2EB"/
// "2FB", which aren't real Field Day class/battery designations (D/E/F/C
// stations' power source is already implied by their class letter). Keep
// this exact pattern.
export const CLASS_REGEX = /^\d{1,2}(?:AB|BB|[A-F])$/i;

export function isValidCallsign(call: string): boolean {
  return CALLSIGN_REGEX.test(call.trim().toUpperCase());
}

export function isValidClass(entryClass: string): boolean {
  return CLASS_REGEX.test(entryClass.trim());
}
