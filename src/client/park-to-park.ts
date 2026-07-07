import { readBoolPref, writeBoolPref } from './prefs.ts';
import { sortNewestFirst } from './qso-list-model.ts';
import { store } from './store.ts';

const EXPANDED_PREF_KEY = 'ppp-park-to-park-expanded';
const MAX_ROWS = 25;

export interface ParkToParkHandle {
  update(): void;
}

// Live feed of park-to-park contacts, replacing the old ARRL section map --
// there's no offline park-coordinate database to plot a real geographic
// map against, so this surfaces the same "what's happening right now"
// information as a collapsible live list instead of pins on an SVG.
export function mountParkToPark(container: HTMLElement, opts: { alwaysExpanded?: boolean } = {}): ParkToParkHandle {
  const alwaysExpanded = !!opts.alwaysExpanded;
  let expanded = alwaysExpanded || readBoolPref(EXPANDED_PREF_KEY, true);

  const wrapper = document.createElement('div');
  wrapper.className = 'park-to-park';

  let toggleBtn: HTMLButtonElement | null = null;
  if (!alwaysExpanded) {
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'park-to-park-toggle';
    wrapper.appendChild(toggleBtn);
  }

  const body = document.createElement('div');
  body.className = 'park-to-park-body';
  body.classList.toggle('hidden', !expanded);
  wrapper.appendChild(body);

  const table = document.createElement('table');
  table.className = 'qso-table';
  table.innerHTML =
    '<thead><tr><th>Hunter</th><th>Their Park</th><th>Our Station</th><th>Our Park</th><th>Band/Mode</th><th>UTC</th></tr></thead>';
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  body.appendChild(table);

  container.appendChild(wrapper);

  function updateToggleLabel(): void {
    if (!toggleBtn) return;
    toggleBtn.textContent = expanded ? 'Park-to-Park ▾' : 'Park-to-Park ▸';
  }
  updateToggleLabel();

  function render(): void {
    const qsos = [...store.get().data.qsos.values()].filter((q) => !q.deleted && q.theirPark);
    const rows = sortNewestFirst(qsos).slice(0, MAX_ROWS);

    tbody.innerHTML = '';
    for (const q of rows) {
      const tr = document.createElement('tr');
      for (const value of [q.call, q.theirPark ?? '', q.station, q.myPark, `${q.band}/${q.mode}`, q.ts.slice(11, 16)]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  toggleBtn?.addEventListener('click', () => {
    expanded = !expanded;
    writeBoolPref(EXPANDED_PREF_KEY, expanded);
    body.classList.toggle('hidden', !expanded);
    updateToggleLabel();
    if (expanded) render();
  });

  render();
  return { update: render };
}
