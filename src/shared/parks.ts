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
}
