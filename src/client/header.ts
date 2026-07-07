import { currentTheme, toggleTheme } from './theme.ts';

// Reused by the operator header and the Captain's Station topbar, so both
// surfaces get the same light/dark control rather than two implementations.
export function createThemeToggle(): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Toggle light/dark theme');

  function updateIcon(): void {
    toggle.textContent = currentTheme() === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'; // moon : sun
  }
  updateIcon();

  toggle.addEventListener('click', () => {
    toggleTheme();
    updateIcon();
  });

  return toggle;
}

export function mountHeader(root: HTMLElement): void {
  const header = document.createElement('header');
  header.className = 'app-header';

  // Empty spacer matching the toggle button's fixed width, so the centered
  // title stays visually centered rather than skewed by the toggle's width.
  const spacer = document.createElement('span');
  spacer.className = 'app-header-spacer';
  header.appendChild(spacer);

  const title = document.createElement('span');
  title.className = 'app-header-title';
  title.textContent = 'PigletParkPounder';
  header.appendChild(title);

  header.appendChild(createThemeToggle());

  root.appendChild(header);
}
