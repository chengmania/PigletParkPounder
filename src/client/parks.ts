import type { ParkRecord, ParksCache } from '../shared/parks.ts';

export type { ParkRecord, ParksCache };

let cache: ParksCache | null = null;
let inflight: Promise<ParksCache> | null = null;

async function fetchParks(): Promise<ParksCache> {
  const res = await fetch('/api/parks', { credentials: 'same-origin' });
  return (await res.json()) as ParksCache;
}

// Fetched once and memoized for the life of the page -- the cache only
// changes when the Captain syncs (see refreshParks), not during normal
// operator use.
export async function loadParks(): Promise<ParksCache> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchParks().then((c) => {
      cache = c;
      inflight = null;
      return c;
    });
  }
  return inflight;
}

// Forces a re-fetch -- called right after a Captain "Sync Now" so the rest
// of the app picks up the new cache without a full page reload.
export function refreshParks(): Promise<ParksCache> {
  cache = null;
  inflight = null;
  return loadParks();
}

export function lookupPark(reference: string): ParkRecord | undefined {
  return cache?.parks[reference.trim().toUpperCase()];
}

export function parkReferences(): string[] {
  return cache ? Object.keys(cache.parks) : [];
}

export function parkOptionLabel(reference: string): string {
  const record = lookupPark(reference);
  if (!record) return reference;
  return `${reference} -- ${record.name}${record.state ? `, ${record.state}` : ''}`;
}
