import type { ClubConfig, Mode, Operator, Qso, Reservation, StationKind } from './types.ts';

export type JournalEvent =
  | { type: 'config:set'; ts: string; config: ClubConfig }
  | { type: 'op:join'; ts: string; call: string; name?: string }
  | { type: 'op:leave'; ts: string; call: string }
  | { type: 'slot:reserve'; ts: string; band: string; mode: Mode; station: StationKind; operatorCall: string }
  | { type: 'slot:release'; ts: string; band: string; mode: Mode; station: StationKind }
  | { type: 'qso:add'; ts: string; qso: Qso; clientId: string }
  | {
      type: 'qso:edit';
      ts: string;
      id: string;
      // 'dupe' is server-computed only (see commands.ts::handleQsoEdit) --
      // the client-facing QsoEditPatch in protocol.ts deliberately excludes
      // it, so a client can never set/clear its own dupe flag directly.
      patch: Partial<Pick<Qso, 'call' | 'band' | 'mode' | 'theirPark' | 'theirState' | 'rstSent' | 'rstRcvd' | 'dupe'>>;
    }
  | { type: 'qso:delete'; ts: string; id: string };

export interface State {
  config: ClubConfig | null;
  operators: Map<string, Operator>;
  // key: `${station}|${band}|${mode}`.
  reservations: Map<string, Reservation>;
  // Includes soft-deleted rows (deleted:true) so the append-only audit trail is preserved.
  qsos: Map<string, Qso>;
  // Idempotency index rebuilt on replay: clientId -> qso.id.
  qsoIdByClientId: Map<string, string>;
}

export function createInitialState(): State {
  return {
    config: null,
    operators: new Map(),
    reservations: new Map(),
    qsos: new Map(),
    qsoIdByClientId: new Map(),
  };
}

export function reservationKey(station: StationKind, band: string, mode: Mode): string {
  return `${station}|${band}|${mode}`;
}

export function applyEvent(state: State, event: JournalEvent): State {
  switch (event.type) {
    case 'config:set': {
      return { ...state, config: event.config };
    }
    case 'op:join': {
      const operators = new Map(state.operators);
      const existing = operators.get(event.call);
      operators.set(event.call, {
        call: event.call,
        name: event.name ?? existing?.name,
        connectedAt: existing?.connectedAt ?? event.ts,
      });
      return { ...state, operators };
    }
    case 'op:leave': {
      // Presence (who's currently online) is derived from live sockets, not
      // folded state -- operator records are kept forever for the
      // operator-list export, so this event is a no-op on folded state
      // today. Kept as a distinct event type for future use (e.g. a host
      // "kick" audit trail).
      return state;
    }
    case 'slot:reserve': {
      const reservations = new Map(state.reservations);
      const key = reservationKey(event.station, event.band, event.mode);
      reservations.set(key, {
        band: event.band,
        mode: event.mode,
        station: event.station,
        operatorCall: event.operatorCall,
        since: event.ts,
      });
      return { ...state, reservations };
    }
    case 'slot:release': {
      const reservations = new Map(state.reservations);
      reservations.delete(reservationKey(event.station, event.band, event.mode));
      return { ...state, reservations };
    }
    case 'qso:add': {
      const qsos = new Map(state.qsos);
      qsos.set(event.qso.id, event.qso);
      const qsoIdByClientId = new Map(state.qsoIdByClientId);
      qsoIdByClientId.set(event.clientId, event.qso.id);
      return { ...state, qsos, qsoIdByClientId };
    }
    case 'qso:edit': {
      const existing = state.qsos.get(event.id);
      if (!existing) return state;
      const qsos = new Map(state.qsos);
      qsos.set(event.id, { ...existing, ...event.patch });
      return { ...state, qsos };
    }
    case 'qso:delete': {
      const existing = state.qsos.get(event.id);
      if (!existing) return state;
      const qsos = new Map(state.qsos);
      qsos.set(event.id, { ...existing, deleted: true });
      return { ...state, qsos };
    }
  }
}

export function fold(events: Iterable<JournalEvent>, initial: State = createInitialState()): State {
  let state = initial;
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}
