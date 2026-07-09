import { unzipSync } from 'fflate';
import type { CallsignRecord } from '../../shared/callsigns.ts';

export const ISED_PROVIDER_ID = 'CA';
export const ISED_PROVIDER_LABEL = 'Canada (ISED)';

// Canada's ISED (Innovation, Science and Economic Development Canada)
// publishes its own bulk amateur-radio listing -- confirmed reachable via
// direct inspection: a ~2-3MB ZIP containing a single semicolon-delimited
// text file with a header row (much simpler than the FCC's two-file join --
// this listing is already "all currently assigned call signs", no separate
// active/expired status file to filter against).
export const ISED_ZIP_URL = 'https://apc-cap.ic.gc.ca/datafiles/amateur_delim.zip';
const ISED_DAT_FILENAME = 'amateur_delim.txt';

// Column order per ISED's own readme_amat_delim.txt (bundled in the zip):
// Callsign; Given Names; Surname; Street Address; City; Province;
// Postal/ZIP Code; BASIC(A); 5WPM(B); 12WPM(C); ADVANCED(D);
// Basic with Honours(E); Club Name (1); Club Name (2); Club Address;
// Club City; Club Province; Club Postal/ZIP Code.
// A club-held callsign has blank Given Names/Surname and populated Club
// Name fields instead -- same "entity vs. person" split the FCC's EN.dat
// has, just within one file instead of needing a join.
export function parseAmateurDelim(text: string): Record<string, CallsignRecord> {
  const callsigns: Record<string, CallsignRecord> = {};
  const lines = text.split('\n');
  for (const line of lines.slice(1)) {
    // skip the header row
    if (!line.trim()) continue;
    const cols = line.split(';');
    const callsign = (cols[0] ?? '').trim().toUpperCase();
    if (!callsign) continue;
    const first = (cols[1] ?? '').trim();
    const surname = (cols[2] ?? '').trim();
    const province = (cols[5] ?? '').trim() || undefined;
    const clubName = (cols[12] ?? '').trim();
    const personalName = [first, surname].filter(Boolean).join(' ');
    callsigns[callsign] = { name: personalName || clubName || callsign, state: province };
  }
  return callsigns;
}

export function parseIsedZip(zipBytes: Uint8Array): Record<string, CallsignRecord> {
  const files = unzipSync(zipBytes, { filter: (file) => file.name === ISED_DAT_FILENAME });
  const bytes = files[ISED_DAT_FILENAME];
  if (!bytes) throw new Error(`ZIP did not contain ${ISED_DAT_FILENAME}`);
  return parseAmateurDelim(new TextDecoder().decode(bytes));
}
