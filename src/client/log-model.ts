import type { ClubConfig, Mode, StationKind } from '../shared/types.ts';

export interface IdentityModel {
  callsign: string;
  entryClass: string;
  section: string;
  bandMode: string | null;
  isGota: boolean;
}

export interface IdentityContext {
  station: StationKind;
  band: string;
  mode: Mode;
}

// Pure so the identity bar's content is directly testable without touching
// the DOM.
export function buildIdentity(config: ClubConfig | null, ctx: IdentityContext | null): IdentityModel {
  const isGota = ctx?.station === 'GOTA';
  return {
    callsign: (isGota ? config?.gotaCall : config?.clubCall) ?? '',
    entryClass: config?.entryClass ?? '',
    section: config?.section ?? '',
    bandMode: ctx ? `${ctx.band} ${ctx.mode}` : null,
    isGota,
  };
}
