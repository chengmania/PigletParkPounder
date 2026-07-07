import { BAND_IDS } from '../shared/bands.ts';
import { checkDupe, normalizeCall, utcDateOf } from '../shared/dupe.ts';
import { generateId } from '../shared/id.ts';
import { applyEvent, reservationKey, type JournalEvent, type State } from '../shared/journal.ts';
import { MODE_IDS } from '../shared/modes.ts';
import type { ClientMessage, FullState, RejectReason, ServerMessage } from '../shared/protocol.ts';
import type { Mode, Qso } from '../shared/types.ts';
import { isValidParkNumber } from '../shared/validate.ts';
import type { AdminRecord } from './admin-store.ts';
import { appendEvent } from './journal-io.ts';

export interface ServerContext {
  dataDir: string;
  state: State;
  seq: number;
  // Mutated in place by admin-http.ts on setup/reset, mirroring how
  // ctx.state/ctx.seq are already mutated in place by append().
  admin: AdminRecord | null;
}

export interface Connection {
  operatorCall: string | null;
  readonly isAdmin: boolean;
  send: (message: ServerMessage) => void;
}

export interface CommandDeps {
  ctx: ServerContext;
  broadcast: (message: ServerMessage) => void;
}

function reject(conn: Connection, reason: RejectReason, clientId?: string, refType?: ClientMessage['type']): void {
  conn.send({ type: 'reject', reason, clientId, refType });
}

export function buildFullState(ctx: ServerContext): FullState {
  return {
    config: ctx.state.config,
    operators: [...ctx.state.operators.values()],
    reservations: [...ctx.state.reservations.values()],
    qsos: [...ctx.state.qsos.values()],
    seq: ctx.seq,
  };
}

async function append(deps: CommandDeps, event: Parameters<typeof applyEvent>[1]): Promise<void> {
  await appendEvent(deps.ctx.dataDir, event);
  deps.ctx.state = applyEvent(deps.ctx.state, event);
  deps.ctx.seq += 1;
  deps.broadcast({ type: 'event', event, seq: deps.ctx.seq });
}

function isValidStation(deps: CommandDeps, station: string): boolean {
  return (deps.ctx.state.config?.stations ?? []).includes(station);
}

export async function handleHello(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'hello' }>,
): Promise<void> {
  const call = normalizeCall(msg.operatorCall);
  conn.operatorCall = call;
  await append(deps, {
    type: 'op:join',
    ts: new Date().toISOString(),
    call,
    name: msg.name,
  });
  conn.send({
    type: 'welcome',
    you: deps.ctx.state.operators.get(call)!,
    serverNowUtc: new Date().toISOString(),
    state: buildFullState(deps.ctx),
  });
}

export async function handleReserve(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'reserve' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  if (!BAND_IDS.includes(msg.band) || !MODE_IDS.includes(msg.mode)) {
    return reject(conn, 'INVALID_BAND_MODE');
  }
  if (!isValidStation(deps, msg.station)) return reject(conn, 'INVALID_STATION');

  const key = reservationKey(msg.station, msg.band, msg.mode);
  const existing = deps.ctx.state.reservations.get(key);

  if (existing && existing.operatorCall !== conn.operatorCall) {
    return reject(conn, 'SLOT_TAKEN');
  }
  if (existing && existing.operatorCall === conn.operatorCall) {
    // Idempotent re-claim (e.g. a page refresh) -- avoid journal bloat.
    return;
  }

  await append(deps, {
    type: 'slot:reserve',
    ts: new Date().toISOString(),
    band: msg.band,
    mode: msg.mode,
    station: msg.station,
    operatorCall: conn.operatorCall,
  });
}

export async function handleRelease(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'release' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  if (!msg.band || !msg.mode) return reject(conn, 'INVALID_BAND_MODE');

  const key = reservationKey(msg.station, msg.band, msg.mode);
  const existing = deps.ctx.state.reservations.get(key);
  if (!existing) return reject(conn, 'NOT_FOUND');
  if (existing.operatorCall !== conn.operatorCall) return reject(conn, 'NOT_YOUR_SLOT');

  await append(deps, {
    type: 'slot:release',
    ts: new Date().toISOString(),
    band: existing.band,
    mode: existing.mode,
    station: msg.station,
  });
}

