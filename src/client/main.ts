import * as connectScreen from './screens/connect.ts';
import * as dashboardScreen from './screens/dashboard.ts';
import * as gridScreen from './screens/grid.ts';
import * as hostSetupScreen from './screens/host-setup.ts';
import * as logScreen from './screens/log.ts';
import { isHostMode } from './host-mode.ts';
import { store } from './store.ts';
import { connect } from './ws-client.ts';

type Screen = { render: (container: HTMLElement) => void };

function navLinks(): Array<[string, string]> {
  const links: Array<[string, string]> = [
    ['#/grid', 'Grid'],
    ['#/log', 'Log'],
    ['#/dashboard', 'Dashboard'],
  ];
  if (isHostMode()) links.push(['#/setup', 'Host Setup']);
  return links;
}

function currentScreen(): Screen {
  const state = store.get();
  if (!state.you) return connectScreen;

  const route = location.hash.replace(/^#/, '') || '/grid';
  switch (route) {
    case '/log':
      return logScreen;
    case '/dashboard':
      return dashboardScreen;
    case '/setup':
      return hostSetupScreen;
    case '/grid':
    default:
      return gridScreen;
  }
}

const appRoot = document.getElementById('app')!;
appRoot.innerHTML = '';
const nav = document.createElement('nav');
nav.className = 'app-nav';
const content = document.createElement('div');
content.className = 'app-content';
appRoot.append(nav, content);

function renderNav(): void {
  const state = store.get();
  nav.innerHTML = '';
  if (!state.you) return;
  const activeRoute = location.hash.replace(/^#/, '') || '/grid';
  for (const [href, label] of navLinks()) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === `#${activeRoute}`) a.classList.add('active');
    nav.appendChild(a);
  }
}

function rerender(): void {
  renderNav();
  currentScreen().render(content);
}

store.subscribe(rerender);
window.addEventListener('hashchange', rerender);

connect(`ws://${location.host}/ws`);
rerender();
