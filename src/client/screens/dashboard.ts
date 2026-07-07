import { BANDS } from '../../shared/bands.ts';
import { toPersonalAdifLog } from '../../shared/export/adif.ts';
import { MODES } from '../../shared/modes.ts';
import { computeStats } from '../../shared/pota-stats.ts';
import { downloadBlob, exportButton } from '../download.ts';
import { mountParkToPark, type ParkToParkHandle } from '../park-to-park.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
import { store } from '../store.ts';
import { statTile } from '../ui/stat-tile.ts';
import { mountWorkMap, type WorkMapHandle } from '../work-map.ts';

interface Els {
  totals: HTMLElement;
  myExportContainer: HTMLElement;
  matrixBody: HTMLElement;
  opList: HTMLElement;
  feedBody: HTMLElement;
  parkToPark: ParkToParkHandle;
  workMap: WorkMapHandle;
}

let els: Els | null = null;
// Tracks whether the currently-built shell assumed a config was present --
// lets a live config:set mid-session (no route change, so isNewMount stays
// false) still trigger the one-time shell rebuild it needs.
let builtForConfig = false;

export function render(container: HTMLElement, isNewMount: boolean): void {
  const hasConfig = !!store.get().data.config;

  if (isNewMount || !els || builtForConfig !== hasConfig) {
    build(container, hasConfig);
  }
  if (hasConfig) updateDynamic();
}

function build(container: HTMLElement, hasConfig: boolean): void {
  container.innerHTML = '';
  els = null;
  builtForConfig = hasConfig;

  const root = document.createElement('div');
  root.className = 'screen dashboard-screen';

  const title = document.createElement('h1');
  title.textContent = 'Dashboard';
  root.appendChild(title);

  if (!hasConfig) {
    const msg = document.createElement('p');
    msg.textContent = 'Club not configured yet -- ask your Captain to set up the club config.';
    root.appendChild(msg);
    container.appendChild(root);
    return;
  }

  const totals = document.createElement('div');
  totals.className = 'dashboard-totals';
  root.appendChild(totals);

  // A personal action (not Captain-gated): lets the signed-in operator pull
  // their own QSOs for their general logbook (QRZ, LoTW). Deliberately not
  // a second POTA submission -- POTA credit already flows to them
  // automatically once the club uploads its own log (guide section 6).
  const myExportContainer = document.createElement('div');
  root.appendChild(myExportContainer);

  const matrixTitle = document.createElement('h2');
  matrixTitle.textContent = 'Band / Mode Matrix';
  root.appendChild(matrixTitle);

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
  const matrixBody = document.createElement('tbody');
  table.appendChild(matrixBody);
  root.appendChild(table);

  const opTitle = document.createElement('h2');
  opTitle.textContent = 'Per-Operator';
  root.appendChild(opTitle);
  const opList = document.createElement('ul');
  root.appendChild(opList);

  const feedTitle = document.createElement('h2');
  feedTitle.textContent = 'Live QSO Feed';
  root.appendChild(feedTitle);
  const feedTable = document.createElement('table');
  feedTable.className = 'qso-table';
  const feedThead = document.createElement('thead');
  feedThead.innerHTML =
    '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Mode</th><th>RST Sent</th><th>RST Rcvd</th><th>Their State</th><th>Their Park</th><th>Operator</th></tr>';
  feedTable.appendChild(feedThead);
  const feedBody = document.createElement('tbody');
  feedTable.appendChild(feedBody);
  root.appendChild(feedTable);

  const p2pTitle = document.createElement('h2');
  p2pTitle.textContent = 'Park-to-Park';
  root.appendChild(p2pTitle);
  const p2pContainer = document.createElement('div');
  root.appendChild(p2pContainer);
  const parkToPark = mountParkToPark(p2pContainer, { alwaysExpanded: true });

  const mapTitle = document.createElement('h2');
  mapTitle.textContent = 'Work Map';
  root.appendChild(mapTitle);
  const mapContainer = document.createElement('div');
  root.appendChild(mapContainer);
  const workMap = mountWorkMap(mapContainer);

  container.appendChild(root);

  els = { totals, myExportContainer, matrixBody, opList, feedBody, parkToPark, workMap };
}

function updateDynamic(): void {
  if (!els) return;
  const state = store.get();
  const config = state.data.config;
  if (!config) return;

  const qsos = [...state.data.qsos.values()];
  const stats = computeStats(qsos);

  els.totals.innerHTML = '';
  els.totals.append(
    statTile('Total QSOs', String(stats.totalQsos)),
    statTile('Unique Callsigns', String(stats.uniqueCallsigns)),
    statTile('Park-to-Park QSOs', String(stats.parkToParkCount)),
  );

  els.myExportContainer.innerHTML = '';
  if (state.you) {
    const you = state.you;
    els.myExportContainer.appendChild(
      exportButton('Export My Log (QRZ/LoTW)', () => {
        const adif = toPersonalAdifLog(qsos, config.clubCall, you.call);
        downloadBlob(`${you.call}-my-log.adi`, adif, 'text/plain');
      }),
    );
  }

  els.matrixBody.innerHTML = '';
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
    els.matrixBody.appendChild(row);
  }

  els.opList.innerHTML = '';
  for (const [call, count] of Object.entries(stats.perOperator).sort((a, b) => b[1] - a[1])) {
    const li = document.createElement('li');
    li.textContent = `${call}: ${count} QSOs`;
    els.opList.appendChild(li);
  }

  // All-operators live QSO feed -- deleted rows are filtered out here,
  // unlike the admin firehose which intentionally shows them.
  els.feedBody.innerHTML = '';
  const rows = sortNewestFirst(qsos.filter((q) => !q.deleted)).map((q) => toQsoRow(q, null));
  for (const row of rows) {
    const tr = document.createElement('tr');
    const callCell = document.createElement('td');
    callCell.textContent = row.call;
    if (row.isDupe) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-dupe';
      badge.textContent = 'DUPE';
      callCell.appendChild(badge);
    }
    tr.appendChild(callCell);
    for (const value of [row.utc, row.band, row.mode, row.rstSent, row.rstRcvd, row.theirState ?? '', row.theirPark ?? '', row.operatorCall]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    els.feedBody.appendChild(tr);
  }

  els.parkToPark.update();
  els.workMap.update();
}
