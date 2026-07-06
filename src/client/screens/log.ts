import { BANDS } from '../../shared/bands.ts';
import { checkDupe } from '../../shared/dupe.ts';
import { generateId } from '../../shared/id.ts';
import type { Mode, Qso, Reservation, StationKind } from '../../shared/types.ts';
import { isValidClass } from '../../shared/validate.ts';
import { isValidSectionCode } from '../../shared/sections.ts';
import { fillDatalist, workedCallOptions } from '../autocomplete.ts';
import { describeDupe } from '../dupe-live.ts';
import { buildIdentity } from '../log-model.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
import { mountSectionMap, type SectionMapHandle } from '../section-map.ts';
import { mountSectionSelect, type SectionSelectHandle } from '../section-select.ts';
import { store } from '../store.ts';
import { onQsoAddOutcome, send } from '../ws-client.ts';

interface Context {
  station: StationKind;
  band: string;
  mode: Mode;
}

interface Els {
  identityBar: HTMLElement;
  contextRow: HTMLElement;
  contextSelect: HTMLSelectElement | null;
  contextLabel: HTMLElement;
  callInput: HTMLInputElement;
  classInput: HTMLInputElement;
  sectionSelect: SectionSelectHandle;
  satFields: HTMLElement;
  satNameInput: HTMLInputElement;
  satFmCheckbox: HTMLInputElement;
  dupeStatus: HTMLElement;
  logBtn: HTMLButtonElement;
  ticker: HTMLElement;
  yourRecent: HTMLElement;
  sessionCount: HTMLElement;
  callsDatalist: HTMLDataListElement;
  sectionMap: SectionMapHandle;
}

let els: Els | null = null;
const pending = new Map<string, Qso>();
let unsubscribeOutcomes: (() => void) | null = null;
let lastReservationKeys = '';
let editingId: string | null = null;

function contextKey(r: Pick<Reservation, 'station' | 'band' | 'mode'>): string {
  return `${r.station}|${r.band}|${r.mode}`;
}

function parseContextKey(key: string): Context {
  const [station, band, mode] = key.split('|');
  return { station: station as StationKind, band: band!, mode: mode as Mode };
}

export function render(container: HTMLElement, isNewMount: boolean): void {
  if (isNewMount || !els) {
    buildForm(container);
  }
  updateDynamic();
}

