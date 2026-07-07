export interface BandDef {
  id: string;
  label: string;
}

// Real amateur band set POTA activations run on -- includes the WARC bands
// (30/17/12m) and 60m that Field Day's Cabrillo-scored band list excluded.
// No SAT: single-channel-FM satellite rules were a Field Day bonus concern
// (7.3.7.1), not a POTA one.
export const BANDS: BandDef[] = [
  { id: '160m', label: '160m' },
  { id: '80m', label: '80m' },
  { id: '60m', label: '60m' },
  { id: '40m', label: '40m' },
  { id: '30m', label: '30m' },
  { id: '20m', label: '20m' },
  { id: '17m', label: '17m' },
  { id: '15m', label: '15m' },
  { id: '12m', label: '12m' },
  { id: '10m', label: '10m' },
  { id: '6m', label: '6m' },
  { id: '2m', label: '2m' },
  { id: '70cm', label: '70cm' },
];

export const BAND_IDS: string[] = BANDS.map((b) => b.id);

export function getBand(id: string): BandDef | undefined {
  return BANDS.find((b) => b.id === id);
}

// ADIF's BAND enum tokens are the uppercase form of our band ids (e.g.
// "160m" -> "160M", "70cm" -> "70CM").
export function toAdifBand(id: string): string {
  return id.toUpperCase();
}
