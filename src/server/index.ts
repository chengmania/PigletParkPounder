import { networkInterfaces } from 'node:os';
import { broadcast } from './broadcast.ts';
import type { CommandDeps, ServerContext } from './commands.ts';
import { serveJournalBackup, serveStatic } from './http.ts';
import { boot, writeSnapshot, writeSnapshotIfDue } from './journal-io.ts';
import { makeWebSocketHandlers, upgradeIfWebSocket } from './ws.ts';

function parseArgs(argv: string[]): { port: number; dataDir: string } {
  let port = 8073;
  let dataDir = 'fdlog-data';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (argv[i] === '--data-dir' && argv[i + 1]) dataDir = argv[++i]!;
  }
  return { port, dataDir };
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

async function main() {
  const { port, dataDir } = parseArgs(process.argv.slice(2));
  const { state, seq } = await boot(dataDir);
  const ctx: ServerContext = { dataDir, state, seq };
  const deps: CommandDeps = { ctx, broadcast };

  const wsHandlers = makeWebSocketHandlers(deps);

  const server = Bun.serve({
    port,
    fetch(req, srv) {
      return upgradeIfWebSocket(req, srv) ?? serveJournalBackup(req, dataDir) ?? serveStatic(req);
    },
    websocket: wsHandlers,
  });

  console.log(`PigletDupeDodger listening on port ${port}`);
  for (const ip of localLanIps()) console.log(`  http://${ip}:${port}`);
  console.log(`  http://localhost:${port}`);

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
