export interface SectionPin {
  section: string;
  x: number;
  y: number;
}

// Sections without geometry in the vendored map (public/section-map.svg is a
// 50-states+DC+Canada outline -- Puerto Rico and the US Virgin Islands
// aren't in it, and DX has no geography at all) get corner badges instead
// of pins.
export const BADGE_SECTIONS = ['DX', 'PR', 'VI'] as const;

// One pin per remaining ARRL/RAC section, placed at (or near, for split
// states/provinces) that section's centroid within the map's 2289x1744
// viewBox. Coordinates for single-section states/provinces are the actual
// computed centroid of that region's path data in section-map.svg (average
// of every coordinate along its outline -- a reasonable stand-in for "center
// of the shape" for pin-placement purposes). Split states/provinces get
// multiple pins manually offset from that centroid toward each section's
// real-world sub-region (e.g. WNY placed toward Buffalo, ENY toward Albany).
//
// Known limitation (documented, not a bug): the backdrop map has one path
// per state/province, not per section, so the map's "fill tint when worked"
// effect can only operate at state/province granularity for the 10 split
// regions below -- pins remain exact per-section regardless.
export const SECTION_PINS: SectionPin[] = [
  // --- Single-section US states (1:1 with their centroid) ---
  { section: 'CO', x: 1312.3, y: 1309.6 },
  { section: 'IA', x: 1556.1, y: 1263.6 },
  { section: 'KS', x: 1447.4, y: 1343.4 },
  { section: 'MN', x: 1556.6, y: 1127.8 },
  { section: 'MO', x: 1577.7, y: 1354.0 },
  { section: 'ND', x: 1439.8, y: 1105.6 },
  { section: 'NE', x: 1443.9, y: 1262.0 },
  { section: 'SD', x: 1431.8, y: 1185.7 },
  { section: 'CT', x: 1945.4, y: 1235.8 },
  { section: 'ME', x: 1992.7, y: 1119.8 },
  { section: 'NH', x: 1959.8, y: 1177.8 },
  { section: 'RI', x: 1968.9, y: 1227.2 },
  { section: 'VT', x: 1934.8, y: 1172.4 },
  { section: 'DE', x: 1907.5, y: 1308.9 },
  { section: 'AL', x: 1686.9, y: 1511.2 },
  { section: 'GA', x: 1770.1, y: 1505.8 },
  { section: 'KY', x: 1698.6, y: 1371.3 },
  { section: 'NC', x: 1845.9, y: 1418.1 },
  { section: 'SC', x: 1821.2, y: 1468.6 },
  { section: 'TN', x: 1701.5, y: 1418.9 },
  { section: 'VA', x: 1856.7, y: 1356.0 },
  { section: 'AR', x: 1583.9, y: 1445.6 },
  { section: 'LA', x: 1591.0, y: 1572.4 },
  { section: 'MS', x: 1620.3, y: 1517.0 },
  { section: 'NM', x: 1271.2, y: 1439.7 },
  { section: 'OK', x: 1438.2, y: 1414.1 },
  { section: 'AK', x: 835.6, y: 422.8 },
  { section: 'AZ', x: 1135.0, y: 1413.2 },
  { section: 'ID', x: 1170.8, y: 1108.9 },
  { section: 'MT', x: 1265.9, y: 1094.0 },
  { section: 'NV', x: 1088.8, y: 1273.5 },
  { section: 'OR', x: 1063.6, y: 1090.0 },
  { section: 'UT', x: 1186.8, y: 1249.3 },
  { section: 'WY', x: 1280.8, y: 1209.6 },
  { section: 'MI', x: 1695.2, y: 1184.5 },
  { section: 'OH', x: 1756.1, y: 1300.0 },
  { section: 'WV', x: 1814.0, y: 1331.8 },
  { section: 'IL', x: 1626.1, y: 1319.3 },
  { section: 'IN', x: 1684.2, y: 1323.7 },
  { section: 'WI', x: 1624.4, y: 1177.3 },

  // --- MD + DC combined into one section (MDC): centroid of both ---
  { section: 'MDC', x: 1880.0, y: 1316.7 },

  // --- Massachusetts split: EMA / WMA ---
  { section: 'EMA', x: 2000.0, y: 1215.0 },
  { section: 'WMA', x: 1955.0, y: 1215.0 },

  // --- New York split: ENY / NNY / NLI / WNY ---
  { section: 'WNY', x: 1810.0, y: 1210.0 },
  { section: 'NNY', x: 1900.0, y: 1150.0 },
  { section: 'ENY', x: 1920.0, y: 1200.0 },
  { section: 'NLI', x: 1955.0, y: 1270.0 },

  // --- New Jersey split: NNJ / SNJ ---
  { section: 'NNJ', x: 1918.0, y: 1255.0 },
  { section: 'SNJ', x: 1918.0, y: 1305.0 },

  // --- Pennsylvania split: EPA / WPA ---
  { section: 'EPA', x: 1900.0, y: 1270.0 },
  { section: 'WPA', x: 1800.0, y: 1270.0 },

  // --- Florida split: NFL / SFL / WCF ---
  { section: 'NFL', x: 1740.0, y: 1560.0 },
  { section: 'SFL', x: 1810.0, y: 1680.0 },
  { section: 'WCF', x: 1780.0, y: 1630.0 },

  // --- Texas split: NTX / STX / WTX (no plain "TX" section exists) ---
  { section: 'NTX', x: 1420.0, y: 1460.0 },
  { section: 'STX', x: 1400.0, y: 1600.0 },
  { section: 'WTX', x: 1250.0, y: 1500.0 },

  // --- California split into 9 sections (PAC is Hawaii, not CA -- below) ---
  { section: 'SF', x: 990.0, y: 1290.0 },
  { section: 'EB', x: 1000.0, y: 1290.0 },
  { section: 'SCV', x: 995.0, y: 1305.0 },
  { section: 'SJV', x: 1030.0, y: 1310.0 },
  { section: 'SV', x: 1020.0, y: 1260.0 },
  { section: 'SB', x: 1000.0, y: 1350.0 },
  { section: 'LAX', x: 1020.0, y: 1380.0 },
  { section: 'ORG', x: 1030.0, y: 1390.0 },
  { section: 'SDG', x: 1035.0, y: 1410.0 },

  // --- Pacific section: Hawaii + Pacific islands, not a CA subdivision ---
  { section: 'PAC', x: 52.8, y: 1286.4 },

  // --- Washington split: EWA / WWA ---
  { section: 'WWA', x: 1050.0, y: 1010.0 },
  { section: 'EWA', x: 1110.0, y: 1015.0 },

  // --- Canadian provinces (1:1) ---
  { section: 'AB', x: 1247.4, y: 867.6 },
  { section: 'BC', x: 1060.4, y: 830.6 },
  { section: 'MB', x: 1494.0, y: 931.4 },
  { section: 'NB', x: 2035.9, y: 1070.2 },
  { section: 'NL', x: 2086.3, y: 881.8 },
  { section: 'NS', x: 2103.0, y: 1091.0 },
  { section: 'PE', x: 2087.0, y: 1062.6 },
  { section: 'QC', x: 1928.1, y: 917.0 },
  { section: 'SK', x: 1383.3, y: 897.1 },

  // --- Ontario split: GH / ONE / ONN / ONS ---
  { section: 'ONN', x: 1700.0, y: 950.0 },
  { section: 'ONE', x: 1830.0, y: 1080.0 },
  { section: 'ONS', x: 1770.0, y: 1130.0 },
  { section: 'GH', x: 1790.0, y: 1150.0 },

  // --- Territories (YT/NT/NU combined into one section): average of the
  // three territory centroids, spanning the region near Yellowknife ---
  { section: 'TER', x: 1354.8, y: 456.8 },
];

