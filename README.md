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
     (green NEW, amber DUPE with a confirm-to-log-anyway, red BLOCKED for your own club/GOTA call
     or a satellite single-channel-FM limit hit) before you ever touch the network. A collapsible
     ARRL section map shows live per-section activity as the event progresses.
   - **Dashboard** -- live score (QSO points, power multiplier, bonuses, GOTA/youth bonus, a
     band/mode matrix), an all-operators live QSO feed, and a read-only view of the bonus
     checklist.

   That's the entire operator nav -- exports, club setup, and the bonus checklist itself are all
   one level up, in Captain's Station (next).
6. **Captain's Station** (`/captain`, typed into the address bar -- it's deliberately not linked
   from any operator screen) is where one person configures the event and pulls the exports:
   - **First visit** walks through creating a Captain login (callsign + password) and shows a
     one-time recovery code -- write it on the flash drive label, since it's the only way back in
     if the password is forgotten. Reset later via the in-app "Forgot password?" flow, the
     `--reset-admin` command-line flag (deletes the saved admin login, next `/captain` visit
     re-runs first-time setup), or simply deleting `fdlog-data/admin.json` while the host is
     stopped.
   - Once logged in: **Club Setup** (club name/call, GOTA call, entry class, section, power
     multiplier, event window), a read-only **Grid Monitor** and live **QSO firehose** (the one
     view that shows deleted QSOs, struck through, with band/mode/operator filters), the
     **Section Map**, the editable **Bonus Checklist**, **Exports** (dupe sheet, Cabrillo, JSON
     summary, full journal backup), and a **Score Summary**.
   - This session runs over plain HTTP on the trusted event LAN, same trust model as the rest of
     the app -- it's meant to keep casual operators out of club settings, not to resist a
     determined attacker on the network.
7. **Everything is saved as you go**, into the `fdlog-data/` folder that sits next to the binary
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
- **Forgot the Captain password.** Use "Forgot password?" on the `/captain` login screen with the
  recovery code written on the flash drive label. No recovery code on hand? Stop the host, run it
  once with `--reset-admin` (or delete `fdlog-data/admin.json` by hand), then relaunch normally --
  the next `/captain` visit re-runs first-time setup and issues a fresh recovery code. This never
  touches the QSO log itself.

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
src/server/          host: http+ws server, journal, state machine, QR encoder,
                     admin auth/session/store, admin HTTP API
src/client/          operator SPA: sign-in, band grid, logging, dashboard
src/client/captain/  Captain's Station SPA: setup/login/recovery + the admin
                     dashboard (club setup, grid monitor, live firehose,
                     section map, bonus checklist, exports, score)
src/shared/          types, wire protocol, dupe + scoring engines, exporters,
                     sections/bonus catalogs, section-map pin data
public/              index.html, css, section-map.svg
                     (public/app.js is generated by build:client, not committed)
scripts/build.ts     cross-compile + flashdrive bundling
tests/
docs/2026FieldDayRules.pdf
```
