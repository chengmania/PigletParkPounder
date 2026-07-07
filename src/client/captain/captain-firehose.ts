import { BANDS } from '../../shared/bands.ts';
import { MODES } from '../../shared/modes.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
import { store } from '../store.ts';

// The one surface that intentionally shows deleted QSOs (struck through) --
// everywhere else, deletion hides a row from view entirely.
export function mountCaptainFirehose(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-firehose-screen';

  const title = document.createElement('h1');
  title.textContent = 'Live QSOs';
  root.appendChild(title);

  const filters = document.createElement('div');
  filters.className = 'captain-firehose-filters';
  root.appendChild(filters);

  const bandFilter = document.createElement('select');
  bandFilter.appendChild(new Option('All bands', ''));
  for (const band of BANDS) bandFilter.appendChild(new Option(band.label, band.id));
  filters.appendChild(bandFilter);

  const modeFilter = document.createElement('select');
  modeFilter.appendChild(new Option('All modes', ''));
  for (const mode of MODES) modeFilter.appendChild(new Option(mode.label, mode.id));
  filters.appendChild(modeFilter);

  const operatorFilter = document.createElement('select');
  operatorFilter.appendChild(new Option('All operators', ''));
  filters.appendChild(operatorFilter);

  const p2pOnlyLabel = document.createElement('label');
  const p2pOnlyCheckbox = document.createElement('input');
  p2pOnlyCheckbox.type = 'checkbox';
  p2pOnlyLabel.append(p2pOnlyCheckbox, ' Park-to-Park only');
  filters.appendChild(p2pOnlyLabel);

  const table = document.createElement('table');
  table.className = 'qso-table';
  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Mode</th><th>RST Sent</th><th>RST Rcvd</th><th>Their State</th><th>Their Park</th><th>Station</th><th>Operator</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  root.appendChild(table);

  container.appendChild(root);

  let lastOperatorOptions = '';

  function refresh(): void {
    const state = store.get();
    const qsos = [...state.data.qsos.values()];

    const operatorCalls = [...new Set(qsos.map((q) => q.operatorCall))].sort();
    const operatorKey = operatorCalls.join(',');
    if (operatorKey !== lastOperatorOptions) {
      lastOperatorOptions = operatorKey;
      const selected = operatorFilter.value;
      operatorFilter.innerHTML = '';
      operatorFilter.appendChild(new Option('All operators', ''));
      for (const call of operatorCalls) operatorFilter.appendChild(new Option(call, call));
      operatorFilter.value = operatorCalls.includes(selected) ? selected : '';
    }

    const bandSel = bandFilter.value;
    const modeSel = modeFilter.value;
    const opSel = operatorFilter.value;
    const p2pOnly = p2pOnlyCheckbox.checked;

    const filtered = qsos.filter(
      (q) =>
        (!bandSel || q.band === bandSel) &&
        (!modeSel || q.mode === modeSel) &&
        (!opSel || q.operatorCall === opSel) &&
        (!p2pOnly || !!q.theirPark),
    );
    const rows = sortNewestFirst(filtered).map((q) => toQsoRow(q, null));

    tbody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      if (row.isDeleted) tr.className = 'qso-row-deleted';

      const callCell = document.createElement('td');
      callCell.textContent = row.call;
      if (row.isDupe) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-dupe';
        badge.textContent = 'DUPE';
        callCell.appendChild(badge);
      }
      tr.appendChild(callCell);

      for (const value of [
        row.utc,
        row.band,
        row.mode,
        row.rstSent,
        row.rstRcvd,
        row.theirState ?? '',
        row.theirPark ?? '',
        row.station,
        row.operatorCall,
      ]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  }

  bandFilter.addEventListener('change', refresh);
  modeFilter.addEventListener('change', refresh);
  operatorFilter.addEventListener('change', refresh);
  p2pOnlyCheckbox.addEventListener('change', refresh);

  refresh();
  return store.subscribe(refresh);
}
