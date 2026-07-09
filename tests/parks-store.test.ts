import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importParksFromFile, parseParksCsv, readParks, syncParksFromUrl } from '../src/server/parks-store.ts';

const dirsToClean: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ppp-parks-'));
  dirsToClean.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

const SAMPLE_CSV = [
  '"reference","name","active","entityId","locationDesc","latitude","longitude","grid"',
  '"US-0001","Acadia National Park","1","291","US-ME","44.31","-68.2034","FN54vh"',
  '"K-1234","Some Park","1","291","US-PA","40.0","-77.0","FM19"',
  '"G-0001","No Region Park","1","3","GB","51.5","-0.1","IO91"',
].join('\n');

describe('parseParksCsv', () => {
  test('parses reference, name, state (from locationDesc), and coordinates', () => {
    const parks = parseParksCsv(SAMPLE_CSV);
    expect(parks['US-0001']).toEqual({ name: 'Acadia National Park', state: 'ME', lat: 44.31, lon: -68.2034 });
    expect(parks['K-1234']).toEqual({ name: 'Some Park', state: 'PA', lat: 40.0, lon: -77.0 });
  });

  test('a locationDesc with no region hyphen leaves state undefined', () => {
    const parks = parseParksCsv(SAMPLE_CSV);
    expect(parks['G-0001']?.state).toBeUndefined();
  });

  test('skips the header row and blank lines', () => {
    const parks = parseParksCsv(SAMPLE_CSV);
    expect(Object.keys(parks)).toHaveLength(3);
  });
});

describe('syncParksFromUrl + readParks', () => {
  test('fetches, parses, and persists the cache; readParks reflects it', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(SAMPLE_CSV, { status: 200 })) as unknown as typeof fetch;
    try {
      const result = await syncParksFromUrl(dir);
      expect(result.count).toBe(3);

      const cache = await readParks(dir);
      expect(cache.syncedAtUtc).not.toBeNull();
      expect(Object.keys(cache.parks)).toHaveLength(3);
      expect(cache.parks['US-0001']?.name).toBe('Acadia National Park');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('stamps the cache source with the URL that was actually used', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(SAMPLE_CSV, { status: 200 })) as unknown as typeof fetch;
    try {
      await syncParksFromUrl(dir, 'https://example.com/mirror.csv');
      const cache = await readParks(dir);
      expect(cache.source).toBe('https://example.com/mirror.csv');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('readParks on an unsynced dataDir returns an empty cache', async () => {
    const dir = await makeTempDir();
    const cache = await readParks(dir);
    expect(cache).toEqual({ syncedAtUtc: null, parks: {} });
  });

  test('a failed fetch throws rather than silently caching nothing', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    try {
      await expect(syncParksFromUrl(dir)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('importParksFromFile', () => {
  test('parses and persists an uploaded CSV without any network access', async () => {
    const dir = await makeTempDir();
    const originalFetch = globalThis.fetch;
    // Prove no network call happens: fetch would throw if invoked.
    globalThis.fetch = (async () => {
      throw new Error('fetch should not be called for a file import');
    }) as unknown as typeof fetch;
    try {
      const result = await importParksFromFile(dir, SAMPLE_CSV, 'my-parks.csv');
      expect(result.count).toBe(3);

      const cache = await readParks(dir);
      expect(cache.parks['US-0001']?.name).toBe('Acadia National Park');
      expect(cache.source).toBe('Uploaded file: my-parks.csv');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
