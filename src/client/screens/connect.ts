import { saveIdentity } from '../identity.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

interface Els {
  status: HTMLElement;
  club: HTMLElement;
  onlineCount: HTMLElement;
}

let els: Els | null = null;

export function render(container: HTMLElement, isNewMount: boolean): void {
  if (isNewMount || !els) {
    buildForm(container);
  }
  updateStatus();
}

function buildForm(container: HTMLElement): void {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'screen connect-screen';

  const title = document.createElement('h1');
  title.textContent = 'PigletParkPounder';
  wrapper.appendChild(title);

  const status = document.createElement('p');
  wrapper.appendChild(status);

  const club = document.createElement('p');
  wrapper.appendChild(club);

  const onlineCount = document.createElement('p');
  wrapper.appendChild(onlineCount);

  const qr = document.createElement('img');
  qr.src = '/qr.svg';
  qr.alt = 'Scan to open this page on another device';
  qr.className = 'connect-qr';
  wrapper.appendChild(qr);

  const form = document.createElement('form');
  form.className = 'connect-form';

  const callInput = document.createElement('input');
  callInput.placeholder = 'Your callsign';
  callInput.required = true;
  callInput.autofocus = true;
  form.appendChild(callInput);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Name (optional)';
  form.appendChild(nameInput);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Connect';
  form.appendChild(submit);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!callInput.value.trim()) return;
    const identity = {
      call: callInput.value,
      name: nameInput.value.trim() || undefined,
    };
    saveIdentity(identity);
    send({ type: 'hello', operatorCall: identity.call, name: identity.name });
  });

  wrapper.appendChild(form);
  container.appendChild(wrapper);

  els = { status, club, onlineCount };
}

function updateStatus(): void {
  if (!els) return;
  const state = store.get();

  els.status.className = `status status-${state.connection}`;
  els.status.textContent = `Status: ${state.connection}`;

  els.club.textContent = state.data.config ? `${state.data.config.clubName} (${state.data.config.clubCall})` : '';

  els.onlineCount.textContent = `${state.data.operators.size} operator(s) known`;
}
