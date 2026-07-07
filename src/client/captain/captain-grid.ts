import { buildReservationTable } from '../screens/grid.ts';
import { store } from '../store.ts';

// Read-only monitor: no claim/release handlers, and `you` is passed as null
// so no cell is ever styled "yours" -- this is an observation view, not a
// participant view, reusing grid.ts's shared per-station table-building so
// the two can't silently drift apart.
export function mountCaptainGrid(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-grid-screen';

  const title = document.createElement('h1');
  title.textContent = 'Grid Monitor';
  root.appendChild(title);

  const body = document.createElement('div');
  root.appendChild(body);
  container.appendChild(root);

  function refresh(): void {
    body.innerHTML = '';
    const state = store.get();
    const stations = state.data.config?.stations ?? [];
    for (const stationId of stations) {
      const heading = document.createElement('h2');
      heading.textContent = stationId;
      body.appendChild(heading);
      body.appendChild(buildReservationTable(stationId, state.data.reservations, null, { readOnly: true }));
    }
  }

  refresh();
  return store.subscribe(refresh);
}
