const STORAGE_KEY = 'ppp-identity';

export interface SavedIdentity {
  call: string;
  name?: string;
}

// Persists the signed-in operator across a full page reload -- without
// this, hitting the browser's refresh button always dumped you back to the
// connect screen even though the same callsign would just re-join anyway.
export function saveIdentity(identity: SavedIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function loadIdentity(): SavedIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedIdentity;
    return parsed.call ? parsed : null;
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}
