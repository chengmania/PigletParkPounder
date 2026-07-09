import type { CallsignsResponse } from '../callsigns.ts';
import { loadCallsigns, refreshCallsigns } from '../callsigns.ts';
import { postBinaryFile, postJson } from './captain-api.ts';

interface SyncResult {
  count: number;
  syncedAtUtc: string;
}

// Mirrors callsigns-store.ts's CALLSIGN_PROVIDERS -- one entry per country
// this app knows how to import. Adding a country here (plus the matching
// server-side module under callsigns-sources/) is the only client change
// needed; everything else (the sync/upload plumbing, status display) is
// generic per-provider UI below.
interface ProviderConfig {
  id: string;
  label: string;
  defaultUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'US', label: 'United States (FCC)', defaultUrl: 'https://data.fcc.gov/download/pub/uls/complete/l_amat.zip' },
  { id: 'CA', label: 'Canada (ISED)', defaultUrl: 'https://apc-cap.ic.gc.ca/datafiles/amateur_delim.zip' },
];

// Reuses the Parks tab's CSS classes (captain-parks.ts) -- purely visual
// hooks, not parks-specific, and each provider block is structurally
// identical to that screen.
export function mountCaptainCallsigns(container: HTMLElement): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-parks-screen';

  const title = document.createElement('h1');
  title.textContent = 'Callsigns';
  root.appendChild(title);

  const hint = document.createElement('p');
  hint.textContent =
    "Loads each country's amateur-radio license database (callsign, licensee name, state) used " +
    "to resolve a hunter's callsign while logging. Each country below is loaded and kept " +
    'independently -- syncing one never affects another. These files are much bigger than the ' +
    'parks list -- expect either option to take a few minutes, not seconds. Once loaded, the ' +
    'activation site itself stays fully offline as always.';
  root.appendChild(hint);

  for (const provider of PROVIDERS) root.appendChild(mountProviderBlock(provider));

  container.appendChild(root);
}

function mountProviderBlock(provider: ProviderConfig): HTMLElement {
  const block = document.createElement('div');
  block.className = 'captain-import-section';

  const heading = document.createElement('h2');
  heading.textContent = provider.label;
  block.appendChild(heading);

  const status = document.createElement('p');
  status.className = 'captain-parks-status';
  block.appendChild(status);

  const error = document.createElement('span');
  error.className = 'dupe-status dupe-blocked hidden';
  block.appendChild(error);

  const urlSection = document.createElement('div');
  urlSection.className = 'captain-parks-section';
  const urlLabel = document.createElement('h3');
  urlLabel.textContent = 'Option A -- this computer is online right now';
  urlSection.appendChild(urlLabel);
  const urlHint = document.createElement('p');
  urlHint.className = 'captain-parks-section-hint';
  urlHint.textContent =
    "If this computer (the one that will run the host at the activation) has internet access " +
    'right now, just click Download & Load.';
  urlSection.appendChild(urlHint);
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = provider.defaultUrl;
  urlInput.className = 'captain-parks-url-input';
  urlSection.appendChild(urlInput);
  const urlBtn = document.createElement('button');
  urlBtn.type = 'button';
  urlBtn.textContent = 'Download & Load';
  urlSection.appendChild(urlBtn);
  block.appendChild(urlSection);

  const fileSection = document.createElement('div');
  fileSection.className = 'captain-parks-section';
  const fileLabel = document.createElement('h3');
  fileLabel.textContent = "Option B -- this computer won't be online at the site";
  fileSection.appendChild(fileLabel);
  const fileHint = document.createElement('p');
  fileHint.className = 'captain-parks-section-hint';
  fileHint.textContent =
    'On any other device that does have internet (a phone, another computer), visit ' +
    `${provider.defaultUrl} to download the zip, then copy that file onto this computer (USB ` +
    'drive, email, etc.) and upload it here -- no internet needed on this machine at all.';
  fileSection.appendChild(fileHint);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip,application/zip';
  fileSection.appendChild(fileInput);
  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.textContent = 'Upload & Load';
  fileSection.appendChild(fileBtn);
  block.appendChild(fileSection);

  function renderStatus(cache: CallsignsResponse): void {
    const info = cache.sources[provider.id];
    if (!info) {
      status.textContent = 'Not loaded yet -- no callsigns cached.';
      return;
    }
    // This cache never auto-refreshes (the activation site is offline by
    // design) -- a readable local date/time, not a raw ISO string, is what
    // actually answers "is this stale?" at a glance.
    const lastUpdated = new Date(info.syncedAtUtc).toLocaleString();
    status.textContent = `${info.count.toLocaleString()} callsigns cached -- last updated ${lastUpdated} (${info.source})`;
  }

  async function refresh(): Promise<void> {
    renderStatus(await loadCallsigns());
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
    const result = await postJson<SyncResult>('/api/admin/callsigns/sync', {
      providerId: provider.id,
      url: urlInput.value.trim() || undefined,
    });
    urlBtn.disabled = false;
    urlBtn.textContent = 'Download & Load';

    if (!result.ok || !result.body) {
      showError(authErrorOr(result, 'Download failed -- check the URL and that this machine has an internet connection right now.'));
      return;
    }

    await refreshCallsigns();
    renderStatus(await loadCallsigns());
  });

  fileBtn.addEventListener('click', async () => {
    error.classList.add('hidden');
    const file = fileInput.files?.[0];
    if (!file) {
      showError('Choose a zip file first.');
      return;
    }

    fileBtn.disabled = true;
    fileBtn.textContent = 'Uploading...';
    // Binary upload -- never read as text, that would corrupt the zip.
    const result = await postBinaryFile<SyncResult>('/api/admin/callsigns/upload', file, file.name, { 'X-Provider-Id': provider.id });
    fileBtn.disabled = false;
    fileBtn.textContent = 'Upload & Load';

    if (!result.ok || !result.body) {
      showError(authErrorOr(result, `Upload failed -- check the file is the ${provider.label} amateur-license zip.`));
      return;
    }

    fileInput.value = '';
    await refreshCallsigns();
    renderStatus(await loadCallsigns());
  });

  refresh();

  return block;
}
