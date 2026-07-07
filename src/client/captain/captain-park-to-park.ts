import { mountParkToPark } from '../park-to-park.ts';
import { store } from '../store.ts';

// Always-expanded reuse of the operator log screen's park-to-park panel --
// no new rendering logic, just wired to redraw on every store update the
// way a live admin dashboard panel should.
export function mountCaptainParkToPark(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-park-to-park-screen';

  const title = document.createElement('h1');
  title.textContent = 'Park-to-Park';
  root.appendChild(title);

  const panelContainer = document.createElement('div');
  root.appendChild(panelContainer);
  container.appendChild(root);

  const handle = mountParkToPark(panelContainer, { alwaysExpanded: true });
  return store.subscribe(() => handle.update());
}