// Maps each pinned section to the underlying <path>/<g> id in
// section-map.svg, for the "fill with accent tint when worked" effect.
// Known, documented limitation: the map has one path per state/province,
// not per section, so this is state/province granularity only for the 10
// split regions (e.g. any California section lights up all of US-CA) --
// pins remain the exact per-section indicator regardless.
export const SECTION_PATH_ID: Record<string, string> = {
  CO: 'US-CO', IA: 'US-IA', KS: 'US-KS', MN: 'US-MN', MO: 'US-MO', ND: 'US-ND', NE: 'US-NE', SD: 'US-SD',
  CT: 'US-CT', ME: 'US-ME', NH: 'US-NH', RI: 'US-RI', VT: 'US-VT', DE: 'US-DE',
  AL: 'US-AL', GA: 'US-GA', KY: 'US-KY', NC: 'US-NC', SC: 'US-SC', TN: 'US-TN', VA: 'US-VA',
  AR: 'US-AR', LA: 'US-LA', MS: 'US-MS', NM: 'US-NM', OK: 'US-OK',
  AK: 'US-AK', AZ: 'US-AZ', ID: 'US-ID', MT: 'US-MT', NV: 'US-NV', OR: 'US-OR', UT: 'US-UT', WY: 'US-WY',
  MI: 'US-MI', OH: 'US-OH', WV: 'US-WV', IL: 'US-IL', IN: 'US-IN', WI: 'US-WI',
  MDC: 'US-MD',
  EMA: 'US-MA', WMA: 'US-MA',
  WNY: 'US-NY', NNY: 'US-NY', ENY: 'US-NY', NLI: 'US-NY',
  NNJ: 'US-NJ', SNJ: 'US-NJ',
  EPA: 'US-PA', WPA: 'US-PA',
  NFL: 'US-FL', SFL: 'US-FL', WCF: 'US-FL',
  NTX: 'US-TX', STX: 'US-TX', WTX: 'US-TX',
  SF: 'US-CA', EB: 'US-CA', SCV: 'US-CA', SJV: 'US-CA', SV: 'US-CA', SB: 'US-CA', LAX: 'US-CA', ORG: 'US-CA', SDG: 'US-CA',
  PAC: 'US-HI',
  WWA: 'US-WA', EWA: 'US-WA',
  AB: 'CA-AB', BC: 'CA-BC', MB: 'CA-MB', NB: 'CA-NB', NL: 'CA-NL', NS: 'CA-NS', PE: 'CA-PE', QC: 'CA-QC', SK: 'CA-SK',
  ONN: 'CA-ON', ONE: 'CA-ON', ONS: 'CA-ON', GH: 'CA-ON',
  TER: 'CA-NT',
};
