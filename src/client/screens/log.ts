import { BANDS } from '../../shared/bands.ts';
import { checkDupe, utcDateOf } from '../../shared/dupe.ts';
import { generateId } from '../../shared/id.ts';
import { defaultRst, MODES } from '../../shared/modes.ts';
import type { Mode, Qso, Reservation, StationKind } from '../../shared/types.ts';
import { isValidParkList, splitParkList } from '../../shared/validate.ts';
import { fillDatalist } from '../autocomplete.ts';
import { describeDupe } from '../dupe-live.ts';
import { buildIdentity } from '../log-model.ts';
import { mountParkResolvedBubble } from '../park-bubble.ts';
import { loadParks, parkOptionLabel, parkReferences } from '../parks.ts';
import { mountParkToPark, type ParkToParkHandle } from '../park-to-park.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
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
  rstSentInput: HTMLInputElement;
  rstRcvdInput: HTMLInputElement;
  theirStateInput: HTMLInputElement;
  theirParkInput: HTMLInputElement;
  dupeStatus: HTMLElement;
  logBtn: HTMLButtonElement;
  yourRecent: HTMLElement;
  sessionCount: HTMLElement;
  parkToPark: ParkToParkHandle;
}

let els: Els | null = null;
let unsubscribeOutcomes: (() => void) | null = null;
let lastReservationKeys = '';
let editingId: string | null = null;

function contextKey(r: Pick<Reservation, 'station' | 'band' | 'mode'>): string {
  return `${r.station}|${r.band}|${r.mode}`;
}

function parseContextKey(key: string): Context {
  const [station, band, mode] = key.split('|');
  return { station: station!, band: band!, mode: mode! };
}

// Wraps an input with a small visible label above it -- unlike a bare
// placeholder, the label stays put once the field has a value in it, which
// matters for fast tab-through entry where several fields fill up at once.
function labeledField(label: string, input: HTMLInputElement, extraClass?: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = extraClass ? `log-field ${extraClass}` : 'log-field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  wrapper.append(labelEl, input);
  return wrapper;
}

export function render(container: HTMLElement, isNewMount: boolean): void {
  if (isNewMount || !els) {
    buildForm(container);
  }
  updateDynamic();
}

