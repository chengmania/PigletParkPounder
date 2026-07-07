// Free string validated against MODE_IDS (modes.ts), not a union -- mirrors
// how `band` is a free string validated against BAND_IDS (bands.ts). POTA
// logs want the detailed mode (ssb, FT8, ...) not a Field-Day-style bucket.
export type Mode = string;

// Free string validated against ClubConfig.stations -- a club defines its
// own station/radio ids (e.g. "R01", "R02"), there's no fixed MAIN/GOTA pair.
export type StationKind = string;

// One internal station/radio's current park assignment (guide section 4.1's
// /R01, /R02 convention: each station can be at a different park). Snapshot
// of this is stamped onto each Qso as myPark/myState at logging time (see
// commands.ts) so a QSO keeps the park it was actually logged under even if
// the station gets reassigned later in the session.
export interface StationParkAssignment {
  // One park ("K-1234") or a comma-separated list ("K-1234,K-5678") for a
  // station simultaneously activating more than one overlapping park (a
  // park within a park, a trail crossing a boundary, etc.) -- validate with
  // isValidParkList/splitParkList (validate.ts). Stored as-is (comma-joined)
  // on each Qso.myPark, since that's also exactly ADIF's MY_SIG_INFO format
  // for a simultaneous multi-park activation.
  parkNumber: string;
  parkName?: string;
  state?: string; // for parks that cross state lines -- guide section 7.1
}

export interface ClubConfig {
  clubName: string;
  clubCall: string;
  stations: string[];
  stationParks: Record<string, StationParkAssignment>;
  eventStartUtc: string;
  eventEndUtc: string;
  location?: string;
}

export interface Operator {
  call: string;
  name?: string;
  connectedAt: string;
}

export interface Reservation {
  band: string;
  mode: Mode;
  station: StationKind;
  operatorCall: string;
  since: string;
}

export interface Qso {
  id: string;
  ts: string;
  station: StationKind;
  band: string;
  mode: Mode;
  call: string;
  operatorCall: string;
  // Snapshot of this station's park assignment at the moment this QSO was
  // logged (server-stamped, never client-settable -- see protocol.ts).
  // This is ADIF's MY_SIG_INFO.
  myPark: string;
  myState?: string;
  // The hunter's own park, only present for a park-to-park contact. ADIF's
  // SIG_INFO -- also part of the dupe key (guide section 7.1).
  theirPark?: string;
  // The hunter's own state/region, as given in the exchange (not a dupe-key
  // field, not required by the guide -- just useful record-keeping, same as
  // ADIF's STATE field).
  theirState?: string;
  rstSent: string;
  rstRcvd: string;
  deleted?: boolean;
  // Set when this QSO's ts came from a client's offline outbox rather than
  // being stamped by the server on receipt (spec section 10).
  queued?: boolean;
  // Server-computed only (never client-settable, see protocol.ts): true when
  // this QSO was logged (or edited into) an already-worked exact key and
  // explicitly confirmed "log anyway". Excluded from stats/exports/dupe
  // sheet, but stays visible (with a badge) and is kept in the JSON backup.
  dupe?: boolean;
}
