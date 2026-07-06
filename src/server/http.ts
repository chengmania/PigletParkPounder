import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = join(import.meta.dir, '..', '..', 'public');

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

export async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  if (pathname.includes('..')) return new Response('Not found', { status: 404 });

  const filePath = join(PUBLIC_DIR, pathname);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  return new Response('Not found', { status: 404 });
}
