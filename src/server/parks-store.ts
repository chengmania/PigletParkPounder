import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ParkRecord, ParksCache } from '../shared/parks.ts';

export type { ParkRecord, ParksCache };

// Confirmed via WebFetch (not a documented/stable API -- POTA's own docs are
// "under construction" -- but a plain, publicly-referenced static export,
// regenerated roughly nightly): a single flat CSV covering every park
// worldwide, header reference,name,active,entityId,locationDesc,latitude,
// longitude,grid.
const PARKS_CSV_URL = 'https://pota.app/all_parks_ext.csv';

function parksPath(dataDir: string): string {
  return join(dataDir, 'parks.json');
}

export async function readParks(dataDir: string): Promise<ParksCache> {
  const path = parksPath(dataDir);
  if (!existsSync(path)) return { syncedAtUtc: null, parks: {} };
  try {
    return JSON.parse(await Bun.file(path).text()) as ParksCache;
  } catch (err) {
    console.error(`[parks-store] failed to read parks.json: ${err}`);
    return { syncedAtUtc: null, parks: {} };
  }
}

async function writeParks(dataDir: string, cache: ParksCache): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const path = parksPath(dataDir);
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(cache));
  await rename(tmpPath, path);
}

// Minimal parser for POTA's export: simple double-quoted, comma-separated
// fields, no embedded commas/quotes within a field.
function parseCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

// locationDesc is "<country>-<region>" (e.g. "US-ME"); state is everything
// after the first hyphen, or undefined for entities with no subdivision.
function parseLocationDesc(locationDesc: string): string | undefined {
  const dashIdx = locationDesc.indexOf('-');
  return dashIdx >= 0 ? locationDesc.slice(dashIdx + 1) || undefined : undefined;
}

export function parseParksCsv(csvText: string): Record<string, ParkRecord> {
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  const parks: Record<string, ParkRecord> = {};

  for (const line of lines.slice(1)) {
    const [reference, name, , , locationDesc, latitude, longitude] = parseCsvLine(line);
    if (!reference) continue;
    const lat = latitude ? Number(latitude) : NaN;
    const lon = longitude ? Number(longitude) : NaN;
    parks[reference] = {
      name: name || reference,
      state: locationDesc ? parseLocationDesc(locationDesc) : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    };
  }

  return parks;
}

export async function syncParks(dataDir: string): Promise<{ count: number; syncedAtUtc: string }> {
  const res = await fetch(PARKS_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch park list: HTTP ${res.status}`);
  const csvText = await res.text();
  const parks = parseParksCsv(csvText);
  const syncedAtUtc = new Date().toISOString();
  await writeParks(dataDir, { syncedAtUtc, parks });
  return { count: Object.keys(parks).length, syncedAtUtc };
}