function buildForm(container: HTMLElement): void {
  container.innerHTML = '';
  pending.clear();
  editingId = null;
  unsubscribeOutcomes?.();

  const root = document.createElement('div');
  root.className = 'screen log-screen';

  const title = document.createElement('h1');
  title.textContent = 'Log a QSO';
  root.appendChild(title);

  // Identity bar: reminds the operator who/what they are, always visible.
  const identityBar = document.createElement('div');
  identityBar.className = 'identity-bar';
  root.appendChild(identityBar);

  const contextLabel = document.createElement('p');
  contextLabel.className = 'log-context';
  root.appendChild(contextLabel);

  const contextRow = document.createElement('div');
  contextRow.className = 'log-context-select';
  root.appendChild(contextRow);

  const form = document.createElement('form');
  form.className = 'log-form';

  const entryRow = document.createElement('div');
  entryRow.className = 'log-entry-row';

  const callInput = document.createElement('input');
  callInput.placeholder = 'Callsign worked';
  callInput.autofocus = true;
  callInput.setAttribute('list', 'worked-calls');
  callInput.className = 'log-call-input';
  entryRow.appendChild(callInput);

  const callsDatalist = document.createElement('datalist');
  callsDatalist.id = 'worked-calls';
  form.appendChild(callsDatalist);

  const classInput = document.createElement('input');
  classInput.placeholder = 'Class (e.g. 3A)';
  entryRow.appendChild(classInput);

  const sectionContainer = document.createElement('div');
  entryRow.appendChild(sectionContainer);
  const sectionSelect = mountSectionSelect(sectionContainer, { onChange: runDupeCheck });

  const logBtn = document.createElement('button');
  logBtn.type = 'submit';
  logBtn.textContent = 'Log';
  entryRow.appendChild(logBtn);

  form.appendChild(entryRow);

  const satFields = document.createElement('div');
  satFields.className = 'sat-fields hidden';
  const satNameInput = document.createElement('input');
  satNameInput.placeholder = 'Satellite name';
  satFields.appendChild(satNameInput);
  const satFmLabel = document.createElement('label');
  const satFmCheckbox = document.createElement('input');
  satFmCheckbox.type = 'checkbox';
  satFmLabel.appendChild(satFmCheckbox);
  satFmLabel.append(' Single-channel FM (one QSO limit)');
  satFields.appendChild(satFmLabel);
  form.appendChild(satFields);

  const dupeStatus = document.createElement('div');
  dupeStatus.className = 'dupe-status';
  form.appendChild(dupeStatus);

  const logLayout = document.createElement('div');
  logLayout.className = 'log-layout';
  logLayout.appendChild(form);
  const mapContainer = document.createElement('div');
  mapContainer.className = 'log-layout-map';
  logLayout.appendChild(mapContainer);
  root.appendChild(logLayout);
  const sectionMap = mountSectionMap(mapContainer);

  const sessionCount = document.createElement('p');
  sessionCount.className = 'session-count';
  root.appendChild(sessionCount);

  const yourRecentTitle = document.createElement('h2');
  yourRecentTitle.textContent = 'Your recent QSOs';
  root.appendChild(yourRecentTitle);
  const yourRecentTable = document.createElement('table');
  yourRecentTable.className = 'qso-table';
  const yourRecentHead = document.createElement('thead');
  yourRecentHead.innerHTML =
    '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Class</th><th>Section</th><th></th><th></th></tr>';
  yourRecentTable.appendChild(yourRecentHead);
  const yourRecent = document.createElement('tbody');
  yourRecentTable.appendChild(yourRecent);
  root.appendChild(yourRecentTable);

  const tickerTitle = document.createElement('h2');
  tickerTitle.textContent = 'Club-wide activity';
  root.appendChild(tickerTitle);
  const ticker = document.createElement('ul');
  ticker.className = 'ticker';
  root.appendChild(ticker);

  container.appendChild(root);

  els = {
    identityBar,
    contextRow,
    contextSelect: null,
    contextLabel,
    callInput,
    classInput,
    sectionSelect,
    satFields,
    satNameInput,
    satFmCheckbox,
    dupeStatus,
    logBtn,
    ticker,
    yourRecent,
    sessionCount,
    callsDatalist,
    sectionMap,
  };

  lastReservationKeys = '\0force-rebuild'; // sentinel so the first updateDynamic() always (re)builds

  callInput.addEventListener('input', runDupeCheck);
  satNameInput.addEventListener('input', runDupeCheck);
  satFmCheckbox.addEventListener('change', runDupeCheck);

  // Class validation is a soft warning, not a hard block on submit -- the
  // server's INVALID_CLASS reject remains final authority (surfaced via the
  // onQsoAddOutcome listener below). This just gives live visual feedback.
  classInput.addEventListener('input', () => {
    const value = classInput.value.trim();
    classInput.classList.toggle('invalid', value !== '' && !isValidClass(value));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQso();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      callInput.value = '';
      classInput.value = '';
      classInput.classList.remove('invalid');
      sectionSelect.setValue('');
      satNameInput.value = '';
      satFmCheckbox.checked = false;
      runDupeCheck();
    }
  });

  unsubscribeOutcomes = onQsoAddOutcome(({ clientId, ok, ...rest }) => {
    pending.delete(clientId);
    if (!ok && els) {
      els.dupeStatus.textContent = `Rejected by server: ${(rest as { reason: string }).reason}`;
      els.dupeStatus.className = 'dupe-status dupe-blocked';
    }
    renderTicker();
  });
}

function myReservations(): Reservation[] {
  const state = store.get();
  if (!state.you) return [];
  return [...state.data.reservations.values()].filter((r) => r.operatorCall === state.you!.call);
}

function buildContextSelector(contextRow: HTMLElement): void {
  if (!els) return;
  contextRow.innerHTML = '';
  const reservations = myReservations();

  if (reservations.length === 0) {
    els.contextLabel.textContent = 'You have no reserved band/mode slot. ';
    const link = document.createElement('a');
    link.href = '#/grid';
    link.textContent = 'Go claim one on the grid.';
    els.contextLabel.appendChild(link);
    els.contextSelect = null;
    return;
  }

  els.contextLabel.textContent = '';

  if (reservations.length === 1) {
    els.contextSelect = null;
  } else {
    const select = document.createElement('select');
    for (const r of reservations) {
      const opt = document.createElement('option');
      opt.value = contextKey(r);
      opt.textContent = `${r.station} ${r.band} ${r.mode}`;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      toggleSatFields();
      runDupeCheck();
      updateIdentityBar();
    });
    contextRow.appendChild(select);
    els.contextSelect = select;
  }

  toggleSatFields();
}

