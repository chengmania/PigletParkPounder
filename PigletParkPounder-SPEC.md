# PigletParkPounder — Technical Specification

Multi-operator, LAN-based, browser-run **POTA (Parks on the Air) club activation logger** with
real-time dupe checking. Forked from PigletDupeDodger (an ARRL Field Day logger with the same
architecture) and re-targeted at POTA's club-activation rules. Repo:
**github.com/chengmania/PigletParkPounder** (public).

---

## 1. Product summary

- One machine at the activation site runs a **host binary** (from a flash drive). It serves the
  app and is the single source of truth.
- All operator stations connect from **any browser** (desktop, laptop, tablet, phone) via
  `http://<host-ip>:8073`. Zero install on clients.
- **Fully offline** — no internet at the site, ever. No external CDNs, no cloud signaling, no
  analytics. All assets embedded in the binary.
- Real-time shared log over WebSockets: live dupe checking, band/mode reservations per station,
  live stats.
- Persists every event to an append-only journal on disk, so a crash or power loss never loses a
  logged QSO.
- Scale target: 5–10 concurrent operators comfortably; must not break at 25.

## 2. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Server runtime | **Bun + TypeScript** | `bun build --compile` produces standalone cross-platform binaries (no runtime install for users) |
| Cross-compile targets | `bun-windows-x64`, `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64` | Flash-drive distribution: `PigletParkPounder-win.exe`, `-mac-arm`, `-mac-intel`, `-linux` |
| Transport | Native Bun WebSocket server + HTTP static serving | One port (default **8073**, configurable via `--port`) |
| Frontend | **Vanilla TypeScript + a small reactive store** (no framework) bundled to a single JS file; single `index.html` | Keeps the client tiny, fast on old laptops/tablets, zero dependency risk offline |
| Styling | Single hand-written CSS file, dark & light themes | Readable in a dim field at 0300 |
| Persistence | Append-only **JSONL journal** (`potalog-data/journal.jsonl`) + periodic snapshot (`state.json`) | Human-recoverable with a text editor if all else fails |
| Client resilience | `localStorage` outbox queue; auto-reconnect with exponential backoff | WiFi drops must never stop logging |
| Tests | `bun test` for dupe engine, stats engine, ADIF/dupe-sheet exporters | These are the rule-critical paths |

## 3. Domain rules the code enforces

