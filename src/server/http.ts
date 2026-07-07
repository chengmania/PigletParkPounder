import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Static `with { type: 'file' }` imports so Bun's bundler embeds the actual
// file contents into the compiled binary at build time -- a dynamically
// joined path + Bun.file() at runtime only works in `bun run` dev mode,
// since there's no real public/ directory sitting next to a standalone
// compiled executable.
// bun-types' ambient *.html typing (HTMLBundle) is for Bun's unrelated
// HTML-bundling feature; with `type: 'file'` this import actually resolves
// to a plain file path string at runtime.
import indexHtmlPath from '../../public/index.html' with { type: 'file' };
// bun-types has no ambient declaration for *.css at all.
import stylesCssPath from '../../public/styles.css' with { type: 'file' };
// bun-types' ambient *.js typing assumes a normal ES module import;
// `type: 'file'` overrides that to a path string.
import appJsPath from '../../public/app.js' with { type: 'file' };
// @ts-expect-error -- same *.css gap as stylesCssPath above.
import worldMapSvgPath from '../../public/world-map.svg' with { type: 'file' };

const STATIC_ROUTES: Record<string, { path: string; contentType: string }> = {
  '/': { path: indexHtmlPath as unknown as string, contentType: 'text/html; charset=utf-8' },
  '/index.html': { path: indexHtmlPath as unknown as string, contentType: 'text/html; charset=utf-8' },
  // /captain serves the same SPA bundle -- main.ts branches on
  // location.pathname at startup rather than needing a second build target.
  '/captain': { path: indexHtmlPath as unknown as string, contentType: 'text/html; charset=utf-8' },
  '/styles.css': { path: stylesCssPath as unknown as string, contentType: 'text/css; charset=utf-8' },
  '/app.js': { path: appJsPath as unknown as string, contentType: 'text/javascript; charset=utf-8' },
  '/world-map.svg': { path: worldMapSvgPath as unknown as string, contentType: 'image/svg+xml' },
};

export function serveJournalBackup(req: Request, dataDir: string): Response | undefined {
  const url = new URL(req.url);
  if (url.pathname !== '/journal.jsonl') return undefined;

  const journalPath = join(dataDir, 'journal.jsonl');
  if (!existsSync(journalPath)) return new Response('', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });

  return new Response(Bun.file(journalPath), {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="journal.jsonl"',
    },
  });
}

export function serveQr(req: Request, svg: string): Response | undefined {
  const url = new URL(req.url);
  if (url.pathname !== '/qr.svg') return undefined;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

export function serveStatic(req: Request): Response {
  const url = new URL(req.url);
  const route = STATIC_ROUTES[url.pathname];
  if (!route) return new Response('Not found', { status: 404 });
  return new Response(Bun.file(route.path), { headers: { 'Content-Type': route.contentType } });
}