export async function handleQsoAdd(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:add' }>,
): Promise<void> {
  const existingId = deps.ctx.state.qsoIdByClientId.get(msg.clientId);
  if (existingId) {
    // Idempotent retry (offline-outbox replay or a double-send): don't
    // re-append, just re-echo the original event to this socket only.
    const existingQso = deps.ctx.state.qsos.get(existingId);
    if (existingQso) {
      conn.send({
        type: 'event',
        event: { type: 'qso:add', ts: existingQso.ts, qso: existingQso, clientId: msg.clientId },
        seq: deps.ctx.seq,
      });
    }
    return;
  }

  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN', msg.clientId, msg.type);

  const { band, mode, station } = msg.qso;
  if (!BAND_IDS.includes(band) || !MODE_IDS.includes(mode as Mode)) {
    return reject(conn, 'INVALID_BAND_MODE', msg.clientId, msg.type);
  }
  if (!isValidStation(deps, station)) return reject(conn, 'INVALID_STATION', msg.clientId, msg.type);
  if (msg.qso.theirPark && !isValidParkNumber(msg.qso.theirPark)) {
    return reject(conn, 'INVALID_PARK', msg.clientId, msg.type);
  }

  const config = deps.ctx.state.config;
  const parkAssignment = config?.stationParks[station];
  if (!parkAssignment) return reject(conn, 'INVALID_STATION', msg.clientId, msg.type);

  const ts = msg.queued && msg.clientTs ? msg.clientTs : new Date().toISOString();
  const theirPark = msg.qso.theirPark ? msg.qso.theirPark.trim().toUpperCase() : undefined;

  const dupe = checkDupe(
    { call: msg.qso.call, band, mode, theirPark, dateUtc: utcDateOf(ts) },
    [...deps.ctx.state.qsos.values()],
    { clubCall: config?.clubCall ?? '' },
  );
  if (dupe.status === 'BLOCKED_SELF') return reject(conn, 'BLOCKED_SELF', msg.clientId, msg.type);
  if (dupe.status === 'DUPE' && !msg.override) return reject(conn, 'DUPE_CONFIRM_REQUIRED', msg.clientId, msg.type);

  const slotKey = reservationKey(station, band, mode);
  const reservation = deps.ctx.state.reservations.get(slotKey);
  if (!reservation || reservation.operatorCall !== conn.operatorCall) {
    return reject(conn, 'NOT_YOUR_SLOT', msg.clientId, msg.type);
  }

  const qso: Qso = {
    ...msg.qso,
    theirPark,
    id: generateId(),
    ts,
    operatorCall: conn.operatorCall,
    myPark: parkAssignment.parkNumber,
    myState: parkAssignment.state,
    queued: !!msg.queued,
    // Only reachable here with dupe.status === 'DUPE' when override was
    // true (any other DUPE case already rejected above). Hybrid two-press
    // logging: this QSO still gets logged, just flagged 0-point/excluded.
    dupe: dupe.status === 'DUPE',
  };

  await append(deps, { type: 'qso:add', ts, qso, clientId: msg.clientId });
}

export async function handleQsoEdit(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:edit' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  const existing = deps.ctx.state.qsos.get(msg.id);
  if (!existing) return reject(conn, 'NOT_FOUND');
  if (existing.operatorCall !== conn.operatorCall) return reject(conn, 'NOT_YOUR_QSO');

  if (msg.patch.theirPark !== undefined && msg.patch.theirPark && !isValidParkNumber(msg.patch.theirPark)) {
    return reject(conn, 'INVALID_PARK');
  }

  // If the edit touches any dupe-key field, re-run checkDupe against the
  // rest of the log (excluding this QSO) with the merged new values and
  // fold the recomputed flag into the same journal event. This handles both
  // directions -- un-duping (call corrected to something fresh) and newly
  // duping (edited into collision with another QSO) -- from one code path.
  // computeStats() is always derived fresh from current state, so there's no
  // separate "rescore" step once the flag updates.
  let patch: Extract<JournalEvent, { type: 'qso:edit' }>['patch'] = msg.patch;
  const touchesDupeKey =
    !existing.deleted &&
    (msg.patch.call !== undefined || msg.patch.band !== undefined || msg.patch.mode !== undefined || msg.patch.theirPark !== undefined);
  if (touchesDupeKey) {
    const merged = { ...existing, ...msg.patch };
    const config = deps.ctx.state.config;
    const others = [...deps.ctx.state.qsos.values()].filter((q) => q.id !== msg.id);
    const result = checkDupe(
      { call: merged.call, band: merged.band, mode: merged.mode, theirPark: merged.theirPark, dateUtc: utcDateOf(existing.ts) },
      others,
      { clubCall: config?.clubCall ?? '' },
    );
    patch = { ...msg.patch, dupe: result.status === 'DUPE' };
  }

  await append(deps, { type: 'qso:edit', ts: new Date().toISOString(), id: msg.id, patch });
}

export async function handleQsoDelete(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:delete' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  const existing = deps.ctx.state.qsos.get(msg.id);
  if (!existing) return reject(conn, 'NOT_FOUND');
  if (existing.operatorCall !== conn.operatorCall) return reject(conn, 'NOT_YOUR_QSO');
  await append(deps, { type: 'qso:delete', ts: new Date().toISOString(), id: msg.id });
}

export async function handleConfigSet(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'config:set' }>,
): Promise<void> {
  if (!conn.isAdmin) return reject(conn, 'NOT_ADMIN');
  await append(deps, { type: 'config:set', ts: new Date().toISOString(), config: msg.config });
}

export function handlePing(conn: Connection, msg: Extract<ClientMessage, { type: 'ping' }>): void {
  conn.send({ type: 'pong', t: msg.t, serverNowUtc: new Date().toISOString() });
}

export async function dispatch(deps: CommandDeps, conn: Connection, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'hello':
      return handleHello(deps, conn, msg);
    case 'reserve':
      return handleReserve(deps, conn, msg);
    case 'release':
      return handleRelease(deps, conn, msg);
    case 'qso:add':
      return handleQsoAdd(deps, conn, msg);
    case 'qso:edit':
      return handleQsoEdit(deps, conn, msg);
    case 'qso:delete':
      return handleQsoDelete(deps, conn, msg);
    case 'config:set':
      return handleConfigSet(deps, conn, msg);
    case 'ping':
      return handlePing(conn, msg);
  }
}
