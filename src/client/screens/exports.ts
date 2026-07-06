import { toCabrilloLog } from '../../shared/export/cabrillo.ts';
import { toDupeSheetCsv, toDupeSheetHtml } from '../../shared/export/dupesheet.ts';
import { toSummaryReport } from '../../shared/export/summary.ts';
import { store } from '../store.ts';

function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function render(container: HTMLElement): void {
  container.innerHTML = '';
  container.dataset.screen = 'exports';

  const root = document.createElement('div');
  root.className = 'screen exports-screen';

  const title = document.createElement('h1');
  title.textContent = 'Exports';
  root.appendChild(title);

  const state = store.get();
  const config = state.data.config;

  if (!config) {
    const msg = document.createElement('p');
    msg.textContent = 'Event not configured yet -- set up the club config first.';
    root.appendChild(msg);
    container.appendChild(root);
    return;
  }

  const qsos = [...state.data.qsos.values()];
  const operators = [...state.data.operators.values()];

  const buttons = document.createElement('div');
  buttons.className = 'export-buttons';

  buttons.appendChild(
    exportButton('Dupe Sheet (HTML)', () => downloadBlob('dupe-sheet.html', toDupeSheetHtml(qsos), 'text/html')),
  );
  buttons.appendChild(exportButton('Dupe Sheet (CSV)', () => downloadBlob('dupe-sheet.csv', toDupeSheetCsv(qsos), 'text/csv')));
  buttons.appendChild(
    exportButton('Cabrillo Log', () => downloadBlob('fieldday.log', toCabrilloLog(qsos, config), 'text/plain')),
  );
  buttons.appendChild(
    exportButton('Summary Report (JSON)', () => {
      const report = toSummaryReport(qsos, config, state.data.bonuses, operators);
      downloadBlob('summary.json', JSON.stringify(report, null, 2), 'application/json');
    }),
  );

  const journalLink = document.createElement('a');
  journalLink.href = '/journal.jsonl';
  journalLink.textContent = 'Download Full Journal Backup';
  journalLink.className = 'export-link';
  buttons.appendChild(journalLink);

  root.appendChild(buttons);
  container.appendChild(root);
}

function exportButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
