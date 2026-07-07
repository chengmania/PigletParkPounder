import { store } from '../store.ts';
import { initTheme } from '../theme.ts';
import { connect, send } from '../ws-client.ts';
import { getJson } from './captain-api.ts';
import { mountCaptainDashboard } from './captain-dashboard.ts';
import { renderCaptainLogin } from './captain-login.ts';
import { renderCaptainSetup } from './captain-setup.ts';

interface StatusResponse {
  configured: boolean;
  loggedIn: boolean;
  captainCall?: string;
}

export async function mountCaptainApp(): Promise<void> {
  initTheme();

  const appRoot = document.getElementById('app')!;
  appRoot.innerHTML = '';
  const content = document.createElement('div');
  content.className = 'app-content';
  appRoot.appendChild(content);

  async function refresh(): Promise<void> {
    const status = await getJson<StatusResponse>('/api/admin/status');
    if (!status.body?.configured) {
      renderCaptainSetup(content, refresh);
    } else if (!status.body.loggedIn) {
      renderCaptainLogin(content, refresh);
    } else {
      startDashboard(content, status.body.captainCall!);
    }
  }

  await refresh();
}

// The captain's page opens its own WS connection and sends a normal hello
// (reusing operator-join plumbing rather than a parallel "admin subscribe"
// message) -- the captain showing up in the operators list is a harmless
// side effect. conn.isAdmin (set at upgrade time from the session cookie)
// independently gates config:set regardless of hello status.
//
// Sent directly off the 'connected' transition (not via send()'s normal
// outbox-on-disconnect fallback) since there's no offline concern here --
// the captain's page has nothing to queue before a connection exists.
function startDashboard(content: HTMLElement, captainCall: string): void {
  mountCaptainDashboard(content);

  let helloSent = false;
  store.subscribe(() => {
    if (!helloSent && store.get().connection === 'connected') {
      helloSent = true;
      send({ type: 'hello', operatorCall: captainCall });
    }
  });

  connect(`ws://${location.host}/ws`);
}
