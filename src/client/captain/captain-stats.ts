import { BANDS } from '../../shared/bands.ts';
import { MODES } from '../../shared/modes.ts';
import { computeStats } from '../../shared/pota-stats.ts';
import { store } from '../store.ts';
import { statTile } from '../ui/stat-tile.ts';
import { mountWorkMap } from '../work-map.ts';

export function mountCaptainStats(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen dashboard-screen';

  const title = document.createElement('h1');
  title.textContent = 'Stats';
  root.appendChild(title);

  const body = document.createElement('div');
  root.appendChild(body);

  // Mounted once (fetches the bundled world-map.svg a single time) and kept
  // outside `body`'s per-refresh innerHTML reset below -- only its pins get
  // redrawn on each refresh, via workMap.update().
  const mapTitle = document.createElement('h2');
  mapTitle.textContent = 'Work Map';
  root.appendChild(mapTitle);
  const mapContainer = document.createElement('div');
  root.appendChild(mapContainer);
  const workMap = mountWorkMap(mapContainer);

  container.appendChild(root);

  function refresh(): void {
    workMap.update();
    body.innerHTML = '';
    const state = store.get();
    const config = state.data.config;

    if (!config) {
      const msg = document.createElement('p');
      msg.textContent = 'Club not configured yet -- set up the club config first.';
      body.appendChild(msg);
      return;
    }

    const qsos = [...state.data.qsos.values()];
    const stats = computeStats(qsos);

    const totals = document.createElement('div');
    totals.className = 'dashboard-totals';
    totals.append(
      statTile('Total QSOs', String(stats.totalQsos)),
      statTile('Unique Callsigns', String(stats.uniqueCallsigns)),
      statTile('Park-to-Park QSOs', String(stats.parkToParkCount)),
    );
    body.appendChild(totals);

    const parkTitle = document.createElement('h2');
    parkTitle.textContent = 'Activation Credit by Park / Day';
    body.appendChild(parkTitle);

    const parkTable = document.createElement('table');
    parkTable.className = 'dashboard-matrix';
    parkTable.innerHTML = '<thead><tr><th>Park</th><th>State</th><th>UTC Day</th><th>QSOs</th><th>Unique</th><th>Activated</th></tr></thead>';
    const parkBody = document.createElement('tbody');
    for (const p of stats.perPark) {
      const row = document.createElement('tr');
      for (const value of [p.park, p.state ?? '', p.dateUtc, String(p.qsoCount), String(p.uniqueCallsigns)]) {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      }
      const activatedTd = document.createElement('td');
      activatedTd.textContent = p.activated ? 'YES ✓' : `${p.uniqueCallsigns}/10`;
      activatedTd.className = p.activated ? 'stat-good' : '';
      row.appendChild(activatedTd);
      parkBody.appendChild(row);
    }
    parkTable.appendChild(parkBody);
    body.appendChild(parkTable);

    const matrixTitle = document.createElement('h2');
    matrixTitle.textContent = 'Band / Mode Matrix';
    body.appendChild(matrixTitle);

    const table = document.createElement('table');
    table.className = 'dashboard-matrix';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    for (const mode of MODES) {
      const th = document.createElement('th');
      th.textContent = mode.label;
      headRow.appendChild(th);
    }
    const totalTh = document.createElement('th');
    totalTh.textContent = 'Total';
    headRow.appendChild(totalTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const band of BANDS) {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.textContent = band.label;
      row.appendChild(label);
      let rowTotal = 0;
      for (const mode of MODES) {
        const count = qsos.filter((q) => !q.deleted && !q.dupe && q.band === band.id && q.mode === mode.id).length;
        rowTotal += count;
        const td = document.createElement('td');
        td.textContent = String(count);
        row.appendChild(td);
      }
      const totalTd = document.createElement('td');
      totalTd.textContent = String(rowTotal);
      row.appendChild(totalTd);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    body.appendChild(table);

    const opTitle = document.createElement('h2');
    opTitle.textContent = 'Per-Operator';
    body.appendChild(opTitle);
    const opList = document.createElement('ul');
    for (const [call, count] of Object.entries(stats.perOperator).sort((a, b) => b[1] - a[1])) {
      const li = document.createElement('li');
      li.textContent = `${call}: ${count} QSOs`;
      opList.appendChild(li);
    }
    body.appendChild(opList);
  }

  refresh();
  return store.subscribe(refresh);
}
