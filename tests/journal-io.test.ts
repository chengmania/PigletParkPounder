import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEvent, boot, writeSnapshot } from '../src/server/journal-io.ts';
import type { JournalEvent } from '../src/shared/journal.ts';
import { fold } from '../src/shared/journal.ts';
import type { Qso } from '../src/shared/types.ts';

const dirsToClean: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ppp-journal-io-'));
  dirsToClean.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

function makeQso(id: string): Qso {
  return {
    id,
    ts: '2026-06-27T19:00:00.000Z',
    station: 'R01',
    band: '20m',
    mode: 'SSB',
    call: 'W1ABC',
    operatorCall: 'W1OP',
    myPark: 'K-1234',
    rstSent: '59',
    rstRcvd: '59',
  };
}

describe('boot', () => {
  test('boots to empty state when no data files exist', async () => {
    const dir = await makeTempDir();
    const { state, seq } = await boot(dir);
    expect(seq).toBe(0);
    expect(state.qsos.size).toBe(0);
  });

  test('replays only the tail of the journal past the snapshot seq', async () => {
    const dir = await makeTempDir();
    const events: JournalEvent[] = [
      { type: 'qso:add', ts: 't1', qso: makeQso('q1'), clientId: 'c1' },
      { type: 'qso:add', ts: 't2', qso: makeQso('q2'), clientId: 'c2' },
      { type: 'qso:add', ts: 't3', qso: makeQso('q3'), clientId: 'c3' },
    ];
    await writeFile(join(dir, 'journal.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    // snapshot claims the first 2 events are already folded in
    const snapshotState = fold(events.slice(0, 2));
    await writeSnapshot(dir, snapshotState, 2);

    const { state, seq } = await boot(dir);
    expect(seq).toBe(3);
    expect(state.qsos.size).toBe(3);
    expect(state.qsos.has('q1')).toBe(true);
    expect(state.qsos.has('q3')).toBe(true);
  });

  test('tolerates a corrupted line in the middle of the journal', async () => {
    const dir = await makeTempDir();
    const goodEvent: JournalEvent = { type: 'qso:add', ts: 't1', qso: makeQso('q1'), clientId: 'c1' };
    const goodEvent2: JournalEvent = { type: 'qso:add', ts: 't2', qso: makeQso('q2'), clientId: 'c2' };
    const lines = [JSON.stringify(goodEvent), '{not valid json', JSON.stringify(goodEvent2)];
    await writeFile(join(dir, 'journal.jsonl'), lines.join('\n') + '\n');

    const { state } = await boot(dir);
    expect(state.qsos.size).toBe(2);
    expect(state.qsos.has('q1')).toBe(true);
    expect(state.qsos.has('q2')).toBe(true);
  });
});

describe('appendEvent + boot round trip', () => {
  test('appended events are replayed on next boot', async () => {
    const dir = await makeTempDir();
    await appendEvent(dir, { type: 'qso:add', ts: 't1', qso: makeQso('q1'), clientId: 'c1' });
    await appendEvent(dir, { type: 'qso:add', ts: 't2', qso: makeQso('q2'), clientId: 'c2' });

    const { state, seq } = await boot(dir);
    expect(seq).toBe(2);
    expect(state.qsos.size).toBe(2);
  });
});
