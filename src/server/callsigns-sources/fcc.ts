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

// Everything below exists because of empirical findings while chasing an
// OOM-kill of this import on a 2GB Raspberry Pi (confirmed via
// `journalctl -k`: the kernel oom-killer fired twice, killing `bun` at
// ~1.5-1.6GB resident). Measured against the real ~175MB FCC zip
// (~1.69 million lines each in EN.dat/HD.dat), the naive approach --
// decode each file to one big string, `text.split('\n')`, `line.split('|')`
// per line -- peaked at ~3.9GB resident, even though the final retained data
// (827k callsigns) is well under 300MB. Three separate effects stack up:
//
// 1. JavaScriptCore can return a "rope"/sliced string from split()/slice()/
//    trim() that still references its entire parent string rather than
//    copying. Retaining a single 20-char slice from an 800k-line/~240MB
//    decoded text kept the whole ~240MB buffer resident even after a forced
//    GC -- so every field we keep must be forced into a genuinely
//    independent flat string (`flatten` below), or the whole source text
//    stays pinned for the rest of the process. The classic V8
//    `(' ' + s).slice(1)` trick measured no different from doing nothing;
//    only a round-trip through raw bytes actually broke the reference.
// 2. `text.split('\n')` materializes *every* line as a rope-slice into one
//    array up front, so the parent text stays pinned for the entire loop
//    regardless of (1). `iterLines` below yields one line at a time instead.
// 3. `line.split('|')` allocates a full row's worth of columns (~18+) per
//    line even though only 3-6 are ever used -- across ~1.7 million lines
//    this generates transient garbage faster than JavaScriptCore's GC
//    reclaims it within one uninterrupted synchronous loop, which by itself
//    accounted for a large share of the peak. `columnsAt` only allocates the
//    specific indices requested, and the parse loops yield to the event loop
//    (with a forced GC) every 5,000 lines so collection can actually keep up
//    -- as a side effect this also keeps the server responsive (able to
//    service live QSO logging over the WebSocket) during the import instead
//    of freezing for the whole multi-second parse.
//
// Together these took measured peak resident memory from ~3.9GB to ~1.8GB
// against the real file -- fits (tightly) in the Pi's 1.8GB RAM + 2GB swap.
const flattenEncoder = new TextEncoder();
const flattenDecoder = new TextDecoder();
function flatten(s: string): string {
  return flattenDecoder.decode(flattenEncoder.encode(s));
}

function* iterLines(text: string): Generator<string> {
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) {
      if (start < text.length) yield text.slice(start);
      break;
    }
    yield text.slice(start, nl);
    start = nl + 1;
  }
}

// Extracts only the requested (ascending) column indices from a pipe-
// delimited line, instead of materializing every column via split('|').
function columnsAt(line: string, indices: readonly number[]): string[] {
  const values: string[] = new Array(indices.length).fill('');
  const maxIndex = indices[indices.length - 1] ?? 0;
  let col = 0;
  let start = 0;
  let nextWanted = 0;
  while (col <= maxIndex) {
    const pipe = line.indexOf('|', start);
    const end = pipe === -1 ? line.length : pipe;
    if (nextWanted < indices.length && indices[nextWanted] === col) {
      values[nextWanted] = line.slice(start, end);
      nextWanted++;
    }
    if (pipe === -1) break;
    start = pipe + 1;
    col++;
  }
  return values;
}

const YIELD_EVERY_N_LINES = 5_000;

async function yieldToEventLoop(): Promise<void> {
  Bun.gc(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

const EN_COLUMNS = [1, 7, 8, 9, 10, 17] as const;

export async function parseEnDat(text: string, onlyFccids?: Set<string>): Promise<Map<string, { name: string; state?: string }>> {
  const result = new Map<string, { name: string; state?: string }>();
  let i = 0;
  for (const line of iterLines(text)) {
    if (line) {
      const [fccid, entityNameRaw, firstRaw, miRaw, lastRaw, stateRaw] = columnsAt(line, EN_COLUMNS);
      if (fccid && (!onlyFccids || onlyFccids.has(fccid))) {
        const entityName = (entityNameRaw ?? '').trim();
        const first = (firstRaw ?? '').trim();
        const mi = (miRaw ?? '').trim();
        const last = (lastRaw ?? '').trim();
        const state = (stateRaw ?? '').trim() || undefined;
        result.set(flatten(fccid), { name: flatten(composeName(entityName, first, mi, last)), state: state ? flatten(state) : undefined });
      }
    }
    if (++i % YIELD_EVERY_N_LINES === 0) await yieldToEventLoop();
  }
  return result;
}

// HD.dat ("header" record): one per license, its current status.
// col 2 = Unique System Identifier, col 5 = Call Sign, col 6 = License
// Status ('A' = Active; anything else -- canceled, expired, terminated,
// etc. -- is excluded here so a lapsed callsign never shows as if valid).
const HD_COLUMNS = [1, 4, 5] as const;

export async function parseHdDat(text: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let i = 0;
  for (const line of iterLines(text)) {
    if (line) {
      const [fccid, callSignRaw, statusRaw] = columnsAt(line, HD_COLUMNS);
      const callSign = (callSignRaw ?? '').trim();
      const status = (statusRaw ?? '').trim();
      if (fccid && callSign && status === 'A') {
        result.set(flatten(fccid), flatten(callSign.toUpperCase()));
      }
    }
    if (++i % YIELD_EVERY_N_LINES === 0) await yieldToEventLoop();
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

// Extracts and decodes exactly one entry from the zip. Deliberately processes
// EN.dat and HD.dat one at a time (never both decompressed/decoded at once) --
// each is well over a million lines of mostly-unused columns, and holding both
// full texts live simultaneously is a large part of what OOM-killed this on a
// 2GB Raspberry Pi.
export function unzipAndDecodeOne(zipBytes: Uint8Array, fileName: string): string {
  const files = unzipSync(zipBytes, { filter: (file) => file.name === fileName });
  const bytes = files[fileName];
  if (!bytes) throw new Error(`ZIP did not contain ${fileName}`);
  return new TextDecoder().decode(bytes);
}

export async function parseFccZip(zipBytes: Uint8Array): Promise<Record<string, CallsignRecord>> {
  // HD.dat first: its (compact) active-fccid set lets EN.dat skip every
  // historical/inactive entity row instead of parsing and holding all of them.
  const hd = await parseHdDat(unzipAndDecodeOne(zipBytes, 'HD.dat'));
  const en = await parseEnDat(unzipAndDecodeOne(zipBytes, 'EN.dat'), new Set(hd.keys()));
  return joinCallsigns(en, hd);
}
