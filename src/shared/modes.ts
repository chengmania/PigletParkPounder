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
  { id: 'FT8', label: 'FT8', adifMode: 'FT8' },
  { id: 'FT4', label: 'FT4', adifMode: 'FT4' },
  { id: 'RTTY', label: 'RTTY', adifMode: 'RTTY' },
  { id: 'PSK31', label: 'PSK31', adifMode: 'PSK31' },
];

export const MODE_IDS: string[] = MODES.map((m) => m.id);

export function getMode(id: string): ModeDef | undefined {
  return MODES.find((m) => m.id === id);
}

// The reservation grid claims a slot per *mode group*, not per exact mode --
// otherwise the grid would need a column for every digital submode on every
// band, and almost none of them would ever be used. A station/band's DIGI
// slot covers whichever of FT8/FT4/RTTY/PSK31 the operator is actually
// running at the moment; that exact submode is chosen per-QSO on the log
// screen (see log.ts) and is what actually gets written to ADIF/dupe-checked
// -- only the reservation itself is bucketed.
export interface ModeGroupDef {
  id: string;
  label: string;
}

export const MODE_GROUPS: ModeGroupDef[] = [
  { id: 'SSB', label: 'SSB' },
  { id: 'CW', label: 'CW' },
  { id: 'FM', label: 'FM' },
  { id: 'DIGI', label: 'Digi' },
];

export const MODE_GROUP_IDS: string[] = MODE_GROUPS.map((g) => g.id);

const DIGI_MODE_IDS = ['FT8', 'FT4', 'RTTY', 'PSK31'];

export function getModeGroup(id: string): ModeGroupDef | undefined {
  return MODE_GROUPS.find((g) => g.id === id);
}

// SSB/CW/FM map 1:1 to their own group; every digital mode maps to DIGI.
export function modeGroupOf(modeId: string): string {
  return DIGI_MODE_IDS.includes(modeId) ? 'DIGI' : modeId;
}

// The exact modes a reservation's group can be logged as. SSB/CW/FM groups
// have exactly one member (themselves); DIGI expands to the submodes a
// digital operator picks between per-QSO.
export function modesInGroup(groupId: string): ModeDef[] {
  if (groupId === 'DIGI') return DIGI_MODE_IDS.map((id) => getMode(id)!);
  const mode = getMode(groupId);
  return mode ? [mode] : [];
}

// Default signal report shown when logging, per mode convention (phone: 59,
// CW/digital: 599). Just a UI convenience default -- freely editable.
export function defaultRst(modeId: string): string {
  return modeId === 'SSB' || modeId === 'FM' ? '59' : '599';
}