Source: `docs/GuideForClubs.pdf` (POTA's Club Activation Guide) and https://docs.pota.app/.

1. **Everyone transmits the club callsign only.** There is no per-operator callsign on air; the
   app models this as `STATION_CALLSIGN = ClubConfig.clubCall` on every QSO, with `OPERATOR` set
   to whichever signed-in operator actually logged it.
2. **Stations, not a fixed pair.** A club configures an arbitrary list of station/radio ids (e.g.
   `R01`, `R02`, matching the guide's tactical-modifier convention for multi-radio/multi-park
   activations). Each station independently claims its own band/mode reservation slots and is
   bound to its own park assignment (`stationParks[stationId]`).
3. **Duplicates are club-wide, not per-station.** Guide section 7.1: a QSO's uniqueness is
   `CALL + UTC QSO_DATE + BAND + MODE + STATION_CALLSIGN (implicit, one club) + SIG_INFO` (the
   hunter's own park, only if they're also park-to-park). This deliberately ignores which
   internal station/radio logged it — the whole point of shared live logging is catching
   duplicates *across* stations, which is exactly what multi-radio activations risk generating.
4. **Self-work is blocked** (guide section 7.2): a hunter callsign matching the club call is
   always rejected, never overridable. Club stations can never work each other, which follows
   for free since they all share one callsign.
5. **Park-to-park is optional, per QSO.** If the hunter is also activating a park, their park
   number is entered as `theirPark` (ADIF `SIG_INFO`); it's part of the dupe key so working the
   same hunter from two different parks on the same day/band/mode counts as two unique QSOs.
6. **Exchange:** callsign + RST sent/received (customary, not in the guide's minimal ADIF table
   but what's actually spoken on air) + optional hunter park.
7. **Bands/modes:** the real amateur band set (160m–70cm, including the WARC bands and 60m) and
   detailed POTA modes (SSB, CW, FM, AM, FT8, FT4, RTTY, PSK31) written straight into ADIF's
   `MODE` field, per the guide's instruction not to use buckets like "Phone"/"Digital".
8. **Activation credit:** POTA-wide rule (not this club guide) — an activation counts once at
   least 10 unique contacts are logged for a given park on a given UTC day. Tracked per
   (park, day) in the stats engine, not gated by any config.

## 4. Data model (shared TypeScript types)

```ts
type Mode = string;               // catalog in modes.ts, validated against MODE_IDS
type StationKind = string;        // club-defined, validated against ClubConfig.stations

interface StationParkAssignment { parkNumber: string; parkName?: string; state?: string; }

interface ClubConfig {
  clubName: string; clubCall: string;
  stations: string[];
  stationParks: Record<string, StationParkAssignment>;
  eventStartUtc: string; eventEndUtc: string;
  location?: string;
}

interface Operator { call: string; name?: string; connectedAt: string; }

interface Reservation { band: string; mode: Mode; station: StationKind; operatorCall: string; since: string; }

interface Qso {
  id: string; ts: string;
  station: StationKind; band: string; mode: Mode;
  call: string;                    // worked station, normalized upper
  operatorCall: string;
  myPark: string; myState?: string;   // server-stamped snapshot of the station's park(s) at log time --
                                       // myPark is comma-joined if the station activates >1 overlapping park
  theirPark?: string; theirState?: string;   // optional, park-to-park / hunter's state
  rstSent: string; rstRcvd: string;
  deleted?: boolean; queued?: boolean; dupe?: boolean;
}
```

**Journal events** (JSONL, one per line): `config:set`, `op:join`, `op:leave`, `slot:reserve`,
`slot:release`, `qso:add`, `qso:edit`, `qso:delete`. State = fold(journal). Snapshot every 60s to
`state.json` for fast restart; on boot, load snapshot then replay journal tail.

## 5. Wire protocol (WebSocket, JSON)

Client → server: `hello {operatorCall}`, `reserve {band,mode,station}`, `release`,
`qso:add {…, clientId}`, `qso:edit`, `qso:delete`, `config:set`, `ping`.
Server → client: `welcome {fullState}`, `event {journalEvent}` (broadcast), `reject {reason,
clientId?}`, `pong`.

- Full state on connect; thereafter incremental events. Clients hold the whole log in memory →
  dupe checks are instant and local, zero round trips while typing.
- Idempotency: `qso:add` carries a client-generated `clientId`; server dedupes on it so the
  offline outbox can safely retry.
- `myPark`/`myState` are server-stamped from the station's current config at add time — never
  client-settable — so a QSO keeps the park it was actually logged under even if the station is
  later reassigned.

## 6. Dupe engine (pure function, heavily tested)

```
normalize(call): trim, uppercase, strip portable suffixes for dupe MATCHING only
key(qso) = `${base(call)}|${utcDate}|${band}|${mode}|${theirPark ?? ''}`
checkDupe({call, band, mode, theirPark?, dateUtc}, log, {clubCall}) →
  { status: 'NEW' | 'DUPE' | 'BLOCKED_SELF', workedElsewhere, exactDupe? }
```

Edge cases tested: `/P`, `/M`, `/QRP`, `/AG` suffixes; case/whitespace; same call from a
*different internal station* on the same day/band/mode (still a dupe — club-wide, not
per-station); different UTC day (not a dupe — scoped per day); same hunter, different park
(unique — park-to-park differentiation); club's own call (blocked, never overridable).

## 7. Stats engine (pure function, tested)

`computeStats(qsos)` → `{ totalQsos, uniqueCallsigns, parkToParkCount, perOperator, perBand,
perMode, perPark: [{park, state?, dateUtc, qsoCount, uniqueCallsigns, activated}] }`. No
config-driven eligibility rules (unlike Field Day's bonus catalog) — POTA scoring is just
QSO/uniqueness counting.

## 8. Exports (client-side generation, download as files)

1. **ADIF** — the actual POTA submission format. One record per QSO with `STATION_CALLSIGN`,
   `OPERATOR`, `MY_SIG`/`MY_SIG_INFO` (always `POTA`/our park), `SIG`/`SIG_INFO` (only for
   park-to-park), plus `RST_SENT`/`RST_RCVD`. Grouped by (park, state, UTC day) into separate
   files named `<clubcall>@<park>-<yyyymmdd>.adi`, matching the guide's "one log per park and
   state" submission rule exactly.
2. **Personal ADIF** — one operator's own QSOs, for their general logbook (QRZ, LoTW) — same
   fields minus `MY_SIG`/`MY_SIG_INFO`/`SIG`/`SIG_INFO` (POTA credit already flows to them
   automatically per the guide's section 6; re-submitting those fields elsewhere would be wrong).
3. **Dupe sheet** — stations worked, sorted by band then mode then call — printable HTML + CSV.
4. **Summary report (JSON)** — stats plus per-operator QSO counts.
5. **JSON backup** — full journal download from any client.

## 8a. POTA park database + work map

- `potalog-data/parks.json` caches the park reference → `{name, state, lat, lon}` table, built by
  fetching and parsing `https://pota.app/all_parks_ext.csv` (a public, CC0-licensed flat CSV
  covering every park worldwide — confirmed via direct inspection, not an official documented
  API, since POTA's own API docs are still "under construction"). `POST /api/admin/parks/sync`
  (Captain's Station only, needs the host online at that moment) refreshes it; `GET /api/parks`
  is public so any operator screen can use it for autocomplete and the map.
- `public/world-map.svg` is a bundled, public-domain (CC0) equirectangular world outline
  (Wikimedia Commons `BlankMap-World-Equirectangular.svg`, CIA World Factbook-derived) — its
  native viewBox is treated as a full -180°..180° / -90°..90° grid (confirmed by projecting known
  reference cities and checking they land on the right coastlines). The work map fetches this
  SVG once, injects it into the DOM, and draws park pins as a `<g>` layer inside the *same* `<svg>`
  element — guaranteeing pins and coastlines share one coordinate space and can never drift out
  of alignment the way two independently-scaled overlaid elements could. Pan (pointer drag) and
  zoom (wheel, anchored to the cursor) are plain `viewBox` arithmetic — deliberately not a
  tile-based map library, since that would need live internet access every time someone pans or
  zooms during the activation itself, not just once beforehand like the park sync.
- A second pin layer (`src/shared/hunter-locations.ts`) gives non-P2P hunters a rough
  state/country-level pin: `Qso.theirState` stays completely free-typed (never validated or
  constrained — a DX contact must always remain loggable) and is matched best-effort against a
  bundled US-state-centroid table (derived from public-domain US Census data) and a
  country-centroid table (`mledoze/countries`, ODbL-1.0, reduced to name/cca2/latlng), plus a
  small curated set of common DXCC-prefix aliases (`DL`→Germany, `JA`→Japan, etc.) for DX
  contacts who give a callsign prefix rather than a country name. US states are checked before
  country codes/names, so a few two-letter/name collisions resolve to the US reading by design
  (`IN`→Indiana not India, `Georgia`→the US state not the country). No match just means no pin —
  never a blocked or corrected log entry.
- A station simultaneously activating more than one overlapping park stores `parkNumber` (config)
  and `Qso.myPark` as a comma-separated list (e.g. `"K-1234,K-5678"`) — this is also exactly
  ADIF's `MY_SIG_INFO` convention for a simultaneous multi-park activation, so the ADIF exporter
  needs no special-casing; `pota-stats.ts` splits on commas to credit each park independently
  toward its own activation-credit threshold.

## 9. Resilience requirements

- Host: fsync journal on every `qso:add`; SIGINT-safe; restart resumes from snapshot+journal in
  under a couple of seconds.
- Client: on WS drop, banner "Offline — logging locally", queue events in localStorage, replay on
  reconnect (idempotent via clientId), re-diff state from a fresh `welcome`.
- Clock sanity: clients display server UTC time (offset from `welcome`/`pong`), never trust
  laptop clocks for the QSO timestamp — the server stamps `ts` on receipt, unless the QSO arrived
  from the offline queue (then the client's queued UTC `ts` is used, flagged `queued: true`).

## 10. Build & distribution

`bun run build` →

```
dist/bundle/
  PigletParkPounder-win.exe
  PigletParkPounder-mac-arm
  PigletParkPounder-mac-intel
  PigletParkPounder-linux
  START-HERE.txt            # one-paragraph instructions per OS
  potalog-data/             # created/used next to the binary (journal lives here)
```

On launch the binary prints and displays (also at `/` before setup): local IPs, port, and a QR
code (pure-JS QR, embedded) pointing at `http://<ip>:8073` for phone/tablet ops.

## 11. Non-goals (v1)

- No rig control / CAT frequency capture.
- No internet features of any kind (POTA spotting API, self-upload, LoTW, etc.) — logs are
  exported as files for the Captain to submit manually, per the guide.
- No authentication beyond callsign sign-in for operators — it's a trusted LAN in a field. The
  Captain's Station has its own login specifically to gate club configuration and exports.

---

*73, and may your dupes always be dodged.* 🐷
