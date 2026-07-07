import { resetViaRecovery, setupAdmin, verifyLogin } from './admin-auth.ts';
import type { ServerContext } from './commands.ts';
import { buildLogoutCookie, buildSessionCookie, checkAdminCookie } from './session.ts';

function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, init);
}

function withCookie(init: ResponseInit, cookie: string): ResponseInit {
  const headers = new Headers(init.headers);
  headers.append('Set-Cookie', cookie);
  return { ...init, headers };
}

// All routes here are anonymous-reachable by design (setup/login/recovery
// can't require being logged in already) -- authorization for the actions
// they enable (config:set) happens over the WS connection via
// conn.isAdmin, gated by the session cookie these routes issue.
export async function serveAdminApi(req: Request, ctx: ServerContext): Promise<Response | undefined> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/admin/')) return undefined;

  if (url.pathname === '/api/admin/status' && req.method === 'GET') {
    const loggedIn = ctx.admin !== null && checkAdminCookie(req, ctx.admin.sessionSecret);
    return json({ configured: ctx.admin !== null, loggedIn, captainCall: loggedIn ? ctx.admin!.captainCall : undefined });
  }

  if (url.pathname === '/api/admin/setup' && req.method === 'POST') {
    if (ctx.admin !== null) return new Response('Already configured', { status: 409 });
    const body = (await req.json().catch(() => null)) as { captainCall?: string; captainName?: string; password?: string } | null;
    if (!body?.captainCall?.trim() || !body.password) return new Response('Missing required fields', { status: 400 });

    const { record, recoveryCode } = await setupAdmin(ctx.dataDir, {
      captainCall: body.captainCall,
      captainName: body.captainName ?? '',
      password: body.password,
    });
    ctx.admin = record;
    return json({ recoveryCode }, withCookie({}, buildSessionCookie(record.captainCall, record.sessionSecret)));
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    if (!ctx.admin) return new Response('Not configured', { status: 409 });
    const body = (await req.json().catch(() => null)) as { captainCall?: string; password?: string } | null;
    const ok = body ? await verifyLogin(ctx.admin, body.captainCall ?? '', body.password ?? '') : false;
    if (!ok) return new Response('Invalid credentials', { status: 401 });
    return json({ ok: true }, withCookie({}, buildSessionCookie(ctx.admin.captainCall, ctx.admin.sessionSecret)));
  }

  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    return json({ ok: true }, withCookie({}, buildLogoutCookie()));
  }

  if (url.pathname === '/api/admin/recovery/verify' && req.method === 'POST') {
    if (!ctx.admin) return new Response('Not configured', { status: 409 });
    const body = (await req.json().catch(() => null)) as { recoveryCode?: string } | null;
    const valid = body ? await Bun.password.verify(body.recoveryCode ?? '', ctx.admin.recoveryHash) : false;
    return json({ valid });
  }

  if (url.pathname === '/api/admin/recovery/reset' && req.method === 'POST') {
    if (!ctx.admin) return new Response('Not configured', { status: 409 });
    const body = (await req.json().catch(() => null)) as { recoveryCode?: string; newPassword?: string } | null;
    if (!body?.newPassword) return new Response('Missing newPassword', { status: 400 });

    const result = await resetViaRecovery(ctx.dataDir, ctx.admin, body.recoveryCode ?? '', body.newPassword);
    if (!result) return new Response('Invalid recovery code', { status: 401 });
    ctx.admin = result.record;
    return json(
      { recoveryCode: result.recoveryCode },
      withCookie({}, buildSessionCookie(result.record.captainCall, result.record.sessionSecret)),
    );
  }

  return new Response('Not found', { status: 404 });
}
