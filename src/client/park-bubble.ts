import { splitParkList } from '../shared/validate.ts';
import { loadParks, lookupPark } from './parks.ts';

// A small floating bubble that resolves whatever park reference(s) are
// currently typed into `input` to their name/state, so a typo or an
// unsynced park database is obvious before submit rather than only at
// export time. Shared by the operator log screen (Their Park) and the
// Captain's club-setup screen (station park assignment).
export function mountParkResolvedBubble(input: HTMLInputElement): HTMLElement {
  const bubble = document.createElement('span');
  bubble.className = 'park-resolved-bubble hidden';

  const update = (): void => {
    const segments = splitParkList(input.value);
    if (segments.length === 0) {
      bubble.classList.add('hidden');
      bubble.textContent = '';
      return;
    }
    bubble.textContent = segments
      .map((ref) => {
        const record = lookupPark(ref);
        return record ? `${ref}: ${record.name}${record.state ? `, ${record.state}` : ''}` : `${ref}: unknown park`;
      })
      .join(' · ');
    bubble.classList.remove('hidden');
  };

  input.addEventListener('input', update);
  loadParks().then(update);
  return bubble;
}
