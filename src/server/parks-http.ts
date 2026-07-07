import type { ServerContext } from './commands.ts';
import { readParks, syncParks } from './parks-store.ts';
import { checkAdminCookie } from './session.ts';

// GET /api/parks is intentionally public (not under /api/admin/) -- every
// operator screen needs it for park-number autocomplete and the work map,
// not just the Captain. Only the sync action itself is admin-gated.
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
    try {
      const result = await syncParks(ctx.dataDir);
      return Response.json(result);
    } catch (err) {
      return new Response(`Sync failed: ${err}`, { status: 502 });
    }
  }

  return undefined;
}
