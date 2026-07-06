// Generic per-device boolean preference storage (localStorage), generalizing
// the pattern already used by theme.ts.
export function readBoolPref(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function writeBoolPref(key: string, value: boolean): void {
  localStorage.setItem(key, String(value));
}
