// Shared shape for the POTA park database cache (server: parks-store.ts,
// client: client/parks.ts) -- kept here (not server-only) so the client can
// use the type without pulling in server-only node:fs imports.
export interface ParkRecord {
  name: string;
  state?: string;
  lat?: number;
  lon?: number;
}

export interface ParksCache {
  syncedAtUtc: string | null;
  parks: Record<string, ParkRecord>;
  // Where the current cache came from -- a URL it was downloaded from, or
  // "Uploaded file: <name>" for a local CSV -- shown on the Captain's Parks
  // tab so it's clear what's actually loaded. Absent for caches written
  // before this field existed.
  source?: string;
}
