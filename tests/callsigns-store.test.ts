import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { getProvider, importCallsignsFromFile, readCallsigns, syncCallsignsFromUrl } from '../src/server/callsigns-store.ts';

const dirsToClean: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ppp-callsigns-'));
  dirsToClean.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

function usZip(callsign: string): Uint8Array {
  const en = ['EN', '0001', '', '', callsign, '', '', 'A NAME', '', '', '', '', '', '', '', '', '', 'CT'].join('|');
  const hd = ['HD', '0001', '', '', callsign, 'A'].join('|');
  return zipSync({ 'EN.dat': strToU8(en), 'HD.dat': strToU8(hd) });
}

function caZip(callsign: string): Uint8Array {
  const header =
    'callsign;first_name;surname;address_line;city;prov_cd;postal_code;qual_a;qual_b;qual_c;qual_d;qual_e;club_name;club_name_2;club_address;club_city;club_prov_cd;club_postal_code';
  const row = [callsign, 'Jane', 'Doe', '', '', 'ON', '', '', '', '', '', '', '', '', '', '', '', ''].join(';');
  return zipSync({ 'amateur_delim.txt': strToU8([header, row].join('\n')) });
}

describe('getProvider', () => {
  test('knows about both US and CA', () => {
    expect(getProvider('US')?.label).toBe('United States (FCC)');
    expect(getProvider('CA')?.label).toBe('Canada (ISED)');
  });

  test('returns undefined for an unknown provider', () => {
    expect(getProvider('MX')).toBeUndefined();
  });
});

describe('readCallsigns on an unsynced dataDir', () => {
  test('returns an empty response', async () => {
    const dir = await makeTempDir();
    const cache = await readCallsigns(dir);
    expect(cache).toEqual({ callsigns: {}, sources: {} });
  });
});

describe('importCallsignsFromFile', () => {
  test('imports a provider without any network access, stamping source as an upload', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('fetch should not be called for a file import');
    }) as unknown as typeof fetch;
    try {
      const result = await importCallsignsFromFile(dir, 'US', usZip('W1AW'), 'my-callsigns.zip');
      expect(result.count).toBe(1);

      const cache = await readCallsigns(dir);
      expect(cache.callsigns['W1AW']?.name).toBe('A NAME');
      expect(cache.sources['US']?.source).toBe('Uploaded file: my-callsigns.zip');
      expect(cache.sources['US']?.label).toBe('United States (FCC)');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects an unknown provider id', async () => {
    const dir = await makeTempDir();
    await expect(importCallsignsFromFile(dir, 'MX', usZip('W1AW'), 'x.zip')).rejects.toThrow();
  });
});

describe('syncCallsignsFromUrl', () => {
  test('fetches from the given URL and stamps source with it', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array(usZip('K1XYZ')), { status: 200 })) as unknown as typeof fetch;
    try {
      const result = await syncCallsignsFromUrl(dir, 'US', 'https://example.com/mirror.zip');
      expect(result.count).toBe(1);

      const cache = await readCallsigns(dir);
      expect(cache.callsigns['K1XYZ']?.name).toBe('A NAME');
      expect(cache.sources['US']?.source).toBe('https://example.com/mirror.zip');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('a failed fetch throws rather than silently caching nothing', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    try {
      await expect(syncCallsignsFromUrl(dir, 'US')).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('multi-provider merge behavior', () => {
  test('syncing two different countries merges both into one callsign map', async () => {
    const dir = await makeTempDir();
    await importCallsignsFromFile(dir, 'US', usZip('W1AW'), 'us.zip');
    await importCallsignsFromFile(dir, 'CA', caZip('VA1AA'), 'ca.zip');

    const cache = await readCallsigns(dir);
    expect(cache.callsigns['W1AW']?.name).toBe('A NAME');
    expect(cache.callsigns['VA1AA']?.name).toBe('Jane Doe');
    expect(Object.keys(cache.sources).sort()).toEqual(['CA', 'US']);
  });

  test('re-syncing one country replaces only that country\'s own bucket', async () => {
    const dir = await makeTempDir();
    await importCallsignsFromFile(dir, 'US', usZip('W1AW'), 'us-v1.zip');
    await importCallsignsFromFile(dir, 'CA', caZip('VA1AA'), 'ca.zip');

    // Re-sync US with a completely different callsign -- the old US entry
    // must be gone (this call sign was dropped/revoked in the new import),
    // but Canada's data must be untouched.
    await importCallsignsFromFile(dir, 'US', usZip('K9NEW'), 'us-v2.zip');

    const cache = await readCallsigns(dir);
    expect(cache.callsigns['W1AW']).toBeUndefined();
    expect(cache.callsigns['K9NEW']?.name).toBe('A NAME');
    expect(cache.callsigns['VA1AA']?.name).toBe('Jane Doe');
    expect(cache.sources['US']?.source).toBe('Uploaded file: us-v2.zip');
    expect(cache.sources['CA']?.source).toBe('Uploaded file: ca.zip');
  });
});