function buildForm(container: HTMLElement): void {
  container.innerHTML = '';
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
  callInput.placeholder = 'Call Sign';
  callInput.autofocus = true;
  callInput.autocomplete = 'off';
  callInput.className = 'log-call-input';
  entryRow.appendChild(labeledField('Call', callInput, 'log-field-call'));

  const rstSentInput = document.createElement('input');
  rstSentInput.className = 'log-rst-input';
  entryRow.appendChild(labeledField('RST Sent', rstSentInput));

  const rstRcvdInput = document.createElement('input');
  rstRcvdInput.className = 'log-rst-input';
  entryRow.appendChild(labeledField('RST Rcvd', rstRcvdInput));

  const theirStateInput = document.createElement('input');
  theirStateInput.placeholder = 'optional';
  theirStateInput.className = 'log-state-input';
  entryRow.appendChild(labeledField('Their State', theirStateInput));

  const theirParkInput = document.createElement('input');
  theirParkInput.placeholder = 'P2P, optional (comma-separated if multi-park)';
  theirParkInput.className = 'log-park-input';
  const parkDatalist = document.createElement('datalist');
  parkDatalist.id = 'log-their-park-list';
  theirParkInput.setAttribute('list', parkDatalist.id);
  const theirParkField = labeledField('Their Park', theirParkInput, 'log-field-park');
  theirParkField.appendChild(mountParkResolvedBubble(theirParkInput));
  entryRow.appendChild(theirParkField);
  loadParks().then(() => fillDatalist(parkDatalist, parkReferences(), parkOptionLabel));

  const logBtn = document.createElement('button');
  logBtn.type = 'submit';
  logBtn.textContent = 'Log';
  entryRow.appendChild(logBtn);

  form.appendChild(entryRow);
  form.appendChild(parkDatalist);

  const dupeStatus = document.createElement('div');
  dupeStatus.className = 'dupe-status';
  form.appendChild(dupeStatus);

  root.appendChild(form);

  const p2pContainer = document.createElement('div');
  p2pContainer.className = 'log-p2p-container';
  root.appendChild(p2pContainer);
  const parkToPark = mountParkToPark(p2pContainer);

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
    '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Mode</th><th>RST Sent</th><th>RST Rcvd</th><th>Their State</th><th>Their Park</th><th></th><th></th></tr>';
  yourRecentTable.appendChild(yourRecentHead);
  const yourRecent = document.createElement('tbody');
  yourRecentTable.appendChild(yourRecent);
  root.appendChild(yourRecentTable);

  container.appendChild(root);

  els = {
    identityBar,
    contextRow,
    contextSelect: null,
    contextLabel,
    callInput,
    rstSentInput,
    rstRcvdInput,
    theirStateInput,
    theirParkInput,
    dupeStatus,
    logBtn,
    yourRecent,
    sessionCount,
    parkToPark,
  };

  lastReservationKeys = '\0force-rebuild'; // sentinel so the first updateDynamic() always (re)builds

  callInput.addEventListener('input', runDupeCheck);
  theirParkInput.addEventListener('input', () => {
    const value = theirParkInput.value.trim();
    theirParkInput.classList.toggle('invalid', value !== '' && !isValidParkList(value));
    runDupeCheck();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQso();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      callInput.value = '';
      theirStateInput.value = '';
      theirParkInput.value = '';
      theirParkInput.classList.remove('invalid');
      resetRstDefaults();
      runDupeCheck();
    }
  });

  unsubscribeOutcomes = onQsoAddOutcome(({ ok, ...rest }) => {
    if (!ok && els) {
      els.dupeStatus.textContent = `Rejected by server: ${(rest as { reason: string }).reason}`;
      els.dupeStatus.className = 'dupe-status dupe-blocked';
    }
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
      resetRstDefaults();
      runDupeCheck();
      updateIdentityBar();
    });
    contextRow.appendChild(select);
    els.contextSelect = select;
  }

  resetRstDefaults();
}

function getContext(): Context | null {
  const reservations = myReservations();
  if (reservations.length === 0) return null;
  if (els?.contextSelect) return parseContextKey(els.contextSelect.value);
  const r = reservations[0]!;
  return { station: r.station, band: r.band, mode: r.mode };
}

function resetRstDefaults(): void {
  if (!els) return;
  const ctx = getContext();
  if (!ctx) return;
  els.rstSentInput.value = defaultRst(ctx.mode);
  els.rstRcvdInput.value = defaultRst(ctx.mode);
}

