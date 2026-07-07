import { baseCall } from './dupe.ts';
import { splitParkList } from './validate.ts';
import type { Qso } from './types.ts';

// POTA's published activation-credit rule (docs.pota.app): an activation
// counts once at least this many unique, valid contacts are logged for a
// given park on a given UTC day. Not from the club guide itself, but
// standard POTA-wide.
export const ACTIVATION_THRESHOLD = 10;

export interface ParkDayStats {
  park: string;
  state?: string;
  dateUtc: string;
  qsoCount: number;
  uniqueCallsigns: number;
  activated: boolean;
}

export interface PotaStats {
  totalQsos: number;
  uniqueCallsigns: number;
  parkToParkCount: number;
  perOperator: Record<string, number>;
  perBand: Record<string, number>;
  perMode: Record<string, number>;
  perPark: ParkDayStats[];
}

interface ParkDayAccumulator {
  park: string;
  state?: string;
  dateUtc: string;
  qsoCount: number;
  calls: Set<string>;
}

// Excludes deleted and dupe-flagged QSOs, same eligibility rule the exports
// use -- a flagged dupe scores no credit and shouldn't count toward
// activation thresholds or per-operator/band/mode tallies.
export function isStatsEligible(qso: Qso): boolean {
  return !qso.deleted && !qso.dupe;
}

export function computeStats(qsos: readonly Qso[]): PotaStats {
  const eligible = qsos.filter(isStatsEligible);

  const perOperator: Record<string, number> = {};
  const perBand: Record<string, number> = {};
  const perMode: Record<string, number> = {};
  const uniqueCalls = new Set<string>();
  const parkDays = new Map<string, ParkDayAccumulator>();
  let parkToParkCount = 0;

  for (const q of eligible) {
    perOperator[q.operatorCall] = (perOperator[q.operatorCall] ?? 0) + 1;
    perBand[q.band] = (perBand[q.band] ?? 0) + 1;
    perMode[q.mode] = (perMode[q.mode] ?? 0) + 1;
    uniqueCalls.add(baseCall(q.call));
    if (q.theirPark) parkToParkCount += 1;

    // A station simultaneously activating more than one overlapping park
    // (comma-separated in myPark) credits this QSO toward each listed park
    // independently -- that's the whole point of a simultaneous multi-park
    // activation.
    const dateUtc = q.ts.slice(0, 10);
    for (const park of splitParkList(q.myPark)) {
      const key = `${park}|${dateUtc}`;
      const entry = parkDays.get(key) ?? { park, state: q.myState, dateUtc, qsoCount: 0, calls: new Set<string>() };
      entry.qsoCount += 1;
      entry.calls.add(baseCall(q.call));
      parkDays.set(key, entry);
    }
  }

  const perPark: ParkDayStats[] = [...parkDays.values()]
    .map((e) => ({
      park: e.park,
      state: e.state,
      dateUtc: e.dateUtc,
      qsoCount: e.qsoCount,
      uniqueCallsigns: e.calls.size,
      activated: e.calls.size >= ACTIVATION_THRESHOLD,
    }))
    .sort((a, b) => (a.dateUtc === b.dateUtc ? a.park.localeCompare(b.park) : a.dateUtc.localeCompare(b.dateUtc)));

  return {
    totalQsos: eligible.length,
    uniqueCallsigns: uniqueCalls.size,
    parkToParkCount,
    perOperator,
    perBand,
    perMode,
    perPark,
  };
}
