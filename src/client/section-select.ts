import { isValidSectionCode } from '../shared/sections.ts';
import { sectionCodeOptions } from './autocomplete.ts';

export interface SectionSelectHandle {
  getValue(): string;
  setValue(v: string): void;
  focus(): void;
}

export interface SectionSelectOptions {
  onChange?: (value: string) => void;
}

// Native <datalist> can't do reliable arrow-key-driven filtering across
// browsers, so this is a small hand-rolled combobox: text input + a
// filtered listbox, ArrowUp/ArrowDown to highlight, Enter/click to select,
// Escape to close. Blur with a value that isn't a real section or DX marks
// the field invalid (hard-blocks submit, per spec).
export function mountSectionSelect(container: HTMLElement, opts: SectionSelectOptions = {}): SectionSelectHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'section-select';

  const input = document.createElement('input');
  input.placeholder = 'Section';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  wrapper.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'section-select-list hidden';
  list.setAttribute('role', 'listbox');
  wrapper.appendChild(list);

  container.appendChild(wrapper);

  const allOptions = sectionCodeOptions();
  let filtered: string[] = [];
  let highlightIndex = -1;

  function closeList(): void {
    list.classList.add('hidden');
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    highlightIndex = -1;
  }

  function renderList(): void {
    list.innerHTML = '';
    for (const [i, code] of filtered.entries()) {
      const li = document.createElement('li');
      li.textContent = code;
      li.setAttribute('role', 'option');
      li.className = i === highlightIndex ? 'highlighted' : '';
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input, don't fire blur first
        select(code);
      });
      list.appendChild(li);
    }
    list.classList.toggle('hidden', filtered.length === 0);
    input.setAttribute('aria-expanded', String(filtered.length > 0));
  }

  function updateValidity(): void {
    const valid = input.value.trim() === '' || isValidSectionCode(input.value.trim());
    input.classList.toggle('invalid', !valid);
  }

  function select(code: string): void {
    input.value = code;
    closeList();
    updateValidity();
    opts.onChange?.(code);
  }

  function filterFrom(query: string): void {
    const q = query.trim().toUpperCase();
    filtered = q === '' ? [] : allOptions.filter((code) => code.startsWith(q));
    highlightIndex = filtered.length > 0 ? 0 : -1;
    renderList();
  }

  input.addEventListener('input', () => {
    filterFrom(input.value);
    updateValidity();
    opts.onChange?.(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      highlightIndex = (highlightIndex + 1) % filtered.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      highlightIndex = (highlightIndex - 1 + filtered.length) % filtered.length;
      renderList();
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        e.preventDefault();
        select(filtered[highlightIndex]!);
      } else {
        closeList();
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  input.addEventListener('blur', () => {
    closeList();
    updateValidity();
  });

  return {
    getValue: () => input.value,
    setValue: (v: string) => {
      input.value = v;
      updateValidity();
    },
    focus: () => input.focus(),
  };
}