function updateIdentityBar(): void {
  if (!els) return;
  const state = store.get();
  const identity = buildIdentity(state.data.config, getContext());

  els.identityBar.innerHTML = '';
  const parts = [identity.callsign || '—', identity.station || '—', identity.park || '—', identity.bandMode ?? '—'];
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part;
    els.identityBar.appendChild(span);
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
  const theirParkRaw = els.theirParkInput.value.trim();
  const parks = splitParkList(theirParkRaw);
  const dateUtc = utcDateOf(new Date().toISOString());
  const qsos = [...state.data.qsos.values()];
  const clubCall = config?.clubCall ?? '';

  // A multi-park hunter is one radio contact, logged as one QSO per park
  // (matches the club-wide dupe key, which is scoped per park) -- preview
  // the worst status across all of them so a BLOCKED/DUPE on any single
  // park still stops the whole submission before it happens.
  const results = (parks.length > 0 ? parks : [undefined]).map((theirPark) =>
    checkDupe({ call, band: ctx.band, mode: ctx.mode, theirPark, dateUtc }, qsos, { clubCall }),
  );
  const worst =
    results.find((r) => r.status === 'BLOCKED_SELF') ?? results.find((r) => r.status === 'DUPE') ?? results[0]!;
  const ui = describeDupe(worst);
  const suffix = parks.length > 1 ? ` (${parks.length} parks)` : '';
  els.dupeStatus.textContent = ui.label + suffix + (ui.workedElsewhereText ? ` -- ${ui.workedElsewhereText}` : '');
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
  if (!call) return;

  const theirParkRaw = els.theirParkInput.value.trim();
  if (theirParkRaw && !isValidParkList(theirParkRaw)) {
    els.dupeStatus.textContent = 'Invalid park number';
    els.dupeStatus.className = 'dupe-status dupe-blocked';
    return;
  }

  const override = els.logBtn.dataset.override === '1';
  const rstSent = els.rstSentInput.value.trim() || defaultRst(ctx.mode);
  const rstRcvd = els.rstRcvdInput.value.trim() || defaultRst(ctx.mode);
  const theirState = els.theirStateInput.value.trim().toUpperCase() || undefined;
  const parks = splitParkList(theirParkRaw);

  // If we're offline right now, this QSO will sit in the outbox until
  // reconnect -- flag it queued with our own timestamp so the server uses
  // the time it actually happened rather than stamping arrival time later.
  const offline = state.connection !== 'connected';
  const clientTs = new Date().toISOString();

  // A hunter simultaneously activating more than one overlapping park is
  // still one radio contact, but each park earns its own park-to-park
  // credit -- log one QSO per park (matches the club-wide dupe key, which
  // is scoped per park) rather than jamming them into a single record.
  for (const theirPark of parks.length > 0 ? parks : [undefined]) {
    send({
      type: 'qso:add',
      clientId: generateId(),
      qso: { station: ctx.station, band: ctx.band, mode: ctx.mode, call, rstSent, rstRcvd, theirPark, theirState },
      override,
      queued: offline,
      clientTs,
    });
  }

  els.callInput.value = '';
  els.theirStateInput.value = '';
  els.theirParkInput.value = '';
  els.theirParkInput.classList.remove('invalid');
  resetRstDefaults();
  els.callInput.focus();
  runDupeCheck();
}

function updateDynamic(): void {
  if (!els) return;
  const state = store.get();

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
  els.parkToPark.update();
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

  for (const value of [row.utc, row.band, row.mode, row.rstSent, row.rstRcvd, row.theirState ?? '', row.theirPark ?? '']) {
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

  const modeSelect = document.createElement('select');
  for (const mode of MODES) {
    const opt = document.createElement('option');
    opt.value = mode.id;
    opt.textContent = mode.label;
    if (mode.id === q.mode) opt.selected = true;
    modeSelect.appendChild(opt);
  }
  const modeTd = document.createElement('td');
  modeTd.appendChild(modeSelect);
  tr.appendChild(modeTd);

  const rstSentInput = document.createElement('input');
  rstSentInput.value = q.rstSent;
  const rstSentTd = document.createElement('td');
  rstSentTd.appendChild(rstSentInput);
  tr.appendChild(rstSentTd);

  const rstRcvdInput = document.createElement('input');
  rstRcvdInput.value = q.rstRcvd;
  const rstRcvdTd = document.createElement('td');
  rstRcvdTd.appendChild(rstRcvdInput);
  tr.appendChild(rstRcvdTd);

  const theirStateInput = document.createElement('input');
  theirStateInput.value = q.theirState ?? '';
  const theirStateTd = document.createElement('td');
  theirStateTd.appendChild(theirStateInput);
  tr.appendChild(theirStateTd);

  const theirParkInput = document.createElement('input');
  theirParkInput.value = q.theirPark ?? '';
  const theirParkTd = document.createElement('td');
  theirParkTd.appendChild(theirParkInput);
  tr.appendChild(theirParkTd);

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
        mode: modeSelect.value,
        rstSent: rstSentInput.value.trim(),
        rstRcvd: rstRcvdInput.value.trim(),
        theirState: theirStateInput.value.trim().toUpperCase() || undefined,
        theirPark: theirParkInput.value.trim().toUpperCase() || undefined,
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
