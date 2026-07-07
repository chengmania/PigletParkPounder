import type { Mode, Qso, StationKind } from '../shared/types.ts';

export interface QsoRow {
  id: string;
  call: string;
  utc: string; // "YYYY-MM-DD HH:MM"
  band: string;
  mode: Mode;
  rstSent: string;
  rstRcvd: string;
  myPark: string;
  theirPark?: string;
  theirState?: string;
  operatorCall: string;
  station: StationKind;
  isDupe: boolean;
  isDeleted: boolean;
  isMine: boolean;
}

function formatUtc(ts: string): string {
  const d = new Date(ts);
  const date = ts.slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

// Pure so row shaping is directly testable -- reused by the operator's own
// QSO list, the admin firehose, and the operator dashboard live feed.
export function toQsoRow(q: Qso, youCall: string | null): QsoRow {
  return {
    id: q.id,
    call: q.call,
    utc: formatUtc(q.ts),
    band: q.band,
    mode: q.mode,
    rstSent: q.rstSent,
    rstRcvd: q.rstRcvd,
    myPark: q.myPark,
    theirPark: q.theirPark,
    theirState: q.theirState,
    operatorCall: q.operatorCall,
    station: q.station,
    isDupe: !!q.dupe,
    isDeleted: !!q.deleted,
    isMine: youCall !== null && q.operatorCall === youCall,
  };
}

export function sortNewestFirst(qsos: readonly Qso[]): Qso[] {
  return [...qsos].sort((a, b) => b.ts.localeCompare(a.ts));
}
