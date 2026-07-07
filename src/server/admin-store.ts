import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AdminRecord {
  formatVersion: 1;
  captainCall: string;
  captainName: string;
  passHash: string; // Bun.password.hash() output (argon2id default)
  recoveryHash: string; // Bun.password.hash() of the one-time recovery code -- plaintext never stored
  sessionSecret: string; // random hex, HMAC key for session.ts, generated once at setup
  createdAtUtc: string;
  updatedAtUtc: string;
}

function adminPath(dataDir: string): string {
  return join(dataDir, 'admin.json');
}

// Lives in the same potalog-data/ folder as journal.jsonl/state.json, so it
// persists across host restarts and travels with the event data.
export async function readAdmin(dataDir: string): Promise<AdminRecord | null> {
  const path = adminPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await Bun.file(path).text()) as AdminRecord;
  } catch (err) {
    console.error(`[admin-store] failed to read admin.json: ${err}`);
    return null;
  }
}

// Atomic write-tmp-then-rename, mirroring journal-io.ts's writeSnapshot.
export async function writeAdmin(dataDir: string, record: AdminRecord): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const path = adminPath(dataDir);
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(record, null, 2));
  await rename(tmpPath, path);
}

// For --reset-admin / manually deleting admin.json while stopped.
export async function deleteAdmin(dataDir: string): Promise<void> {
  await rm(adminPath(dataDir), { force: true });
}
