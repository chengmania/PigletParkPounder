import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFullState, dispatch, type CommandDeps, type Connection, type ServerContext } from '../src/server/commands.ts';
import { createInitialState } from '../src/shared/journal.ts';
import type { ClientMessage, NewQsoInput, ServerMessage } from '../src/shared/protocol.ts';

const dirsToClean: string[] = [];

async function makeDeps(): Promise<CommandDeps> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ppp-commands-'));
  dirsToClean.push(dataDir);
  const ctx: ServerContext = { dataDir, state: createInitialState(), seq: 0, admin: null };
  ctx.state.config = {
    clubName: 'Test Club',
    clubCall: 'W1CLUB',
    stations: ['R01', 'R02'],
    stationParks: {
      R01: { parkNumber: 'K-1234', state: 'PA' },
      R02: { parkNumber: 'K-5678', state: 'NY' },
    },
    eventStartUtc: '2020-01-01T00:00:00.000Z',
    eventEndUtc: '2099-01-01T00:00:00.000Z',
  };
  return { ctx, broadcast: () => {} };
}

function makeConn(): Connection & { sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  return {
    operatorCall: null,
    isAdmin: false,
    send: (m: ServerMessage) => sent.push(m),
    sent,
  };
}

function makeAdminConn(): Connection & { sent: ServerMessage[] } {
  return { ...makeConn(), isAdmin: true };
}

function newQso(overrides: Partial<NewQsoInput> = {}): NewQsoInput {
  return {
    station: 'R01',
    band: '20m',
    mode: 'SSB',
    call: 'W2ABC',
    rstSent: '59',
    rstRcvd: '59',
    ...overrides,
  };
}

async function signIn(deps: CommandDeps, call: string): Promise<Connection & { sent: ServerMessage[] }> {
  const conn = makeConn();
  await dispatch(deps, conn, { type: 'hello', operatorCall: call });
  return conn;
}

function lastRejects(conn: { sent: ServerMessage[] }): ServerMessage[] {
  return conn.sent.filter((m) => m.type === 'reject');
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('qso:add', () => {
  test('rejects when not signed in', async () => {
    const deps = await makeDeps();
    const conn = makeConn();
    const msg: ClientMessage = { type: 'qso:add', clientId: 'c1', qso: newQso() };
    await dispatch(deps, conn, msg);
    expect(lastRejects(conn)).toHaveLength(1);
    expect((lastRejects(conn)[0] as any).reason).toBe('NOT_SIGNED_IN');
  });

  test('rejects when the operator has not reserved the slot', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    expect((lastRejects(conn)[0] as any).reason).toBe('NOT_YOUR_SLOT');
  });

  test('rejects an unrecognized station', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ station: 'R99' }) });
    expect((lastRejects(conn)[0] as any).reason).toBe('INVALID_STATION');
  });

  test('rejects a malformed park number for theirPark', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ theirPark: 'not-a-park' }) });
    expect((lastRejects(conn)[0] as any).reason).toBe('INVALID_PARK');
  });

  test('idempotent double-send with the same clientId does not duplicate the QSO', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });

    const msg: ClientMessage = { type: 'qso:add', clientId: 'dup1', qso: newQso() };
    await dispatch(deps, conn, msg);
    await dispatch(deps, conn, msg);

    expect(deps.ctx.state.qsos.size).toBe(1);
  });

  test('BLOCKED_SELF is never overridable', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, {
      type: 'qso:add',
      clientId: 'c1',
      qso: newQso({ call: 'W1CLUB' }),
      override: true,
    });
    expect((lastRejects(conn)[0] as any).reason).toBe('BLOCKED_SELF');
    expect(deps.ctx.state.qsos.size).toBe(0);
  });

  test('a plain dupe requires override to succeed', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    expect(deps.ctx.state.qsos.size).toBe(1);

    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso() });
    expect((lastRejects(conn)[0] as any).reason).toBe('DUPE_CONFIRM_REQUIRED');
    expect(deps.ctx.state.qsos.size).toBe(1);

    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c3', qso: newQso(), override: true });
    expect(deps.ctx.state.qsos.size).toBe(2);
  });

  test('the same hunter/band/mode/day logged from a different station is still a club-wide dupe', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, connA, { type: 'qso:add', clientId: 'c1', qso: newQso({ station: 'R01' }) });

    const connB = await signIn(deps, 'W2OP');
    await dispatch(deps, connB, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R02' });
    await dispatch(deps, connB, { type: 'qso:add', clientId: 'c2', qso: newQso({ station: 'R02' }) });
    expect((lastRejects(connB)[0] as any).reason).toBe('DUPE_CONFIRM_REQUIRED');
  });

  test('overriding a DUPE persists dupe:true on the stored QSO', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso(), override: true });

    const firstId = deps.ctx.state.qsoIdByClientId.get('c1')!;
    const secondId = deps.ctx.state.qsoIdByClientId.get('c2')!;
    expect(deps.ctx.state.qsos.get(firstId)?.dupe).toBeFalsy();
    expect(deps.ctx.state.qsos.get(secondId)?.dupe).toBe(true);
  });

  test('a NEW qso has no dupe flag and is stamped with its station\'s park', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    const qso = [...deps.ctx.state.qsos.values()][0];
    expect(qso?.dupe).toBeFalsy();
    expect(qso?.myPark).toBe('K-1234');
    expect(qso?.myState).toBe('PA');
  });

  test('a park-to-park QSO carries theirPark through to the stored QSO', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ theirPark: 'k-9999' }) });
    const qso = [...deps.ctx.state.qsos.values()][0];
    expect(qso?.theirPark).toBe('K-9999');
  });
});

