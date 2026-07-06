import { getBand } from '../bands.ts';
import { isInEventWindow } from '../scoring.ts';
import type { ClubConfig, Mode, Qso } from '../types.ts';

// Cabrillo 3.0 mode tokens (spec section 9): PH/CW/DG.
const MODE_TOKEN: Record<Mode, string> = { PH: 'PH', CW: 'CW', DIG: 'DG' };

function cabrilloFreqField(qso: Qso): string {
  const band = getBand(qso.band);
  if (!band || band.cabrilloFreqKhz === 'SAT') return 'SAT';
  return String(band.cabrilloFreqKhz);
}

// The spec's literal "CATEGORY: FIELD-DAY" isn't a real Cabrillo tag -- the
// tag ARRL's parser actually expects is CONTEST: ARRL-FIELD-DAY. Emitting
// that plus the standard identifying headers is what makes the file
// recognized as a valid Field Day Cabrillo submission (Rule 8.7).
export function toCabrilloLog(qsos: readonly Qso[], config: ClubConfig): string {
  const lines: string[] = [];
  lines.push('START-OF-LOG: 3.0');
  lines.push(`CALLSIGN: ${config.clubCall}`);
  lines.push('CONTEST: ARRL-FIELD-DAY');
  lines.push(`CLASS: ${config.entryClass}`);
  lines.push(`LOCATION: ${config.section}`);
  lines.push(`CLUB: ${config.clubName}`);

  const eligible = qsos.filter((q) => !q.deleted && isInEventWindow(q, config));
  const sorted = [...eligible].sort((a, b) => a.ts.localeCompare(b.ts));

  for (const q of sorted) {
    const freq = cabrilloFreqField(q);
    const mode = MODE_TOKEN[q.mode];
    const date = q.ts.slice(0, 10);
    const time = q.ts.slice(11, 16).replace(':', '');
    const ourCall = q.station === 'GOTA' && config.gotaCall ? config.gotaCall : config.clubCall;
    const ourExch = `${config.entryClass} ${config.section}`;
    const theirExch = `${q.exchClass} ${q.exchSection}`;
    lines.push(`QSO: ${freq} ${mode} ${date} ${time} ${ourCall} ${ourExch} ${q.call} ${theirExch}`);
  }

  lines.push('END-OF-LOG:');
  return lines.join('\n') + '\n';
}
