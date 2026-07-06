import { BONUS_CATALOG } from '../../shared/bonuses.ts';
import { isClassEligible } from '../../shared/bonuses.ts';
import { SECTIONS } from '../../shared/sections.ts';
import type { BonusClaim, ClubConfig } from '../../shared/types.ts';
import { fillDatalist } from '../autocomplete.ts';
import { isHostMode } from '../host-mode.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

interface ConfigEls {
  clubName: HTMLInputElement;
  clubCall: HTMLInputElement;
  gotaCall: HTMLInputElement;
  entryClass: HTMLInputElement;
  section: HTMLInputElement;
  powerMult: HTMLSelectElement;
  eventStartUtc: HTMLInputElement;
  eventEndUtc: HTMLInputElement;
  location: HTMLInputElement;
  participantCount: HTMLInputElement;
}

let configEls: ConfigEls | null = null;
let checklistRoot: HTMLElement | null = null;
let lastBonusesSnapshot = '';

export function render(container: HTMLElement): void {
  if (container.dataset.screen !== 'host-setup' || !configEls) {
    build(container);
  }
  refreshChecklistIfChanged();
}

function build(container: HTMLElement): void {
  container.innerHTML = '';
  container.dataset.screen = 'host-setup';
  configEls = null;
  checklistRoot = null;
  lastBonusesSnapshot = '';

  const root = document.createElement('div');
  root.className = 'screen host-setup-screen';

  const title = document.createElement('h1');
  title.textContent = 'Host Setup';
  root.appendChild(title);

  const host = isHostMode();
  if (!host) {
    const notice = document.createElement('p');
    notice.className = 'dashboard-warning';
    notice.textContent = 'Read-only -- host setup can only be edited from the host machine (or with ?host=1).';
    root.appendChild(notice);
  }

  const config = store.get().data.config;

  const form = document.createElement('form');
  form.className = 'host-setup-form';

  const clubName = labeledInput(form, 'Club Name', config?.clubName ?? '', !host);
  const clubCall = labeledInput(form, 'Club Call', config?.clubCall ?? '', !host);
  const gotaCall = labeledInput(form, 'GOTA Call (optional)', config?.gotaCall ?? '', !host);
  const entryClass = labeledInput(form, 'Entry Class (e.g. 3A)', config?.entryClass ?? '', !host);
  const section = labeledInput(form, 'Section', config?.section ?? '', !host);
  const sectionsDatalist = document.createElement('datalist');
  sectionsDatalist.id = 'setup-sections-list';
  fillDatalist(sectionsDatalist, SECTIONS.map((s) => s.code));
  section.setAttribute('list', sectionsDatalist.id);
  form.appendChild(sectionsDatalist);

  const powerMult = document.createElement('select');
  powerMult.disabled = !host;
  for (const [value, label] of [
    ['1', 'x1 (>100W)'],
    ['2', 'x2 (<=100W or QRP on generator/mains)'],
    ['5', 'x5 (QRP battery)'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    powerMult.appendChild(opt);
  }
  powerMult.value = String(config?.powerMult ?? 1);
  wrapLabeled(form, 'Power Multiplier', powerMult);

  const eventStartUtc = labeledInput(form, 'Event Start (UTC ISO)', config?.eventStartUtc ?? '', !host);
  const eventEndUtc = labeledInput(form, 'Event End (UTC ISO)', config?.eventEndUtc ?? '', !host);
  const location = labeledInput(form, 'Location (optional)', config?.location ?? '', !host);
  const participantCount = labeledInput(form, 'Participant Count (optional)', config?.participantCount?.toString() ?? '', !host);

  if (host) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save Config';
    form.appendChild(saveBtn);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newConfig: ClubConfig = {
      clubName: clubName.value.trim(),
      clubCall: clubCall.value.trim().toUpperCase(),
      gotaCall: gotaCall.value.trim().toUpperCase() || undefined,
      entryClass: entryClass.value.trim().toUpperCase(),
      section: section.value.trim().toUpperCase(),
      powerMult: Number(powerMult.value) as 1 | 2 | 5,
      eventStartUtc: eventStartUtc.value.trim(),
      eventEndUtc: eventEndUtc.value.trim(),
      location: location.value.trim() || undefined,
      participantCount: participantCount.value.trim() ? Number(participantCount.value.trim()) : undefined,
    };
    send({ type: 'config:set', config: newConfig });
  });

  root.appendChild(form);

  const checklistTitle = document.createElement('h2');
  checklistTitle.textContent = 'Bonus Checklist';
  root.appendChild(checklistTitle);

  checklistRoot = document.createElement('div');
  checklistRoot.className = 'bonus-checklist';
  root.appendChild(checklistRoot);

  container.appendChild(root);

  configEls = {
    clubName,
    clubCall,
    gotaCall,
    entryClass,
    section,
    powerMult,
    eventStartUtc,
    eventEndUtc,
    location,
    participantCount,
  };
}