describe('qso:edit dupe recompute', () => {
  test("editing a dupe-flagged QSO's call to a fresh value clears the flag", async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ call: 'W2ABC' }) });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso({ call: 'W2ABC' }), override: true });

    const dupeId = deps.ctx.state.qsoIdByClientId.get('c2')!;
    expect(deps.ctx.state.qsos.get(dupeId)?.dupe).toBe(true);

    await dispatch(deps, conn, { type: 'qso:edit', id: dupeId, patch: { call: 'W3FRESH' } });
    expect(deps.ctx.state.qsos.get(dupeId)?.dupe).toBe(false);
    expect(deps.ctx.state.qsos.get(dupeId)?.call).toBe('W3FRESH');
  });

  test("editing a clean QSO's call into collision with another QSO sets the flag", async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ call: 'W2ABC' }) });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso({ call: 'W3OTHER' }) });

    const cleanId = deps.ctx.state.qsoIdByClientId.get('c2')!;
    expect(deps.ctx.state.qsos.get(cleanId)?.dupe).toBeFalsy();

    await dispatch(deps, conn, { type: 'qso:edit', id: cleanId, patch: { call: 'W2ABC' } });
    expect(deps.ctx.state.qsos.get(cleanId)?.dupe).toBe(true);
  });

  test('adding theirPark on edit recomputes the dupe flag', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ call: 'W2ABC' }) });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso({ call: 'W2ABC' }), override: true });

    const dupeId = deps.ctx.state.qsoIdByClientId.get('c2')!;
    // Turns out the second contact was actually park-to-park from a
    // different park -- editing in theirPark should un-dupe it.
    await dispatch(deps, conn, { type: 'qso:edit', id: dupeId, patch: { theirPark: 'K-9999' } });
    expect(deps.ctx.state.qsos.get(dupeId)?.dupe).toBe(false);
  });

  test('editing only RST fields (no dupe-key fields) leaves the dupe flag untouched', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso({ call: 'W2ABC' }) });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso({ call: 'W2ABC' }), override: true });

    const dupeId = deps.ctx.state.qsoIdByClientId.get('c2')!;
    await dispatch(deps, conn, { type: 'qso:edit', id: dupeId, patch: { rstRcvd: '55' } });
    expect(deps.ctx.state.qsos.get(dupeId)?.dupe).toBe(true);
    expect(deps.ctx.state.qsos.get(dupeId)?.rstRcvd).toBe('55');
  });
});

describe('qso:edit / qso:delete ownership', () => {
  test("operator B cannot edit operator A's QSO", async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, connA, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    const id = deps.ctx.state.qsoIdByClientId.get('c1')!;

    const connB = await signIn(deps, 'W2OP');
    await dispatch(deps, connB, { type: 'qso:edit', id, patch: { rstRcvd: '55' } });
    expect((lastRejects(connB)[0] as any).reason).toBe('NOT_YOUR_QSO');
    expect(deps.ctx.state.qsos.get(id)?.rstRcvd).toBe('59'); // unchanged
  });

  test("operator B cannot delete operator A's QSO", async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, connA, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    const id = deps.ctx.state.qsoIdByClientId.get('c1')!;

    const connB = await signIn(deps, 'W2OP');
    await dispatch(deps, connB, { type: 'qso:delete', id });
    expect((lastRejects(connB)[0] as any).reason).toBe('NOT_YOUR_QSO');
    expect(deps.ctx.state.qsos.get(id)?.deleted).toBeFalsy();
  });

  test('the owning operator can edit and delete their own QSO', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    const id = deps.ctx.state.qsoIdByClientId.get('c1')!;

    await dispatch(deps, conn, { type: 'qso:edit', id, patch: { rstRcvd: '55' } });
    expect(deps.ctx.state.qsos.get(id)?.rstRcvd).toBe('55');

    await dispatch(deps, conn, { type: 'qso:delete', id });
    expect(deps.ctx.state.qsos.get(id)?.deleted).toBe(true);
  });
});

describe('config:set admin gating', () => {
  test('config:set rejects a non-admin connection', async () => {
    const deps = await makeDeps();
    const conn = makeConn();
    await dispatch(deps, conn, { type: 'config:set', config: { ...deps.ctx.state.config!, clubName: 'Hacked' } });
    expect((lastRejects(conn)[0] as any).reason).toBe('NOT_ADMIN');
    expect(deps.ctx.state.config?.clubName).toBe('Test Club');
  });

  test('config:set succeeds for an admin connection', async () => {
    const deps = await makeDeps();
    const conn = makeAdminConn();
    await dispatch(deps, conn, { type: 'config:set', config: { ...deps.ctx.state.config!, clubName: 'New Name' } });
    expect(deps.ctx.state.config?.clubName).toBe('New Name');
  });
});

describe('reserve', () => {
  test('a second operator cannot claim an already-held band/mode slot on the same station', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });

    const connB = await signIn(deps, 'W1OP2');
    await dispatch(deps, connB, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });
    expect((lastRejects(connB)[0] as any).reason).toBe('SLOT_TAKEN');
  });

  test('the same band/mode can be independently claimed on a different station', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R01' });

    const connB = await signIn(deps, 'W1OP2');
    await dispatch(deps, connB, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R02' });
    expect(lastRejects(connB)).toHaveLength(0);
  });

  test('rejects reserving an unrecognized station', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'SSB', station: 'R99' });
    expect((lastRejects(conn)[0] as any).reason).toBe('INVALID_STATION');
  });
});

describe('buildFullState', () => {
  test('reflects the current config, operators, and seq', async () => {
    const deps = await makeDeps();
    await signIn(deps, 'W1OP');
    const full = buildFullState(deps.ctx);
    expect(full.config?.clubCall).toBe('W1CLUB');
    expect(full.operators).toHaveLength(1);
    expect(full.seq).toBe(deps.ctx.seq);
  });
});
