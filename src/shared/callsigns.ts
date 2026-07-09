// Shared shape for the amateur-radio callsign cache (server:
// callsigns-store.ts, client: client/callsigns.ts) -- kept here (not
// server-only) so the client can use the type without pulling in server-only
// node:fs/fflate imports. Mirrors shared/parks.ts's role.
//
// Multiple national sources (US/FCC, Canada/ISED, more later) are tracked
// separately -- each with its own sync status -- then merged into one flat
// callsign lookup for the client. Different countries' callsign prefixes
// never collide in practice, so merging is safe; keeping each source's data
// in its own bucket on disk means re-syncing one country only replaces that
// country's own records, never touching another's.
export interface CallsignRecord {
  name: string;
  state?: string;
}

export interface CallsignSourceInfo {
  label: string;
  syncedAtUtc: string;
  // Where this source's current data came from -- a URL it was downloaded
  // from, or "Uploaded file: <name>" for a local upload -- shown on the
  // Captain's Callsigns section per source.
  source: string;
  count: number;
}

// What GET /api/callsigns actually returns: every source's records merged
// into one lookup map, plus per-source metadata for the Captain's UI.
export interface CallsignsResponse {
  callsigns: Record<string, CallsignRecord>;
  sources: Record<string, CallsignSourceInfo>;
}
