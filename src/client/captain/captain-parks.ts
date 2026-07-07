import type { ParksCache } from '../parks.ts';
import { loadParks, refreshParks } from '../parks.ts';
import { postJson } from './captain-api.ts';

interface SyncResult {
  count: number;
  syncedAtUtc: string;
}

export function mountCaptainParks(container: HTMLElement): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-parks-screen';

  const title = document.createElement('h1');
  title.textContent = 'Parks';
  root.appendChild(title);

  const hint = document.createElement('p');
  hint.textContent =
    'Downloads the current POTA park list (references, names, states, coordinates) from ' +
    "pota.app's nightly data dump, for park-number autocomplete and the work map. Needs the " +
    'host to have an internet connection at the moment you sync -- the activation site itself ' +
    'stays offline as always once this is done ahead of time. Since the source refreshes ' +
    'roughly nightly, a sync from the day before an activation is generally fresh enough.';
  root.appendChild(hint);

  const status = document.createElement('p');
  status.className = 'captain-parks-status';
  root.appendChild(status);

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.textContent = 'Sync Now';
  root.appendChild(syncBtn);

  const error = document.createElement('span');
  error.className = 'dupe-status dupe-blocked hidden';
  root.appendChild(error);

  container.appendChild(root);

  function renderStatus(cache: ParksCache): void {
    const count = Object.keys(cache.parks).length;
    status.textContent = cache.syncedAtUtc
      ? `${count.toLocaleString()} parks cached -- last synced ${cache.syncedAtUtc}`
      : 'Not synced yet -- no parks cached.';
  }

  async function refresh(): Promise<void> {
    const cache = await loadParks();
    renderStatus(cache);
  }

  syncBtn.addEventListener('click', async () => {
    error.classList.add('hidden');
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    const result = await postJson<SyncResult>('/api/admin/parks/sync', {});
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';

    if (!result.ok || !result.body) {
      error.textContent = 'Sync failed -- check that this machine has an internet connection right now.';
      error.classList.remove('hidden');
      return;
    }

    status.textContent = `${result.body.count.toLocaleString()} parks cached -- last synced ${result.body.syncedAtUtc}`;
    // Force the next park lookup anywhere in the app (autocomplete, work
    // map) to pick up the freshly synced cache.
    await refreshParks();
  });

  refresh();
}
