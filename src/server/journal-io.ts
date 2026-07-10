import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ClubConfig, Operator, Qso, Reservation } from '../shared/types.ts';
import { type JournalEvent, type State, applyEvent, createInitialState, reservationKey } from '../shared/journal.ts';

export interface BootResult {
  state: State;
  seq: number;
}

interface SerializedState {
  config: ClubConfig | null;
  operators: Operator[];
  reservations: Reservation[];
  qsos: Qso[];
  qsoIdByClientId: [string, string][];
}

interface SnapshotFile {
  formatVersion: 1;
  seq: number;
  savedAtUtc: string;
  state: SerializedState;
}

function journalPath(dataDir: string): string {
  return join(dataDir, 'journal.jsonl');
}

function snapshotPath(dataDir: string): string {
  return join(dataDir, 'state.json');
}

function serializeState(state: State): SerializedState {
  return {
    config: state.config,
    operators: [...state.operators.values()],
    reservations: [...state.reservations.values()],
    qsos: [...state.qsos.values()],
    qsoIdByClientId: [...state.qsoIdByClientId.entries()],
  };
}

function deserializeState(serialized: SerializedState): State {
  const state = createInitialState();
  state.config = serialized.config;
  for (const op of serialized.operators) state.operators.set(op.call, op);
  for (const res of serialized.reservations) {
    state.reservations.set(reservationKey(res.station, res.band, res.mode), res);
  }
  for (const qso of serialized.qsos) state.qsos.set(qso.id, qso);
  for (const [clientId, qsoId] of serialized.qsoIdByClientId) state.qsoIdByClientId.set(clientId, qsoId);
  return state;
}

async function readJournalLines(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const text = await Bun.file(path).text();
  if (text.length === 0) return [];
  const lines = text.split('\n');
  // drop the trailing empty line left by the final '\n'
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export async function boot(dataDir: string): Promise<BootResult> {
  await mkdir(dataDir, { recursive: true });

  let state = createInitialState();
  let seq = 0;

  const snapPath = snapshotPath(dataDir);
  if (existsSync(snapPath)) {
    try {
      const snapshot = JSON.parse(await Bun.file(snapPath).text()) as SnapshotFile;
      state = deserializeState(snapshot.state);
      seq = snapshot.seq;
    } catch (err) {
      console.error(`[journal-io] failed to read snapshot, starting from empty state: ${err}`);
      state = createInitialState();
      seq = 0;
    }
  }

  const lines = await readJournalLines(journalPath(dataDir));
  const tail = lines.slice(seq);
  for (const line of tail) {
    try {
      const event = JSON.parse(line) as JournalEvent;
      state = applyEvent(state, event);
      seq++;
    } catch (err) {
      console.error(`[journal-io] skipping corrupt journal line: ${err}`);
    }
  }

  return { state, seq };
}

export async function appendEvent(dataDir: string, event: JournalEvent): Promise<void> {
  const handle = await open(journalPath(dataDir), 'a');
  try {
    await handle.write(`${JSON.stringify(event)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeSnapshotIfDue(
  dataDir: string,
  state: State,
  seq: number,
  lastSnapshotAt: number,
  intervalMs = 60_000,
): Promise<number> {
  const now = Date.now();
  if (now - lastSnapshotAt < intervalMs) return lastSnapshotAt;
  await writeSnapshot(dataDir, state, seq);
  return now;
}

// Serialized through a single chain so overlapping callers (the periodic
// autosave timer and the SIGINT/SIGTERM shutdown handler both call this) never
// race on the shared tmp path -- clearInterval on shutdown only stops the
// timer from firing again, it doesn't cancel an already in-flight write, so
// without this a Ctrl+C landing mid-autosave could crash with an ENOENT on
// rename (whichever call's rename lost the race found its tmp file already
// moved away by the other).
let snapshotChain: Promise<void> = Promise.resolve();

export function writeSnapshot(dataDir: string, state: State, seq: number): Promise<void> {
  const task = snapshotChain.then(() => doWriteSnapshot(dataDir, state, seq));
  snapshotChain = task.catch(() => {});
  return task;
}

async function doWriteSnapshot(dataDir: string, state: State, seq: number): Promise<void> {
  const snapshot: SnapshotFile = {
    formatVersion: 1,
    seq,
    savedAtUtc: new Date().toISOString(),
    state: serializeState(state),
  };
  const tmpPath = `${snapshotPath(dataDir)}.tmp`;
  await writeFile(tmpPath, JSON.stringify(snapshot));
  await rename(tmpPath, snapshotPath(dataDir));
}
