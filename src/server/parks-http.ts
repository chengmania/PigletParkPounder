import type { ServerContext } from './commands.ts';
import { importParksFromFile, readParks, syncParksFromUrl } from './parks-store.ts';
import { checkAdminCookie } from './session.ts';

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024; // the real POTA export is ~9MB; well above that is not a real park list

// GET /api/parks is intentionally public (not under /api/admin/) -- every
// operator screen needs it for park-number autocomplete and the work map,
// not just the Captain. Only the update actions themselves are admin-gated.
export async function serveParksApi(req: Request, ctx: ServerContext): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (url.pathname === '/api/parks' && req.method === 'GET') {
    const cache = await readParks(ctx.dataDir);
    return Response.json(cache);
  }

  if (url.pathname === '/api/admin/parks/sync' && req.method === 'POST') {
    if (!ctx.admin || !checkAdminCookie(req, ctx.admin.sessionSecret)) {
      return new Response('Not authorized', { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as { url?: string } | null;
    try {
      const result = await syncParksFromUrl(ctx.dataDir, body?.url?.trim() || undefined);
      return Response.json(result);
    } catch (err) {
      return new Response(`Download failed: ${err}`, { status: 502 });
    }
  }

  if (url.pathname === '/api/admin/parks/upload' && req.method === 'POST') {
    if (!ctx.admin || !checkAdminCookie(req, ctx.admin.sessionSecret)) {
      return new Response('Not authorized', { status: 401 });
    }
    const fileName = req.headers.get('x-file-name') || 'upload.csv';
    const csvText = await req.text();
    if (csvText.length > MAX_UPLOAD_BYTES) {
      return new Response('File too large', { status: 413 });
    }
    if (!csvText.trim()) {
      return new Response('Empty file', { status: 400 });
    }
    try {
      const result = await importParksFromFile(ctx.dataDir, csvText, fileName);
      return Response.json(result);
    } catch (err) {
      return new Response(`Import failed: ${err}`, { status: 400 });
    }
  }

  return undefined;
}
