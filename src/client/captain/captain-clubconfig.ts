import type { ClubConfig, StationParkAssignment } from '../../shared/types.ts';
import { isValidParkList, splitParkList } from '../../shared/validate.ts';
import { loadParks, lookupPark } from '../parks.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

interface StationRow {
  wrapper: HTMLElement;
  stationInput: HTMLInputElement;
  parkInput: HTMLInputElement;
  parkNameInput: HTMLInputElement;
  stateInput: HTMLInputElement;
}

// Always editable -- unlike the old host-mode gating, reaching this screen
// at all already required a signed-in Captain session (conn.isAdmin, gated
// server-side on config:set regardless of what this form does client-side).
export function mountCaptainClubConfig(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-clubconfig-screen';

  const title = document.createElement('h1');
  title.textContent = 'Club Setup';
  root.appendChild(title);

  const config = store.get().data.config;

  const form = document.createElement('form');
  form.className = 'host-setup-form';

  const clubName = labeledInput(form, 'Club Name', config?.clubName ?? '');
  const clubCall = labeledInput(form, 'Club Call', config?.clubCall ?? '');
  const eventStartUtc = labeledInput(form, 'Activation Start (UTC ISO, optional)', config?.eventStartUtc ?? '');
  const eventEndUtc = labeledInput(form, 'Activation End (UTC ISO, optional)', config?.eventEndUtc ?? '');
  const location = labeledInput(form, 'Location (optional)', config?.location ?? '');

  const stationsTitle = document.createElement('h2');
  stationsTitle.textContent = 'Stations';
  form.appendChild(stationsTitle);

  const stationsHint = document.createElement('p');
  stationsHint.textContent =
    'One row per radio/station (e.g. "R01"). Each gets its own band/mode grid and its own park assignment ' +
    "(guide section 4.1's /R01, /R02 convention for multi-station or multi-park activations). " +
    'If a station is simultaneously activating more than one overlapping park, list all of them ' +
    'comma-separated (e.g. "K-1234, K-5678").';
  form.appendChild(stationsHint);

  const stationsList = document.createElement('div');
  stationsList.className = 'captain-stations-list';
  form.appendChild(stationsList);

  const rows: StationRow[] = [];

  function addRow(stationId: string, assignment?: StationParkAssignment): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'captain-station-row';

    const stationInput = document.createElement('input');
    stationInput.placeholder = 'Station (e.g. R01)';
    stationInput.value = stationId;
    wrapper.appendChild(stationInput);

    const parkInput = document.createElement('input');
    parkInput.placeholder = 'Park Number(s), comma-separated';
    parkInput.value = assignment?.parkNumber ?? '';
    wrapper.appendChild(parkInput);

    // Confirms the entered park number(s) are recognized (once the park
    // database has been synced -- see the Parks tab), catching typos before
    // save rather than only at export time.
    const parkResolved = document.createElement('span');
    parkResolved.className = 'captain-park-resolved';
    wrapper.appendChild(parkResolved);

    const updateResolved = () => {
      const segments = splitParkList(parkInput.value);
      if (segments.length === 0) {
        parkResolved.textContent = '';
        return;
      }
      parkResolved.textContent = segments
        .map((ref) => {
          const record = lookupPark(ref);
          return record ? `${ref}: ${record.name}${record.state ? `, ${record.state}` : ''}` : `${ref}: unknown park`;
        })
        .join(' · ');
    };
    parkInput.addEventListener('input', updateResolved);
    loadParks().then(updateResolved);

    const parkNameInput = document.createElement('input');
    parkNameInput.placeholder = 'Park Name (optional)';
    parkNameInput.value = assignment?.parkName ?? '';
    wrapper.appendChild(parkNameInput);

    const stateInput = document.createElement('input');
    stateInput.placeholder = 'State (optional)';
    stateInput.value = assignment?.state ?? '';
    wrapper.appendChild(stateInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const idx = rows.findIndex((r) => r.wrapper === wrapper);
      if (idx >= 0) rows.splice(idx, 1);
      wrapper.remove();
    });
    wrapper.appendChild(removeBtn);

    stationsList.appendChild(wrapper);
    rows.push({ wrapper, stationInput, parkInput, parkNameInput, stateInput });
  }

  if (config && config.stations.length > 0) {
    for (const stationId of config.stations) addRow(stationId, config.stationParks[stationId]);
  } else {
    addRow('R01');
  }

  const addRowBtn = document.createElement('button');
  addRowBtn.type = 'button';
  addRowBtn.textContent = '+ Add Station';
  addRowBtn.addEventListener('click', () => addRow(''));
  form.appendChild(addRowBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save Config';
  form.appendChild(saveBtn);

  const error = document.createElement('span');
  error.className = 'dupe-status dupe-blocked hidden';
  form.appendChild(error);

  const savedNotice = document.createElement('span');
  savedNotice.className = 'captain-save-notice hidden';
  savedNotice.textContent = 'Saved.';
  form.appendChild(savedNotice);

  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.classList.add('hidden');

    const stations: string[] = [];
    const stationParks: Record<string, StationParkAssignment> = {};

    for (const row of rows) {
      const stationId = row.stationInput.value.trim().toUpperCase();
      const parkNumberRaw = row.parkInput.value.trim().toUpperCase();
      if (!stationId || !parkNumberRaw) continue;
      if (!isValidParkList(parkNumberRaw)) {
        error.textContent = `Invalid park number(s) for station ${stationId}: ${parkNumberRaw}`;
        error.classList.remove('hidden');
        return;
      }
      stations.push(stationId);
      stationParks[stationId] = {
        parkNumber: splitParkList(parkNumberRaw).join(','),
        parkName: row.parkNameInput.value.trim() || undefined,
        state: row.stateInput.value.trim().toUpperCase() || undefined,
      };
    }

    if (stations.length === 0) {
      error.textContent = 'At least one station with a park number is required.';
      error.classList.remove('hidden');
      return;
    }

    const newConfig: ClubConfig = {
      clubName: clubName.value.trim(),
      clubCall: clubCall.value.trim().toUpperCase(),
      stations,
      stationParks,
      eventStartUtc: eventStartUtc.value.trim(),
      eventEndUtc: eventEndUtc.value.trim(),
      location: location.value.trim() || undefined,
    };
    send({ type: 'config:set', config: newConfig });
    savedNotice.classList.remove('hidden');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => savedNotice.classList.add('hidden'), 2000);
  });

  root.appendChild(form);
  container.appendChild(root);

  return () => {
    if (noticeTimer) clearTimeout(noticeTimer);
  };
}

function labeledInput(form: HTMLElement, label: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
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
