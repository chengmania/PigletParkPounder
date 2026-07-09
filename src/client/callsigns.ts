import type { CallsignRecord, CallsignsResponse } from '../shared/callsigns.ts';

export type { CallsignRecord, CallsignsResponse };

let cache: CallsignsResponse | null = null;
let inflight: Promise<CallsignsResponse> | null = null;

async function fetchCallsigns(): Promise<CallsignsResponse> {
  const res = await fetch('/api/callsigns', { credentials: 'same-origin' });
  return (await res.json()) as CallsignsResponse;
}

// Fetched once and memoized for the life of the page -- the cache only
// changes when the Captain syncs (see refreshCallsigns), not during normal
// operator use. Mirrors client/parks.ts's loadParks. The response already
// merges every country's callsigns into one flat map (see
// server/callsigns-store.ts), plus per-country sync status for the
// Captain's Callsigns section.
export async function loadCallsigns(): Promise<CallsignsResponse> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchCallsigns().then((c) => {
      cache = c;
      inflight = null;
      return c;
    });
  }
  return inflight;
}

// Forces a re-fetch -- called right after a Captain sync/upload so the rest
// of the app picks up the new cache without a full page reload.
export function refreshCallsigns(): Promise<CallsignsResponse> {
  cache = null;
  inflight = null;
  return loadCallsigns();
}

export function lookupCallsign(call: string): CallsignRecord | undefined {
  return cache?.callsigns[call.trim().toUpperCase()];
}
