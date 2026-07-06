import { BANDS } from '../../shared/bands.ts';
import { scoreLog } from '../../shared/scoring.ts';
import type { Mode } from '../../shared/types.ts';
import { isHostMode } from '../host-mode.ts';
import { store } from '../store.ts';

const MODES: Mode[] = ['PH', 'CW', 'DIG'];

export function render(container: HTMLElement): void {
  container.innerHTML = '';
  container.dataset.screen = 'dashboard';

  const root = document.createElement('div');
  root.className = 'screen dashboard-screen';

  const title = document.createElement('h1');
  title.textContent = 'Dashboard';
  root.appendChild(title);

  const state = store.get();
  const config = state.data.config;

  if (!config) {
    const msg = document.createElement('p');
    msg.textContent = 'Event not configured yet.';
    root.appendChild(msg);
    if (isHostMode()) {
      const link = document.createElement('a');
      link.href = '#/setup';
      link.textContent = 'Go to host setup.';
      root.appendChild(link);
    }
    container.appendChild(root);
    return;
  }

  const qsos = [...state.data.qsos.values()];
  const operators = [...state.data.operators.values()];
  const score = scoreLog(qsos, config, state.data.bonuses, operators);

  const totals = document.createElement('div');
  totals.className = 'dashboard-totals';
  totals.append(
    statTile('QSO Points', String(score.qsoPoints)),
    statTile('Multiplier', `x${score.multiplier}`),
    statTile('Multiplied Points', String(score.multipliedPoints)),
    statTile('Bonus Points', String(score.bonusPoints)),
    statTile('GOTA Bonus', String(score.gotaBonus)),
    statTile('Youth Bonus', String(score.youthBonus)),
    statTile('Total', String(score.total)),
  );
  root.appendChild(totals);

  if (score.ineligibleClaims.length > 0) {
    const warn = document.createElement('p');
    warn.className = 'dashboard-warning';
    warn.textContent = `Claimed but not counted (class-ineligible or requirements unmet): ${score.ineligibleClaims.join(', ')}`;
    root.appendChild(warn);
  }

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
    th.textContent = mode;
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
      const count = qsos.filter((q) => !q.deleted && q.band === band.id && q.mode === mode).length;
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
  root.appendChild(table);

  const opTitle = document.createElement('h2');
  opTitle.textContent = 'Per-Operator';
  root.appendChild(opTitle);
  const opList = document.createElement('ul');
  for (const [call, stats] of Object.entries(score.perOperator).sort((a, b) => b[1].count - a[1].count)) {
    const li = document.createElement('li');
    li.textContent = `${call}: ${stats.count} QSOs, ${stats.qsoPoints} pts`;
    opList.appendChild(li);
  }
  root.appendChild(opList);

  container.appendChild(root);
}

function statTile(label: string, value: string): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'stat-tile';
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = value;
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  tile.append(v, l);
  return tile;
}
