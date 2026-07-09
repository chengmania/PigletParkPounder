import { mountCaptainCallsigns } from './captain-callsigns.ts';
import { mountCaptainParks } from './captain-parks.ts';

// One pill for every reference dataset the app needs loaded ahead of time
// while there's still internet -- parks and callsigns each have their own
// Option A/B sync UI (mountCaptainParks/mountCaptainCallsigns, unchanged),
// just composed together here instead of living as separate top-level tabs.
export function mountCaptainImports(container: HTMLElement): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-imports-screen';

  const title = document.createElement('h1');
  title.textContent = 'Imports';
  root.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent =
    'Reference data the app uses at the activation site, where this computer will have no ' +
    'internet -- load both of these ahead of time, from wherever it does have a connection.';
  root.appendChild(intro);

  const parksSection = document.createElement('div');
  parksSection.className = 'captain-import-section';
  root.appendChild(parksSection);
  mountCaptainParks(parksSection);

  const callsignsSection = document.createElement('div');
  callsignsSection.className = 'captain-import-section';
  root.appendChild(callsignsSection);
  mountCaptainCallsigns(callsignsSection);

  container.appendChild(root);
}
