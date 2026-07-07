import { createInitialState, reservationKey, type JournalEvent, type State } from './journal.ts';
import type { ClubConfig, Mode, Operator, Qso, Reservation, StationKind } from './types.ts';

// 'dupe' is explicitly excluded here (not just left out of a Pick allow-list
// like QsoEditPatch below) -- Omit only removes what's named, and without
// this, adding `dupe?: boolean` to Qso would have silently made it
// client-settable on every qso:add. Only the server may set it.
// 'myPark'/'myState' are likewise server-stamped only (from the station's
// current park assignment in config), never client-supplied -- see
// commands.ts::handleQsoAdd.
export type NewQsoInput = Omit<Qso, 'id' | 'ts' | 'operatorCall' | 'deleted' | 'dupe' | 'myPark' | 'myState'>;
// 'dupe' is likewise never part of this allow-list -- only the server's
// recompute in handleQsoEdit may include it in the journal event's patch.
// Station/myPark/myState aren't editable post-log -- they're a snapshot of
// where/who logged the QSO, not something to retroactively rewrite.
export type QsoEditPatch = Partial<Pick<Qso, 'call' | 'band' | 'mode' | 'theirPark' | 'theirState' | 'rstSent' | 'rstRcvd'>>;

export type ClientMessage =
  | { type: 'hello'; operatorCall: string; name?: string }
  | { type: 'reserve'; band: string; mode: Mode; station: StationKind }
  | { type: 'release'; station: StationKind; band?: string; mode?: Mode }
  | { type: 'qso:add'; clientId: string; qso: NewQsoInput; queued?: boolean; clientTs?: string; override?: boolean }
  | { type: 'qso:edit'; id: string; patch: QsoEditPatch }
  | { type: 'qso:delete'; id: string }
  | { type: 'config:set'; config: ClubConfig }
  | { type: 'ping'; t: number };

export interface FullState {
  config: ClubConfig | null;
  operators: Operator[];
  reservations: Reservation[];
  qsos: Qso[];
  seq: number;
}

export type RejectReason =
  | 'NOT_SIGNED_IN'
  | 'INVALID_BAND_MODE'
  | 'INVALID_STATION'
  | 'INVALID_PARK'
  | 'BLOCKED_SELF'
  | 'DUPE_CONFIRM_REQUIRED'
  | 'NOT_YOUR_SLOT'
  | 'SLOT_TAKEN'
  | 'NOT_FOUND'
  | 'NOT_YOUR_QSO'
  | 'NOT_ADMIN';

export type ServerMessage =
  | { type: 'welcome'; you: Operator; serverNowUtc: string; state: FullState }
  | { type: 'event'; event: JournalEvent; seq: number }
  | { type: 'reject'; reason: RejectReason; clientId?: string; refType?: ClientMessage['type'] }
  | { type: 'pong'; t: number; serverNowUtc: string };

// Rebuilds the Map-based fold State from a wire-transmitted FullState
// snapshot, so clients can reuse the same shared applyEvent()/checkDupe()/
// computeStats() engines the server uses, instead of a parallel
// reimplementation.
export function fullStateToState(full: FullState): State {
  const state = createInitialState();
  state.config = full.config;
  for (const op of full.operators) state.operators.set(op.call, op);
  for (const res of full.reservations) state.reservations.set(reservationKey(res.station, res.band, res.mode), res);
  for (const qso of full.qsos) state.qsos.set(qso.id, qso);
  return state;
}
