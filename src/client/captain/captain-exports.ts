import { groupForSubmission } from '../../shared/export/adif.ts';
import { toDupeSheetCsv, toDupeSheetHtml } from '../../shared/export/dupesheet.ts';
import { toSummaryReport } from '../../shared/export/summary.ts';
import { downloadBlob, exportButton } from '../download.ts';
import { store } from '../store.ts';

export function mountCaptainExports(container: HTMLElement): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen exports-screen';

  const title = document.createElement('h1');
  title.textContent = 'Exports';
  root.appendChild(title);

  const state = store.get();
  const config = state.data.config;

  if (!config) {
    const msg = document.createElement('p');
    msg.textContent = 'Club not configured yet -- set up the club config first.';
    root.appendChild(msg);
    container.appendChild(root);
    return;
  }

  const qsos = [...state.data.qsos.values()];
  const operators = [...state.data.operators.values()];

  const buttons = document.createElement('div');
  buttons.className = 'export-buttons';

  buttons.appendChild(exportButton('Dupe Sheet (HTML)', () => downloadBlob('dupe-sheet.html', toDupeSheetHtml(qsos), 'text/html')));
  buttons.appendChild(exportButton('Dupe Sheet (CSV)', () => downloadBlob('dupe-sheet.csv', toDupeSheetCsv(qsos), 'text/csv')));
  buttons.appendChild(
    exportButton('Summary Report (JSON)', () => {
      const report = toSummaryReport(qsos, operators);
      downloadBlob('summary.json', JSON.stringify(report, null, 2), 'application/json');
    }),
  );

  root.appendChild(buttons);

  // Guide section 5: submissions are "1 log per park and state", filed as
  // <clubcall>@<park>-<yyyymmdd>.adi -- one download button per group so
  // the Captain doesn't have to hand-split the log themselves.
  const adifTitle = document.createElement('h2');
  adifTitle.textContent = 'ADIF (for POTA submission)';
  root.appendChild(adifTitle);

  const groups = groupForSubmission(qsos, config.clubCall);
  if (groups.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'No QSOs logged yet.';
    root.appendChild(none);
  } else {
    const adifButtons = document.createElement('div');
    adifButtons.className = 'export-buttons';
    for (const group of groups) {
      adifButtons.appendChild(exportButton(group.filename, () => downloadBlob(group.filename, group.content, 'text/plain')));
    }
    root.appendChild(adifButtons);
  }

  const journalLink = document.createElement('a');
  journalLink.href = '/journal.jsonl';
  journalLink.textContent = 'Download Full Journal Backup';
  journalLink.className = 'export-link';
  root.appendChild(journalLink);

  container.appendChild(root);
}
