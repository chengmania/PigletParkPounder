# PigletParkPounder 🐷

Multi-operator, LAN-based, browser-run **POTA (Parks on the Air) club activation logger** with
real-time dupe checking. One machine at the site runs the host binary; every operator station
connects from any browser on the local WiFi network. No internet is ever required, at the site or
in the app.

Built around POTA's [Club Activation Guide](docs/GuideForClubs.pdf): everyone transmits the same
club callsign, duplicates are tracked club-wide (not per radio), and each station/radio can be
assigned its own park -- so a club running one or more stations across one or more parks gets a
live, shared dupe sheet instead of merging separate logs after the fact.

73, and may your dupes always be dodged.

**[Download the latest release](https://github.com/chengmania/PigletParkPounder/releases/latest)** --
prebuilt binaries for Windows, Mac (Apple Silicon + Intel), and Linux. No install, no
dependencies, no internet connection needed.

## Tent-ready quick start

1. **[Download the latest release](https://github.com/chengmania/PigletParkPounder/releases/latest)
   and copy the binary onto whatever computer will act as the host** -- a laptop, desktop, or
   something like a Raspberry Pi. It doesn't need internet access -- it just needs to be on the
   same WiFi network the operator stations will use (bring your own travel router if the site has
   no WiFi).
2. **Run the binary for that computer's operating system:**
   - Windows: double-click `PigletParkPounder-win.exe`
   - Mac (Apple Silicon): `./PigletParkPounder-mac-arm` from a terminal
   - Mac (Intel): `./PigletParkPounder-mac-intel` from a terminal
   - Linux: `./PigletParkPounder-linux` from a terminal

   On Mac/Linux you may need to allow execution once: `chmod +x PigletParkPounder-*`.
3. **A terminal window opens and prints a QR code plus a list of URLs**, e.g.
   `http://192.168.1.42:8073`. That's the address of your activation log for the rest of the
   session.
4. **On every operator's laptop, tablet, or phone:** join the same WiFi network as the host,
   then open that URL in a browser (or scan the printed QR code, which also appears on the
   app's own connect screen). There's nothing to install on any client.
5. **Sign in with your callsign** on the connect screen. From there:
   - **Grid** -- claim a band/mode slot on one of the club's configured stations before you start
     transmitting on it. The grid is split into two tiers -- HF bands (SSB/CW/Digi) and VHF/UHF
     bands (SSB/CW/FM/Digi) -- rather than one column per exact mode, since a real activation
     never needs a separate slot for every digital submode on every band. A Digi slot covers
     whichever of FT8/FT4/RTTY/PSK31 you're actually running; pick the exact submode per QSO from
     the Digi Mode dropdown that appears on the Log screen once you're in a Digi slot. Each
     station gets its own grid and its own park assignment, so multiple radios (the guide's
     `/R01`, `/R02` convention) never collide on the air or in the log.
   - **Log** -- the actual logging screen. Type a callsign, RST sent/received, and optionally
     the hunter's state and (if they're also activating) their park number -- you'll see an
     instant dupe check (green NEW, amber DUPE with a confirm-to-log-anyway, red BLOCKED for your
     own club call) before you ever touch the network. Once the callsign database has been
     imported (see Captain's Station below), the Call field resolves to the licensee's name and
     state as you type -- a mistyped callsign is obvious before you hit Log, the same idea as the
     park number, which autocompletes from the synced park database. Dupes are computed against
     the whole club's log, across every station and operator -- exactly as POTA scores it. A live
     Park-to-Park panel shows P2P contacts as they happen.
   - **Dashboard** -- live stats (total QSOs, unique callsigns, park-to-park count, a band/mode
     matrix), an all-operators live QSO feed, the Park-to-Park panel, a Work Map (drag to pan,
     scroll to zoom, all fully offline -- no map tiles, no internet needed) plotting every park
     referenced in the log plus a rough pin for non-P2P hunters whose "Their State" resolves to a
     known US state or country, and a personal **Export My Log (QRZ/LoTW)** button -- your own
     QSOs only, safe to import into your own general logbook since it deliberately omits the
     POTA-specific fields (that credit already flows to you automatically once the club uploads
     its own log).

   That's the entire operator nav -- exports and club setup are one level up, in Captain's Station
   (next).
6. **Captain's Station** (`/captain`, typed into the address bar -- it's deliberately not linked
   from any operator screen) is where one person configures the activation and pulls the exports:
   - **First visit** walks through creating a Captain login (callsign + password) and shows a
     one-time recovery code -- write it down somewhere safe, since it's the only way back in
     if the password is forgotten. Reset later via the in-app "Forgot password?" flow, the
     `--reset-admin` command-line flag (deletes the saved admin login, next `/captain` visit
     re-runs first-time setup), or simply deleting `potalog-data/admin.json` while the host is
     stopped.
   - Once logged in: **Club Setup** (club name/call and one row per station/radio -- station id,
     park number(s) -- comma-separated if a station is simultaneously activating more than one
     overlapping park -- optional park name and state), a read-only **Grid Monitor** and live
     **QSO firehose** (the one view that shows deleted QSOs, struck through, with band/mode/
     operator/park-to-park filters), the **Park-to-Park** panel, an **Imports** tab (loads
     reference data ahead of time, while there's still internet -- the POTA park list for
     autocomplete/the work map, and the FCC's and Canada's ISED amateur-license databases so a
     hunter's callsign resolves to a name/state on the Log screen; each one can be downloaded
     directly if this computer has internet right now, or downloaded on any other device and
     uploaded here as a file if it won't), **Exports** (dupe sheet, ADIF grouped by park and day
     for POTA submission, JSON summary, full journal backup), and a **Stats** screen with
     activation-credit progress per park/day plus the same Work Map.
   - This session runs over plain HTTP on the trusted event LAN, same trust model as the rest of
     the app -- it's meant to keep casual operators out of club settings, not to resist a
     determined attacker on the network.
7. **Everything is saved as you go**, into the `potalog-data/` folder that sits next to the
   binary on the host machine. Don't delete or move that folder during the activation -- it's the
   only copy of the log until you run an export. If the host machine crashes or loses power, just
   relaunch the binary in the same location; it resumes exactly where it left off.
8. **Submitting to POTA:** the Captain's **Exports** screen produces one ADIF file per
   park+state+day, already named the way POTA's guide asks for it (`<clubcall>@<park>-<yyyymmdd>.adi`),
   ready to email or upload from the club's own POTA account -- never an individual operator's.

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
  first, on the right station; a slot isn't released automatically when a browser disconnects (a
  dropped WiFi connection doesn't mean the transmitter went silent), so use the grid's release
  button if you need to hand it off.
- **Restarting the host mid-activation.** Safe at any time -- relaunch the same binary with the
  same `potalog-data/` folder and it replays the journal to rebuild state in under a couple of
  seconds.
- **Forgot the Captain password.** Use "Forgot password?" on the `/captain` login screen with the
  recovery code written down at setup time. No recovery code on hand? Stop the host, run it
  once with `--reset-admin` (or delete `potalog-data/admin.json` by hand), then relaunch normally
  -- the next `/captain` visit re-runs first-time setup and issues a fresh recovery code. This
  never touches the QSO log itself.

## Development

```bash
bun install
bun test              # dupe/stats engines, journal fold, exports, QR encoder, WS commands,
                       # park/callsign parsers
bun run dev            # start the host server with --watch (http://localhost:8073)
bun run build:client   # rebuild public/app.js from src/client
bun run build          # cross-compile all four binaries + assemble dist/bundle/
```

The one runtime dependency is [fflate](https://github.com/101arrowz/fflate) (pure JS, no native
bindings), used to unzip the FCC's and ISED's bulk callsign exports -- it bundles straight into
the compiled binary, so it adds no network dependency at the activation site.

The rules source of truth is `docs/GuideForClubs.pdf` (POTA's Club Activation Guide) and
[docs.pota.app](https://docs.pota.app/); the product/architecture spec is
`PigletParkPounder-SPEC.md` in the repo root.

### Repo layout

```
src/server/          host: http+ws server, journal, state machine, QR encoder,
                     admin auth/session/store, admin HTTP API, park + callsign
                     reference-data sync (parks-*, callsigns-*, one parser per
                     country under callsigns-sources/)
src/client/          operator SPA: sign-in, band grid, logging, dashboard
src/client/captain/  Captain's Station SPA: setup/login/recovery + the admin
                     dashboard (club setup, grid monitor, live firehose,
                     park-to-park panel, Imports tab -- parks + callsigns
                     sync, exports, stats)
src/shared/          types, wire protocol, dupe + stats engines, exporters
                     (ADIF/dupe sheet/summary), bands/modes catalogs, park +
                     callsign reference-data types
public/              index.html, css, world-map.svg (public domain, see file header)
                     (public/app.js is generated by build:client, not committed)
scripts/build.ts     cross-compile + dist/bundle/ packaging
tests/
docs/GuideForClubs.pdf
```
