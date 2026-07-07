import { $ } from 'bun';
import { cp, mkdir, writeFile } from 'node:fs/promises';

const TARGETS = [
  { bunTarget: 'bun-windows-x64', suffix: 'win.exe' },
  { bunTarget: 'bun-darwin-arm64', suffix: 'mac-arm' },
  { bunTarget: 'bun-darwin-x64', suffix: 'mac-intel' },
  { bunTarget: 'bun-linux-x64', suffix: 'linux' },
] as const;

const START_HERE = `PigletParkPounder -- quick start
=================================

1. Copy this folder onto the computer that will run the host at your POTA
   club activation (a laptop, desktop, or something like a Raspberry Pi --
   needs no internet connection, just a shared WiFi network with the
   operator stations).
2. Run the binary for that computer's OS:
     Windows -> PigletParkPounder-win.exe (double-click)
     Mac (Apple Silicon) -> PigletParkPounder-mac-arm
     Mac (Intel) -> PigletParkPounder-mac-intel
     Linux -> PigletParkPounder-linux
   (On Mac/Linux you may need to run "chmod +x <file>" once first, and
   launch it from a terminal: ./PigletParkPounder-mac-arm)
3. The terminal window will print a QR code and a list of URLs, e.g.
   http://192.168.1.42:8073 -- note the one on your local WiFi network.
4. On every operator's laptop/tablet/phone, connect to the same WiFi network
   as the host, then open that URL in a browser (or scan the QR code).
   No install needed on any client.
5. Before the activation: one person should visit <that URL>/captain (typed
   into the address bar -- it's not linked from any operator screen) to set
   up the Captain's Station login and club config (club call, and one row
   per station/radio with its park number). First visit shows a one-time
   recovery code -- write it down somewhere safe, it's the only way back in
   if the Captain password is forgotten.
6. All QSOs are saved as they're logged into the potalog-data/ folder next
   to the binary. Don't delete that folder during the activation -- it's
   your only copy until you export at the end (Captain's Station has the
   ADIF export for POTA submission, dupe sheet, and the full journal backup
   download).

73, and may your dupes always be dodged!
`;

async function main() {
  console.log('Building client bundle...');
  await $`bun build ./src/client/main.ts --outfile public/app.js --minify`;

  await mkdir('dist', { recursive: true });

  for (const t of TARGETS) {
    const outfile = `dist/PigletParkPounder-${t.suffix}`;
    console.log(`Compiling ${outfile} (${t.bunTarget})...`);
    await $`bun build --compile --target=${t.bunTarget} ./src/server/index.ts --outfile ${outfile}`;
  }

  const bundleDir = 'dist/bundle';
  await mkdir(`${bundleDir}/potalog-data`, { recursive: true });
  for (const t of TARGETS) {
    await cp(`dist/PigletParkPounder-${t.suffix}`, `${bundleDir}/PigletParkPounder-${t.suffix}`);
  }
  await writeFile(`${bundleDir}/START-HERE.txt`, START_HERE);
  await writeFile(`${bundleDir}/potalog-data/.gitkeep`, '');

  try {
    await $`cd dist && zip -r bundle.zip bundle`.quiet();
    console.log('Created dist/bundle.zip');
  } catch {
    console.log('("zip" command not found -- dist/bundle/ left as a plain folder)');
  }

  console.log('\nDone. See dist/bundle/');
}

main();
