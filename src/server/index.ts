import { networkInterfaces } from 'node:os';
import { deleteAdmin, readAdmin } from './admin-store.ts';
import { serveAdminApi } from './admin-http.ts';
import { broadcast } from './broadcast.ts';
import { serveCallsignsApi } from './callsigns-http.ts';
import type { CommandDeps, ServerContext } from './commands.ts';
import { serveJournalBackup, serveQr, serveStatic } from './http.ts';
import { boot, writeSnapshot, writeSnapshotIfDue } from './journal-io.ts';
import { serveParksApi } from './parks-http.ts';
import { generateQrMatrix, qrToAsciiArt, qrToSvg } from './qr.ts';
import { makeWebSocketHandlers, upgradeIfWebSocket } from './ws.ts';

function parseArgs(argv: string[]): { port: number; dataDir: string; resetAdmin: boolean } {
  let port = 8073;
  let dataDir = 'potalog-data';
  let resetAdmin = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (argv[i] === '--data-dir' && argv[i + 1]) dataDir = argv[++i]!;
    else if (argv[i] === '--reset-admin') resetAdmin = true;
  }
  return { port, dataDir, resetAdmin };
}

function localLanIps(): string[] {
  const ips: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const { port, dataDir, resetAdmin } = parseArgs(process.argv.slice(2));

  if (resetAdmin) {
    await deleteAdmin(dataDir);
    console.log('Admin configuration removed -- next /captain visit will run first-time setup.');
    process.exit(0);
  }

  const { state, seq } = await boot(dataDir);
  const admin = await readAdmin(dataDir);
  const ctx: ServerContext = { dataDir, state, seq, admin };
  const deps: CommandDeps = { ctx, broadcast };

  // Only used before first-run admin setup completes -- no valid session
  // cookie can exist yet at that point, so its exact value doesn't matter,
  // it just needs to be *some* per-process secret for signSession/upgrade
  // consistency until ctx.admin is set.
  const fallbackSessionSecret = randomHex(32);

  const wsHandlers = makeWebSocketHandlers(deps);

  const lanIps = localLanIps();
  const primaryUrl = `http://${lanIps[0] ?? 'localhost'}:${port}`;
  const qrSvg = qrToSvg(generateQrMatrix(primaryUrl));

  const server = Bun.serve({
    port,
    async fetch(req, srv) {
      const wsResponse = upgradeIfWebSocket(req, srv, ctx.admin?.sessionSecret ?? fallbackSessionSecret);
      if (wsResponse) return wsResponse;

      // Checked before serveAdminApi: that handler's catch-all 404s any
      // unmatched /api/admin/* path, which would otherwise swallow
      // /api/admin/parks/sync (and the callsigns equivalents below) before
      // they ever reach parks-http.ts/callsigns-http.ts.
      const parksResponse = await serveParksApi(req, ctx);
      if (parksResponse) return parksResponse;

      const callsignsResponse = await serveCallsignsApi(req, ctx);
      if (callsignsResponse) return callsignsResponse;

      const adminResponse = await serveAdminApi(req, ctx);
      if (adminResponse) return adminResponse;

      return serveJournalBackup(req, dataDir) ?? serveQr(req, qrSvg) ?? serveStatic(req);
    },
    websocket: wsHandlers,
    // Default is 128MB -- raised for the Captain's Callsigns "upload a file"
    // path, since the real FCC amateur-license zip is ~175-200MB.
    maxRequestBodySize: 300 * 1024 * 1024,
  });

  console.log(`PigletParkPounder listening on port ${port}`);
  for (const ip of lanIps) console.log(`  http://${ip}:${port}`);
  console.log(`  http://localhost:${port}`);
  console.log('\nScan to connect:\n');
  console.log(qrToAsciiArt(generateQrMatrix(primaryUrl)));

  let lastSnapshotAt = Date.now();
  const snapshotInterval = setInterval(async () => {
    lastSnapshotAt = await writeSnapshotIfDue(dataDir, ctx.state, ctx.seq, lastSnapshotAt);
  }, 5_000);

  const shutdown = async () => {
    clearInterval(snapshotInterval);
    await writeSnapshot(dataDir, ctx.state, ctx.seq);
    server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
