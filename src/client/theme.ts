const STORAGE_KEY = 'ppp-theme';

// Pure: dark is always the default when nothing (or garbage) is stored --
// early-morning and dusk activations mean dark should never require a choice.
export function resolveTheme(stored: string | null): 'light' | 'dark' {
  return stored === 'light' ? 'light' : 'dark';
}

export function initTheme(): void {
  const theme = resolveTheme(localStorage.getItem(STORAGE_KEY));
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): void {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
}

export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
