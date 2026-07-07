export interface ModeDef {
  id: string;
  label: string;
  // Value written to ADIF's MODE field -- the guide is explicit that this
  // must be the *detailed* mode (ssb, FT8, ...), not a bucket like "Phone"
  // or "Digital" (section 4.3).
  adifMode: string;
}

export const MODES: ModeDef[] = [
  { id: 'SSB', label: 'SSB', adifMode: 'SSB' },
  { id: 'CW', label: 'CW', adifMode: 'CW' },
  { id: 'FM', label: 'FM', adifMode: 'FM' },
  { id: 'AM', label: 'AM', adifMode: 'AM' },
  { id: 'FT8', label: 'FT8', adifMode: 'FT8' },
  { id: 'FT4', label: 'FT4', adifMode: 'FT4' },
  { id: 'RTTY', label: 'RTTY', adifMode: 'RTTY' },
  { id: 'PSK31', label: 'PSK31', adifMode: 'PSK31' },
];

export const MODE_IDS: string[] = MODES.map((m) => m.id);

export function getMode(id: string): ModeDef | undefined {
  return MODES.find((m) => m.id === id);
}

// Default signal report shown when logging, per mode convention (phone: 59,
// CW/digital: 599). Just a UI convenience default -- freely editable.
export function defaultRst(modeId: string): string {
  return modeId === 'SSB' || modeId === 'FM' || modeId === 'AM' ? '59' : '599';
}