function getContext(): Context | null {
  const reservations = myReservations();
  if (reservations.length === 0) return null;
  if (els?.contextSelect) return parseContextKey(els.contextSelect.value);
  const r = reservations[0]!;
  return { station: r.station, band: r.band, mode: r.mode };
}

function toggleSatFields(): void {
  if (!els) return;
  const ctx = getContext();
  els.satFields.classList.toggle('hidden', ctx?.band !== 'SAT');
}

function updateIdentityBar(): void {
  if (!els) return;
  const state = store.get();
  const identity = buildIdentity(state.data.config, getContext());

  els.identityBar.innerHTML = '';
  const parts = [identity.callsign || '—', identity.entryClass || '—', identity.section || '—', identity.bandMode ?? '—'];
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part;
    els.identityBar.appendChild(span);
  }
  if (identity.isGota) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-gota';
    badge.textContent = 'GOTA';
    els.identityBar.appendChild(badge);
  }
}

function runDupeCheck(): void {
  if (!els) return;
  const ctx = getContext();
  const call = els.callInput.value.trim();
  if (!ctx || !call) {
    els.dupeStatus.textContent = '';
    els.dupeStatus.className = 'dupe-status';
    els.logBtn.textContent = 'Log';
    return;
  }

  const state = store.get();
  const config = state.data.config;
  const result = checkDupe(
    {
      call,
      band: ctx.band,
      mode: ctx.mode,
      station: ctx.station,
      satelliteName: els.satNameInput.value.trim() || undefined,
      satelliteSingleChannelFm: els.satFmCheckbox.checked,
    },
    [...state.data.qsos.values()],
    { clubCall: config?.clubCall ?? '', gotaCall: config?.gotaCall },
  );
  const ui = describeDupe(result);
  els.dupeStatus.textContent = ui.label + (ui.workedElsewhereText ? ` -- ${ui.workedElsewhereText}` : '');
  els.dupeStatus.className = `dupe-status ${ui.className}`;
  els.logBtn.disabled = ui.blockedHard;
  els.logBtn.textContent = ui.requiresOverride ? 'Confirm & Log (DUPE)' : 'Log';
  els.logBtn.dataset.override = ui.requiresOverride ? '1' : '';
}

function submitQso(): void {
  if (!els) return;
  const state = store.get();
  const ctx = getContext();
  if (!ctx || !state.you) return;

  const call = els.callInput.value.trim();
  const exchClass = els.classInput.value.trim().toUpperCase();
  const exchSection = els.sectionSelect.getValue().trim().toUpperCase();
  if (!call) return;
  if (!isValidSectionCode(exchSection)) {
    els.dupeStatus.textContent = 'Invalid section code';
    els.dupeStatus.className = 'dupe-status dupe-blocked';
    return;
  }

  const override = els.logBtn.dataset.override === '1';
  const clientId = generateId();
  const satelliteName = ctx.band === 'SAT' ? els.satNameInput.value.trim() || undefined : undefined;
  const satelliteSingleChannelFm = ctx.band === 'SAT' ? els.satFmCheckbox.checked : undefined;

  // If we're offline right now, this QSO will sit in the outbox until
  // reconnect -- flag it queued with our own timestamp so the server uses
  // the time it actually happened rather than stamping arrival time later.
  const offline = state.connection !== 'connected';
  const clientTs = new Date().toISOString();

  const optimistic: Qso = {
    id: `pending:${clientId}`,
    ts: clientTs,
    station: ctx.station,
    band: ctx.band,
    mode: ctx.mode,
    call,
    exchClass,
    exchSection,
    operatorCall: state.you.call,
    satelliteName,
    satelliteSingleChannelFm,
    queued: offline,
  };
  pending.set(clientId, optimistic);

  send({
    type: 'qso:add',
    clientId,
    qso: { station: ctx.station, band: ctx.band, mode: ctx.mode, call, exchClass, exchSection, satelliteName, satelliteSingleChannelFm },
    override,
    queued: offline,
    clientTs,
  });

  els.callInput.value = '';
  els.classInput.value = '';
  els.classInput.classList.remove('invalid');
  els.sectionSelect.setValue('');
  els.satNameInput.value = '';
  els.satFmCheckbox.checked = false;
  els.callInput.focus();
  runDupeCheck();
  renderTicker();
}