function labeledInput(form: HTMLElement, label: string, value: string, disabled: boolean): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  input.disabled = disabled;
  wrapLabeled(form, label, input);
  return input;
}

function wrapLabeled(form: HTMLElement, label: string, control: HTMLElement): void {
  const wrapper = document.createElement('label');
  wrapper.className = 'field-label';
  const span = document.createElement('span');
  span.textContent = label;
  wrapper.append(span, control);
  form.appendChild(wrapper);
}

function refreshChecklistIfChanged(): void {
  if (!checklistRoot) return;
  const state = store.get();
  const snapshot = JSON.stringify([...state.data.bonuses.entries()]) + '|' + (state.data.config?.entryClass ?? '');
  if (snapshot === lastBonusesSnapshot) return;
  lastBonusesSnapshot = snapshot;

  const config = state.data.config;
  checklistRoot.innerHTML = '';
  if (!config) {
    const msg = document.createElement('p');
    msg.textContent = 'Set the entry class above and save before claiming bonuses.';
    checklistRoot.appendChild(msg);
    return;
  }

  const host = isHostMode();
  const coachedCount = [...state.data.qsos.values()].filter((q) => !q.deleted && q.station === 'GOTA' && q.gotaCoached).length;

  for (const def of BONUS_CATALOG) {
    if (!isClassEligible(def, config.entryClass)) continue;
    const claim = state.data.bonuses.get(def.id);

    const row = document.createElement('div');
    row.className = 'bonus-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!claim?.claimed;
    checkbox.disabled = !host;
    checkbox.addEventListener('change', () => {
      const newClaim: BonusClaim = { ...claim, claimed: checkbox.checked };
      send({ type: 'bonus:set', bonusId: def.id, claim: newClaim });
    });

    const label = document.createElement('label');
    label.append(checkbox, ` ${def.name} (${def.points} pt${def.points === 1 ? '' : 's'}, ${def.ruleRef})`);
    row.appendChild(label);

    if (def.scaling === 'per-transmitter' || def.scaling === 'per-message') {
      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '0';
      countInput.disabled = !host;
      countInput.value = String((def.scaling === 'per-transmitter' ? claim?.transmitterCount : claim?.messageCount) ?? 0);
      countInput.addEventListener('change', () => {
        const count = Number(countInput.value) || 0;
        const newClaim: BonusClaim = {
          ...claim,
          claimed: !!claim?.claimed,
          ...(def.scaling === 'per-transmitter' ? { transmitterCount: count } : { messageCount: count }),
        };
        send({ type: 'bonus:set', bonusId: def.id, claim: newClaim });
      });
      row.appendChild(countInput);
    }

    if (def.requiresGotaCoachCount !== undefined) {
      const note = document.createElement('span');
      note.className = 'bonus-note';
      note.textContent = ` requires >=${def.requiresGotaCoachCount} coached contacts (currently ${coachedCount})`;
      row.appendChild(note);
    }

    checklistRoot.appendChild(row);
  }
}
