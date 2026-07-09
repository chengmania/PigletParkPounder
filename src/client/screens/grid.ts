import { BAND_TIERS, type BandTier } from '../../shared/bands.ts';
import { reservationKey } from '../../shared/journal.ts';
import type { Reservation, StationParkAssignment } from '../../shared/types.ts';
import { splitParkList } from '../../shared/validate.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

export interface ReservationTableOpts {
  readOnly: boolean;
  onClaim?: (band: string, mode: string) => void;
  onRelease?: (band: string, mode: string) => void;
}

// Shared between the operator grid screen (readOnly:false, wired to
// reserve/release) and the Captain's Station read-only grid monitor
// (readOnly:true, no handlers) -- one table-building implementation per
// station+tier so the two views can't silently drift. One table per band
// tier (see BAND_TIERS) rather than one flat band x mode-group matrix: a
// tier only has columns for the mode groups that tier's bands actually use
// (e.g. no FM column on HF), instead of a mostly-dead 13x8 grid.
export function buildReservationTable(
  station: string,
  tier: BandTier,
  reservations: ReadonlyMap<string, Reservation>,
  you: string | null,
  opts: ReservationTableOpts,
): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'reservation-grid';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  for (const group of tier.modeGroups) {
    const th = document.createElement('th');
    th.textContent = group.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const band of tier.bands) {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.textContent = band.label;
    row.appendChild(label);

    for (const group of tier.modeGroups) {
      const key = reservationKey(station, band.id, group.id);
      const reservation = reservations.get(key);
      const holder = reservation?.operatorCall ?? null;
      const onClaim = () => {
        if (reservation) return; // occupied, ignore click (handled via release button in cell)
        opts.onClaim?.(band.id, group.id);
      };
      const onRelease =
        !opts.readOnly && reservation && reservation.operatorCall === you ? () => opts.onRelease?.(band.id, group.id) : undefined;
      row.appendChild(makeCell(holder, opts.readOnly ? null : you, onClaim, onRelease, opts.readOnly));
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

function stationHeading(stationId: string, assignment: StationParkAssignment | undefined): HTMLElement {
  const heading = document.createElement('h2');
  heading.className = 'grid-station-heading';
  const parks = assignment ? splitParkList(assignment.parkNumber).join(', ') : '';
  const parkText = assignment ? `${parks}${assignment.parkName ? ` (${assignment.parkName})` : ''}` : 'no park assigned';
  const stateText = assignment?.state ? `, ${assignment.state}` : '';
  heading.textContent = `${stationId} — ${parkText}${stateText}`;
  return heading;
}

// Grid has no focusable text inputs holding in-progress user typing, so
// unlike log.ts it's exempt from the isNewMount-gated rebuild pattern -- a
// full rebuild on every store update is safe and simplest here.
export function render(container: HTMLElement, _isNewMount: boolean): void {
  const state = store.get();
  const you = state.you?.call ?? null;
  const config = state.data.config;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'screen grid-screen';

  const title = document.createElement('h1');
  title.textContent = 'Band / Mode Reservations';
  wrapper.appendChild(title);

  const stations = config?.stations ?? [];
  if (stations.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No stations configured yet -- ask your Captain to set up the club config.';
    wrapper.appendChild(msg);
  }

  for (const stationId of stations) {
    wrapper.appendChild(stationHeading(stationId, config?.stationParks[stationId]));
    for (const tier of BAND_TIERS) {
      const tierHeading = document.createElement('h3');
      tierHeading.className = 'grid-tier-heading';
      tierHeading.textContent = tier.label;
      wrapper.appendChild(tierHeading);
      wrapper.appendChild(
        buildReservationTable(stationId, tier, state.data.reservations, you, {
          readOnly: false,
          onClaim: (band, mode) => send({ type: 'reserve', band, mode, station: stationId }),
          onRelease: (band, mode) => send({ type: 'release', station: stationId, band, mode }),
        }),
      );
    }
  }

  container.appendChild(wrapper);
}

function makeCell(
  holder: string | null,
  you: string | null,
  onClaim: () => void,
  onRelease: (() => void) | undefined,
  readOnly = false,
): HTMLElement {
  const td = document.createElement('td');
  if (!holder) {
    if (readOnly) {
      const span = document.createElement('span');
      span.className = 'cell cell-open';
      span.textContent = 'Open';
      td.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'cell cell-open';
      btn.textContent = 'Open';
      btn.addEventListener('click', onClaim);
      td.appendChild(btn);
    }
  } else if (holder === you) {
    const btn = document.createElement('button');
    btn.className = 'cell cell-yours';
    btn.textContent = 'Yours';
    if (onRelease) btn.addEventListener('click', onRelease);
    td.appendChild(btn);
  } else {
    const span = document.createElement('span');
    span.className = 'cell cell-taken';
    span.textContent = holder;
    td.appendChild(span);
  }
  return td;
}