function updateDynamic(): void {
  if (!els) return;
  const state = store.get();

  fillDatalist(els.callsDatalist, workedCallOptions(state.data.qsos.values()));

  const keys = myReservations().map(contextKey).sort().join(',');
  if (keys !== lastReservationKeys) {
    lastReservationKeys = keys;
    buildContextSelector(els.contextRow);
  }

  updateIdentityBar();

  const you = state.you;
  const yourCount = you ? [...state.data.qsos.values()].filter((q) => !q.deleted && q.operatorCall === you.call).length : 0;
  els.sessionCount.textContent = `Your QSO count: ${yourCount}`;

  renderYourRecent();
  renderTicker();
  els.sectionMap.update();
}

function renderYourRecent(): void {
  if (!els) return;
  const state = store.get();
  const you = state.you;
  els.yourRecent.innerHTML = '';
  if (!you) return;

  const mine = sortNewestFirst([...state.data.qsos.values()].filter((q) => !q.deleted && q.operatorCall === you.call)).slice(0, 5);

  for (const q of mine) {
    const row = toQsoRow(q, you.call);
    els.yourRecent.appendChild(editingId === q.id ? buildEditRow(q) : buildDisplayRow(row));
  }
}

function buildDisplayRow(row: ReturnType<typeof toQsoRow>): HTMLTableRowElement {
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

  for (const value of [row.utc, row.band, row.exchClass, row.exchSection]) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.appendChild(td);
  }

  const editTd = document.createElement('td');
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    editingId = row.id;
    renderYourRecent();
  });
  editTd.appendChild(editBtn);
  tr.appendChild(editTd);

  const delTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => {
    if (window.confirm(`Delete QSO with ${row.call}?`)) send({ type: 'qso:delete', id: row.id });
  });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

function buildEditRow(q: Qso): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'qso-edit-row';

  const callInput = document.createElement('input');
  callInput.value = q.call;
  const callTd = document.createElement('td');
  callTd.appendChild(callInput);
  tr.appendChild(callTd);

  const utcTd = document.createElement('td');
  utcTd.textContent = toQsoRow(q, null).utc;
  tr.appendChild(utcTd);

  const bandSelect = document.createElement('select');
  for (const band of BANDS) {
    const opt = document.createElement('option');
    opt.value = band.id;
    opt.textContent = band.label;
    if (band.id === q.band) opt.selected = true;
    bandSelect.appendChild(opt);
  }
  const bandTd = document.createElement('td');
  bandTd.appendChild(bandSelect);
  tr.appendChild(bandTd);

  const classInput = document.createElement('input');
  classInput.value = q.exchClass;
  const classTd = document.createElement('td');
  classTd.appendChild(classInput);
  tr.appendChild(classTd);

  const sectionInput = document.createElement('input');
  sectionInput.value = q.exchSection;
  const sectionTd = document.createElement('td');
  sectionTd.appendChild(sectionInput);
  tr.appendChild(sectionTd);

  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    send({
      type: 'qso:edit',
      id: q.id,
      patch: {
        call: callInput.value.trim().toUpperCase(),
        band: bandSelect.value,
        exchClass: classInput.value.trim().toUpperCase(),
        exchSection: sectionInput.value.trim().toUpperCase(),
      },
    });
    editingId = null;
    renderYourRecent();
  });
  saveTd.appendChild(saveBtn);
  tr.appendChild(saveTd);

  const cancelTd = document.createElement('td');
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    editingId = null;
    renderYourRecent();
  });
  cancelTd.appendChild(cancelBtn);
  tr.appendChild(cancelTd);

  return tr;
}

function renderTicker(): void {
  if (!els) return;
  const state = store.get();
  const confirmed = [...state.data.qsos.values()].filter((q) => !q.deleted);
  const combined = [...confirmed, ...pending.values()].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 10);

  els.ticker.innerHTML = '';
  for (const q of combined) {
    const li = document.createElement('li');
    const isPending = q.id.startsWith('pending:');
    const suffix = isPending ? (q.queued ? ' (queued -- offline)' : ' (sending...)') : '';
    li.textContent = `${q.call} -- ${q.band}/${q.mode} (${q.station}) by ${q.operatorCall}${suffix}`;
    if (isPending) li.className = 'ticker-pending';
    els.ticker.appendChild(li);
  }
}
