import type { ConnectionStatus } from './store.ts';

let bannerEl: HTMLElement | null = null;

export function mountBanner(root: HTMLElement): HTMLElement {
  bannerEl = document.createElement('div');
  bannerEl.className = 'offline-banner hidden';
  bannerEl.textContent = 'Offline -- logging locally, will sync when reconnected';
  root.prepend(bannerEl);
  return bannerEl;
}

export function updateBanner(connection: ConnectionStatus): void {
  if (!bannerEl) return;
  bannerEl.classList.toggle('hidden', connection === 'connected');
  bannerEl.textContent =
    connection === 'connecting'
      ? 'Connecting...'
      : 'Offline -- logging locally, will sync when reconnected';
}
