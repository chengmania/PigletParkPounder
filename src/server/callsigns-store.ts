import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CallsignRecord, CallsignsResponse, CallsignSourceInfo } from '../shared/callsigns.ts';
import { FCC_PROVIDER_ID, FCC_PROVIDER_LABEL, FCC_ZIP_URL, parseFccZip } from './callsigns-sources/fcc.ts';
import { ISED_PROVIDER_ID, ISED_PROVIDER_LABEL, ISED_ZIP_URL, parseIsedZip } from './callsigns-sources/ised.ts';

export type { CallsignRecord, CallsignsResponse, CallsignSourceInfo };

export interface CallsignProvider {
  id: string;
  label: string;
  defaultUrl: string;
  // Async because the FCC parser yields to the event loop periodically
  // (with a forced GC) to keep peak memory manageable on constrained
  // hardware -- see src/server/callsigns-sources/fcc.ts for why.
  parse: (zipBytes: Uint8Array) => Promise<Record<string, CallsignRecord>>;
}

// Add a new country here (plus a module under callsigns-sources/) and the
// store, HTTP routes, and Captain UI all pick it up automatically -- no
// other file needs to know the list of countries.
export const CALLSIGN_PROVIDERS: CallsignProvider[] = [
  { id: FCC_PROVIDER_ID, label: FCC_PROVIDER_LABEL, defaultUrl: FCC_ZIP_URL, parse: parseFccZip },
  { id: ISED_PROVIDER_ID, label: ISED_PROVIDER_LABEL, defaultUrl: ISED_ZIP_URL, parse: parseIsedZip },
];

export function getProvider(id: string): CallsignProvider | undefined {
  return CALLSIGN_PROVIDERS.find((p) => p.id === id);
}

// On-disk shape: one bucket per country/provider, each with its own
// callsigns and sync metadata. Re-syncing a country only replaces that
// country's own bucket -- a stale or revoked callsign from a previous sync
// of that same country can never linger, and syncing one country never
// touches another's data.
interface CallsignSourceBucket extends CallsignSourceInfo {
  callsigns: Record<string, CallsignRecord>;
}
interface OnDiskCache {
  sources: Record<string, CallsignSourceBucket>;
}

function callsignsPath(dataDir: string): string {
  return join(dataDir, 'callsigns.json');
}

async function readRaw(dataDir: string): Promise<OnDiskCache> {
  const path = callsignsPath(dataDir);
  if (!existsSync(path)) return { sources: {} };
  try {
    return JSON.parse(await Bun.file(path).text()) as OnDiskCache;
  } catch (err) {
    console.error(`[callsigns-store] failed to read callsigns.json: ${err}`);
    return { sources: {} };
  }
}

async function writeRaw(dataDir: string, cache: OnDiskCache): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const path = callsignsPath(dataDir);
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(cache));
  await rename(tmpPath, path);
}

// Public read: merges every source's callsigns into one flat lookup map --
// different countries' callsign prefixes never collide in practice, so this
// is safe -- plus per-source metadata for the Captain's UI.
export async function readCallsigns(dataDir: string): Promise<CallsignsResponse> {
  const raw = await readRaw(dataDir);
  const callsigns: Record<string, CallsignRecord> = {};
  const sources: Record<string, CallsignSourceInfo> = {};
  for (const [id, bucket] of Object.entries(raw.sources)) {
    Object.assign(callsigns, bucket.callsigns);
    sources[id] = { label: bucket.label, syncedAtUtc: bucket.syncedAtUtc, source: bucket.source, count: bucket.count };
  }
  return { callsigns, sources };
}

async function importZip(dataDir: string, providerId: string, zipBytes: Uint8Array, source: string): Promise<{ count: number; syncedAtUtc: string }> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown callsign provider: ${providerId}`);
  const callsigns = await provider.parse(zipBytes);
  const syncedAtUtc = new Date().toISOString();
  const count = Object.keys(callsigns).length;
  const raw = await readRaw(dataDir);
  raw.sources[providerId] = { label: provider.label, syncedAtUtc, source, count, callsigns };
  await writeRaw(dataDir, raw);
  return { count, syncedAtUtc };
}

export async function syncCallsignsFromUrl(dataDir: string, providerId: string, url?: string): Promise<{ count: number; syncedAtUtc: string }> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown callsign provider: ${providerId}`);
  const finalUrl = url || provider.defaultUrl;
  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error(`Failed to fetch callsign database: HTTP ${res.status}`);
  const zipBytes = new Uint8Array(await res.arrayBuffer());
  return importZip(dataDir, providerId, zipBytes, finalUrl);
}

export async function importCallsignsFromFile(dataDir: string, providerId: string, zipBytes: Uint8Array, fileName: string): Promise<{ count: number; syncedAtUtc: string }> {
  return importZip(dataDir, providerId, zipBytes, `Uploaded file: ${fileName}`);
}
