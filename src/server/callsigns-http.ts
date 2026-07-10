import { gzipSync } from 'bun';
import type { ServerContext } from './commands.ts';
import { getProvider, importCallsignsFromFile, readCallsigns, syncCallsignsFromUrl } from './callsigns-store.ts';
import { checkAdminCookie } from './session.ts';

// The real FCC zip is ~175-200MB; comfortably above that is not a real
// callsign database. Bun.serve's own maxRequestBodySize (raised in
// index.ts) is the hard backstop -- this is just a sanity check for a
// non-zip file that happens to sneak under that cap.
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

// Every operator tab hitting the Log screen calls this -- caching the
// gzipped bytes avoids redoing a full JSON.stringify+gzip over tens of MB on
// every single request, which matters on constrained hardware (e.g. a
// Raspberry Pi) during a live activation. Keyed on each source's
// syncedAtUtc so a sync/upload invalidates it automatically.
let cachedGzip: { key: string; body: Uint8Array } | null = null;

async function getCachedGzippedCallsigns(dataDir: string): Promise<Uint8Array> {
  const cache = await readCallsigns(dataDir);
  const key = Object.values(cache.sources)
    .map((s) => `${s.label}:${s.syncedAtUtc}`)
    .sort()
    .join(',');
  if (cachedGzip?.key !== key) {
    cachedGzip = { key, body: gzipSync(JSON.stringify(cache)) };
  }
  return cachedGzip.body;
}

// GET /api/callsigns is intentionally public (not under /api/admin/) --
// every operator's Log screen needs it for the callsign-resolved bubble,
// not just the Captain. Only the update actions themselves are admin-gated.
export async function serveCallsignsApi(req: Request, ctx: ServerContext): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (url.pathname === '/api/callsigns' && req.method === 'GET') {
    // The full active-license cache runs tens of MB of JSON (an order of
    // magnitude bigger than the parks cache) -- gzip it; fetch() decompresses
    // transparently on every browser, and this JSON's heavy key repetition
    // (state abbreviations, common name tokens) compresses very well.
    const body = await getCachedGzippedCallsigns(ctx.dataDir);
    return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
  }

  if (url.pathname === '/api/admin/callsigns/sync' && req.method === 'POST') {
    if (!ctx.admin || !checkAdminCookie(req, ctx.admin.sessionSecret)) {
      return new Response('Not authorized', { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as { providerId?: string; url?: string } | null;
    if (!body?.providerId || !getProvider(body.providerId)) {
      return new Response('Unknown or missing providerId', { status: 400 });
    }
    try {
      const result = await syncCallsignsFromUrl(ctx.dataDir, body.providerId, body.url?.trim() || undefined);
      return Response.json(result);
    } catch (err) {
      return new Response(`Download failed: ${err}`, { status: 502 });
    }
  }

  if (url.pathname === '/api/admin/callsigns/upload' && req.method === 'POST') {
    if (!ctx.admin || !checkAdminCookie(req, ctx.admin.sessionSecret)) {
      return new Response('Not authorized', { status: 401 });
    }
    const providerId = req.headers.get('x-provider-id') ?? '';
    if (!getProvider(providerId)) {
      return new Response('Unknown or missing X-Provider-Id header', { status: 400 });
    }
    const fileName = req.headers.get('x-file-name') || 'upload.zip';
    const zipBytes = new Uint8Array(await req.arrayBuffer());
    if (zipBytes.byteLength > MAX_UPLOAD_BYTES) {
      return new Response('File too large', { status: 413 });
    }
    if (zipBytes.byteLength === 0) {
      return new Response('Empty file', { status: 400 });
    }
    try {
      const result = await importCallsignsFromFile(ctx.dataDir, providerId, zipBytes, fileName);
      return Response.json(result);
    } catch (err) {
      return new Response(`Import failed: ${err}`, { status: 400 });
    }
  }

  return undefined;
}
