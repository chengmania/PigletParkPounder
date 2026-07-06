# PigletDupeDodger 🐷

Multi-operator, LAN-based, browser-run ARRL Field Day logging program with real-time dupe
checking. One machine at the site runs the host binary; every operator station connects from
any browser on the local WiFi network. No internet is ever required, at the site or in the app.

73, and may your dupes always be dodged.

## Tent-ready quick start

1. **Plug the flash drive into the computer that will act as the host.** It doesn't need
   internet access -- it just needs to be on the same WiFi network the operator stations will
   use (bring your own travel router if the site has no WiFi).
2. **Run the binary for that computer's operating system:**
   - Windows: double-click `PigletDupeDodger-win.exe`
   - Mac (Apple Silicon): `./PigletDupeDodger-mac-arm` from a terminal
   - Mac (Intel): `./PigletDupeDodger-mac-intel` from a terminal
   - Linux: `./PigletDupeDodger-linux` from a terminal

   On Mac/Linux you may need to allow execution once: `chmod +x PigletDupeDodger-*`.
3. **A terminal window opens and prints a QR code plus a list of URLs**, e.g.
   `http://192.168.1.42:8073`. That's the address of your Field Day log for the rest of the
   event.
4. **On every operator's laptop, tablet, or phone:** join the same WiFi network as the host,
   then open that URL in a browser (or scan the printed QR code, which also appears on the
   app's own connect screen). There's nothing to install on any client.
5. **Sign in with your callsign** on the connect screen. From there:
   - **Grid** -- claim a band/mode slot before you start transmitting on it (Rule 6.5: one
     signal per band/mode at a time). GOTA is a single shared slot, any band/mode (Rule 4.1.1).
   - **Log** -- the actual logging screen. Type a callsign and you'll see an instant dupe check
     (green NEW, amber DUPE with a confirm-to-override, red BLOCKED for your own club/GOTA call
     or a satellite single-channel-FM limit hit) before you ever touch the network.
   - **Dashboard** -- live score: QSO points, power multiplier, bonuses, GOTA/youth bonus, and a
     band/mode matrix.
   - **Exports** -- dupe sheet (HTML/CSV), Cabrillo log, JSON summary report, and a full journal
     backup, whenever you're ready to submit.
   - **Host Setup** -- available on the host machine itself (or any browser visited once with
     `?host=1` in the URL) -- club config and the bonus checklist.
   - **Leaderboard** -- a read-only, no-sign-in-required big-screen view (`/#/leaderboard`) for a
     monitor facing visitors.
6. **Everything is saved as you go**, into the `fdlog-data/` folder that sits next to the binary
   on the flash drive. Don't delete or move that folder during the event -- it's the only copy
   of the log until you run an export. If the host machine crashes or loses power, just relaunch
   the binary from the same flash drive; it resumes exactly where it left off.

## Troubleshooting

- **A station can't reach the URL.** Confirm it's actually joined the same WiFi network as the
  host (not a guest network or its own cellular data), and that the host's firewall allows
  inbound connections on the port (default `8073`).
- **No WiFi access point at the site.** The host machine can't create one by itself -- bring a
  small travel router (or a phone's mobile hotspot in a pinch) and have the host and all
  operator stations join that instead.
- **"Offline -- logging locally" banner.** A dropped connection never stops logging -- QSOs
  typed while offline are queued in the browser and sent automatically once the connection comes
  back, using the time they were actually logged (not the time they finally reached the host).
- **Wrong band/mode slot / "not your slot" when logging.** Claim the slot on the **Grid** screen
  first; a slot isn't released automatically when a browser disconnects (a dropped WiFi
  connection doesn't mean the transmitter went silent), so use the grid's release button if you
  need to hand it off.
- **Restarting the host mid-event.** Safe at any time -- relaunch the same binary with the same
  `fdlog-data/` folder and it replays the journal to rebuild state in under a couple of seconds.

## Development

```bash
bun install
bun test              # dupe/scoring engines, journal fold, exports, QR encoder, WS commands
bun run dev            # start the host server with --watch (http://localhost:8073)
bun run build:client   # rebuild public/app.js from src/client
bun run build          # cross-compile all four binaries + assemble dist/flashdrive/
```

The rules source of truth is `docs/2026FieldDayRules.pdf`; the original product/architecture
spec is `PigletDupeDodger-SPEC.md` in the repo root.

### Repo layout

```
src/server/    host: http+ws server, journal, state machine, QR encoder
src/client/    SPA: sign-in, band grid, logging, dashboard, exports, host setup, leaderboard
src/shared/    types, wire protocol, dupe + scoring engines, exporters, sections/bonus catalogs
public/        index.html, css (public/app.js is generated by build:client, not committed)
scripts/build.ts   cross-compile + flashdrive bundling
tests/
docs/2026FieldDayRules.pdf
```
