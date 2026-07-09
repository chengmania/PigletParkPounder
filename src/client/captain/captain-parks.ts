import type { ParksCache } from '../parks.ts';
import { loadParks, refreshParks } from '../parks.ts';
import { postFile, postJson } from './captain-api.ts';

interface SyncResult {
  count: number;
  syncedAtUtc: string;
}

// Mirrors parks-store.ts's PARKS_CSV_URL -- pre-fills the URL field so the
// common case (download POTA's own export) is still a single click, while
// leaving it editable for a mirror/alternate source.
const DEFAULT_PARKS_URL = 'https://pota.app/all_parks_ext.csv';

export function mountCaptainParks(container: HTMLElement): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-parks-screen';

  const title = document.createElement('h1');
  title.textContent = 'Parks';
  root.appendChild(title);

  const hint = document.createElement('p');
  hint.textContent =
    'Loads the POTA park list (references, names, states, coordinates) used for park-number ' +
    "autocomplete and the work map. Pick whichever of the two options below matches this " +
    "computer's situation right now -- both end up loading the same data, just from a different " +
    'place. Once loaded, the activation site itself stays fully offline as always.';
  root.appendChild(hint);

  const status = document.createElement('p');
  status.className = 'captain-parks-status';
  root.appendChild(status);

  const error = document.createElement('span');
  error.className = 'dupe-status dupe-blocked hidden';
  root.appendChild(error);

  const urlSection = document.createElement('div');
  urlSection.className = 'captain-parks-section';
  const urlLabel = document.createElement('h2');
  urlLabel.textContent = 'Option A -- this computer is online right now';
  urlSection.appendChild(urlLabel);
  const urlHint = document.createElement('p');
  urlHint.className = 'captain-parks-section-hint';
  urlHint.textContent =
    "If this computer (the one that will run the host at the activation) has internet access " +
    "right now, just click Download & Load -- it fetches pota.app's own export directly. Since " +
    "that export refreshes roughly nightly, doing this the day before an activation is fresh enough.";
  urlSection.appendChild(urlHint);
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = DEFAULT_PARKS_URL;
  urlInput.className = 'captain-parks-url-input';
  urlSection.appendChild(urlInput);
  const urlBtn = document.createElement('button');
  urlBtn.type = 'button';
  urlBtn.textContent = 'Download & Load';
  urlSection.appendChild(urlBtn);
  root.appendChild(urlSection);

  const fileSection = document.createElement('div');
  fileSection.className = 'captain-parks-section';
  const fileLabel = document.createElement('h2');
  fileLabel.textContent = "Option B -- this computer won't be online at the site";
  fileSection.appendChild(fileLabel);
  const fileHint = document.createElement('p');
  fileHint.className = 'captain-parks-section-hint';
  fileHint.textContent =
    'On any other device that does have internet (a phone, another computer), visit ' +
    'https://pota.app/all_parks_ext.csv to download the CSV, then copy that file onto this ' +
    'computer (USB drive, email, etc.) and upload it here -- no internet needed on this machine ' +
    'at all.';
  fileSection.appendChild(fileHint);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileSection.appendChild(fileInput);
  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.textContent = 'Upload & Load';
  fileSection.appendChild(fileBtn);
  root.appendChild(fileSection);

  container.appendChild(root);

  function renderStatus(cache: ParksCache): void {
    const count = Object.keys(cache.parks).length;
    if (!cache.syncedAtUtc) {
      status.textContent = 'Not loaded yet -- no parks cached.';
      return;
    }
    const sourceText = cache.source ? ` (${cache.source})` : '';
    // This cache never auto-refreshes (the activation site is offline by
    // design) -- a readable local date/time, not a raw ISO string, is what
    // actually answers "is this stale?" at a glance.
    const lastUpdated = new Date(cache.syncedAtUtc).toLocaleString();
    status.textContent = `${count.toLocaleString()} parks cached -- last updated ${lastUpdated}${sourceText}`;
  }

  async function refresh(): Promise<void> {
    const cache = await loadParks();
    renderStatus(cache);
  }

  function showError(message: string): void {
    error.textContent = message;
    error.classList.remove('hidden');
  }

  function authErrorOr(result: { status: number }, fallback: string): string {
    return result.status === 401 ? 'Not authorized -- your Captain session expired, please log in again.' : fallback;
  }

  urlBtn.addEventListener('click', async () => {
    error.classList.add('hidden');
    urlBtn.disabled = true;
    urlBtn.textContent = 'Downloading...';
    const result = await postJson<SyncResult>('/api/admin/parks/sync', { url: urlInput.value.trim() || undefined });
    urlBtn.disabled = false;
    urlBtn.textContent = 'Download & Load';

    if (!result.ok || !result.body) {
      showError(authErrorOr(result, 'Download failed -- check the URL and that this machine has an internet connection right now.'));
      return;
    }

    await refreshParks();
    renderStatus(await loadParks());
  });

  fileBtn.addEventListener('click', async () => {
    error.classList.add('hidden');
    const file = fileInput.files?.[0];
    if (!file) {
      showError('Choose a CSV file first.');
      return;
    }

    fileBtn.disabled = true;
    fileBtn.textContent = 'Uploading...';
    const csvText = await file.text();
    const result = await postFile<SyncResult>('/api/admin/parks/upload', csvText, file.name);
    fileBtn.disabled = false;
    fileBtn.textContent = 'Upload & Load';

    if (!result.ok || !result.body) {
      showError(authErrorOr(result, 'Upload failed -- check the file is a valid POTA parks CSV.'));
      return;
    }

    fileInput.value = '';
    await refreshParks();
    renderStatus(await loadParks());
  });

  refresh();
}
