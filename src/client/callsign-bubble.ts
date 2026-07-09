import { isValidCallsign } from '../shared/validate.ts';
import { loadCallsigns, lookupCallsign } from './callsigns.ts';

// A small floating bubble that resolves whatever's typed into `input` to
// the FCC-licensed name/state it matches, so a mistyped hunter callsign is
// obvious before submit rather than only at export time. Mirrors
// park-bubble.ts's role for the Their-Park field.
export function mountCallsignResolvedBubble(input: HTMLInputElement): HTMLElement {
  const bubble = document.createElement('span');
  bubble.className = 'park-resolved-bubble hidden';

  const update = (): void => {
    const call = input.value.trim().toUpperCase();
    // Only resolve once the value looks like a complete callsign -- avoids a
    // noisy "not in FCC database" flashing on every keystroke while the
    // operator is still mid-callsign.
    if (!isValidCallsign(call)) {
      bubble.classList.add('hidden');
      bubble.textContent = '';
      return;
    }
    const record = lookupCallsign(call);
    // Not found is a heads-up, not an error -- plenty of legitimate hunters
    // (DX, club calls not yet synced, etc.) won't be in the FCC database and
    // must always remain loggable regardless.
    bubble.textContent = record ? `${call}: ${record.name}${record.state ? `, ${record.state}` : ''}` : `${call}: not in FCC database`;
    bubble.classList.remove('hidden');
  };

  input.addEventListener('input', update);
  loadCallsigns().then(update);
  return bubble;
}
