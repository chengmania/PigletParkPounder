import type { ClubConfig, Mode, StationKind } from '../shared/types.ts';

export interface IdentityModel {
  callsign: string;
  station: string;
  park: string;
  bandMode: string | null;
}

export interface IdentityContext {
  station: StationKind;
  band: string;
  mode: Mode;
}

// Pure so the identity bar's content is directly testable without touching
// the DOM.
export function buildIdentity(config: ClubConfig | null, ctx: IdentityContext | null): IdentityModel {
  const park = ctx ? (config?.stationParks[ctx.station]?.parkNumber ?? '') : '';
  return {
    callsign: config?.clubCall ?? '',
    station: ctx?.station ?? '',
    park,
    bandMode: ctx ? `${ctx.band} ${ctx.mode}` : null,
  };
}
