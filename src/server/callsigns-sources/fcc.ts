import { unzipSync } from 'fflate';
import type { CallsignRecord } from '../../shared/callsigns.ts';

export const FCC_PROVIDER_ID = 'US';
export const FCC_PROVIDER_LABEL = 'United States (FCC)';

// FCC's own "complete" bulk database dump for the Amateur radio service --
// confirmed reachable via direct inspection: a ~175-200MB ZIP of many
// pipe-delimited `XX.dat` files (one 2-letter record-type code per file).
// We only need two of them (see below); the rest (AM, HS, LA, SC, CO, VC...)
// are skipped by the unzip filter so we never spend time/memory
// decompressing them.
export const FCC_ZIP_URL = 'https://data.fcc.gov/download/pub/uls/complete/l_amat.zip';

// EN.dat ("entity" record): one per license, name/address of the licensee.
// 1-indexed pipe-delimited columns per FCC's public field definitions
// (confirmed empirically against github.com/k3ng/hamdb's column mapping,
// not copied from it -- these are data-format facts, not source code):
// col 2 = Unique System Identifier (the join key shared with HD.dat),
// col 5 = Call Sign, col 8 = Entity Name (populated instead of a person's
// name for club/military-recreation licenses), col 9/10/11 = First/MI/Last,
// col 18 = State.
function composeName(entityName: string, first: string, mi: string, last: string): string {
  if (entityName) return entityName;
  return [first, mi ? `${mi}.` : '', last].filter(Boolean).join(' ');
}

export function parseEnDat(text: string): Map<string, { name: string; state?: string }> {
  const result = new Map<string, { name: string; state?: string }>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('|');
    const fccid = cols[1];
    if (!fccid) continue;
    const entityName = (cols[7] ?? '').trim();
    const first = (cols[8] ?? '').trim();
    const mi = (cols[9] ?? '').trim();
    const last = (cols[10] ?? '').trim();
    const state = (cols[17] ?? '').trim() || undefined;
    result.set(fccid, { name: composeName(entityName, first, mi, last), state });
  }
  return result;
}

// HD.dat ("header" record): one per license, its current status.
// col 2 = Unique System Identifier, col 5 = Call Sign, col 6 = License
// Status ('A' = Active; anything else -- canceled, expired, terminated,
// etc. -- is excluded here so a lapsed callsign never shows as if valid).
export function parseHdDat(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('|');
    const fccid = cols[1];
    const callSign = (cols[4] ?? '').trim();
    const status = (cols[5] ?? '').trim();
    if (!fccid || !callSign || status !== 'A') continue;
    result.set(fccid, callSign.toUpperCase());
  }
  return result;
}

// Joins on the Unique System Identifier, keyed by callsign in the output --
// only active (HD) records make it through. An active HD record with no
// matching EN row (shouldn't normally happen, but the two files are
// independently generated) still gets an entry rather than being silently
// dropped, falling back to the callsign itself as the name -- same
// "never silently lose a real record" fallback parks-store.ts uses
// (`name: name || reference`).
export function joinCallsigns(en: Map<string, { name: string; state?: string }>, hd: Map<string, string>): Record<string, CallsignRecord> {
  const callsigns: Record<string, CallsignRecord> = {};
  for (const [fccid, callSign] of hd) {
    const entity = en.get(fccid);
    callsigns[callSign] = { name: entity?.name || callSign, state: entity?.state };
  }
  return callsigns;
}

export function unzipEnAndHd(zipBytes: Uint8Array): { enText: string; hdText: string } {
  const files = unzipSync(zipBytes, { filter: (file) => file.name === 'EN.dat' || file.name === 'HD.dat' });
  const decoder = new TextDecoder();
  const enBytes = files['EN.dat'];
  const hdBytes = files['HD.dat'];
  if (!enBytes || !hdBytes) throw new Error('ZIP did not contain both EN.dat and HD.dat');
  return { enText: decoder.decode(enBytes), hdText: decoder.decode(hdBytes) };
}

export function parseFccZip(zipBytes: Uint8Array): Record<string, CallsignRecord> {
  const { enText, hdText } = unzipEnAndHd(zipBytes);
  return joinCallsigns(parseEnDat(enText), parseHdDat(hdText));
}
