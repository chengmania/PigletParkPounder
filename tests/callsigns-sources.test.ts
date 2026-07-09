import { describe, expect, test } from 'bun:test';
import { strToU8, zipSync } from 'fflate';
import { joinCallsigns, parseEnDat, parseHdDat, unzipEnAndHd } from '../src/server/callsigns-sources/fcc.ts';
import { parseAmateurDelim, parseIsedZip } from '../src/server/callsigns-sources/ised.ts';

// Built with explicit column arrays (not hand-counted pipe strings) so a
// fixture typo can't silently shift a column -- mirrors the real FCC EN.dat
// layout: 0=recordType, 1=fccid, 2=ULS file#, 3=EBF#, 4=call sign,
// 5=entity type, 6=licensee id, 7=entity name, 8=first, 9=mi, 10=last,
// 11=suffix, 12=phone, 13=fax, 14=email, 15=address, 16=city, 17=state.
function enLine(fields: { fccid: string; call: string; entityName?: string; first?: string; mi?: string; last?: string; state?: string }): string {
  const cols = new Array(18).fill('');
  cols[0] = 'EN';
  cols[1] = fields.fccid;
  cols[4] = fields.call;
  cols[7] = fields.entityName ?? '';
  cols[8] = fields.first ?? '';
  cols[9] = fields.mi ?? '';
  cols[10] = fields.last ?? '';
  cols[17] = fields.state ?? '';
  return cols.join('|');
}

// Real HD.dat layout: 0=recordType, 1=fccid, 2=ULS file#, 3=EBF#, 4=call
// sign, 5=license status ('A' = active).
function hdLine(fields: { fccid: string; call: string; status: string }): string {
  const cols = new Array(6).fill('');
  cols[0] = 'HD';
  cols[1] = fields.fccid;
  cols[4] = fields.call;
  cols[5] = fields.status;
  return cols.join('|');
}

const SAMPLE_EN = [
  enLine({ fccid: '0001', call: 'W1AW', entityName: 'ARRL INC', state: 'CT' }),
  enLine({ fccid: '0002', call: 'K1XYZ', first: 'JOHN', mi: 'Q', last: 'PUBLIC', state: 'ME' }),
  enLine({ fccid: '0003', call: 'N0CALL', first: 'JANE', last: 'DOE', state: 'TX' }),
  enLine({ fccid: '0004', call: 'W9NOHD', first: 'NO', last: 'HEADER', state: 'IL' }),
].join('\n');

const SAMPLE_HD = [
  hdLine({ fccid: '0001', call: 'W1AW', status: 'A' }),
  hdLine({ fccid: '0002', call: 'K1XYZ', status: 'A' }),
  hdLine({ fccid: '0003', call: 'N0CALL', status: 'E' }), // Expired -- must be excluded
  hdLine({ fccid: '0005', call: 'K5ORPHAN', status: 'A' }), // active, no matching EN row
].join('\n');

describe('FCC: parseEnDat', () => {
  test('uses Entity Name when present (club/org licenses)', () => {
    const en = parseEnDat(SAMPLE_EN);
    expect(en.get('0001')).toEqual({ name: 'ARRL INC', state: 'CT' });
  });

  test('composes First MI. Last when Entity Name is blank', () => {
    const en = parseEnDat(SAMPLE_EN);
    expect(en.get('0002')).toEqual({ name: 'JOHN Q. PUBLIC', state: 'ME' });
  });

  test('composes First Last with no stray space when MI is blank', () => {
    const en = parseEnDat(SAMPLE_EN);
    expect(en.get('0003')).toEqual({ name: 'JANE DOE', state: 'TX' });
  });
});

describe('FCC: parseHdDat', () => {
  test('only active (status A) rows produce an entry', () => {
    const hd = parseHdDat(SAMPLE_HD);
    expect(hd.get('0001')).toBe('W1AW');
    expect(hd.get('0002')).toBe('K1XYZ');
    expect(hd.get('0003')).toBeUndefined(); // Expired
  });
});

describe('FCC: joinCallsigns', () => {
  test('only active callsigns make it through, keyed by call sign', () => {
    const callsigns = joinCallsigns(parseEnDat(SAMPLE_EN), parseHdDat(SAMPLE_HD));
    expect(Object.keys(callsigns).sort()).toEqual(['K1XYZ', 'K5ORPHAN', 'W1AW']);
    expect(callsigns['N0CALL']).toBeUndefined();
  });

  test('an active HD record with no matching EN row falls back to the callsign itself', () => {
    const callsigns = joinCallsigns(parseEnDat(SAMPLE_EN), parseHdDat(SAMPLE_HD));
    expect(callsigns['K5ORPHAN']).toEqual({ name: 'K5ORPHAN', state: undefined });
  });
});

describe('FCC: unzipEnAndHd', () => {
  test('extracts EN.dat and HD.dat, ignoring other .dat files in the zip', () => {
    const zipBytes = zipSync({
      'EN.dat': strToU8(SAMPLE_EN),
      'HD.dat': strToU8(SAMPLE_HD),
      'AM.dat': strToU8('irrelevant, must be ignored'),
    });
    const { enText, hdText } = unzipEnAndHd(zipBytes);
    expect(enText).toBe(SAMPLE_EN);
    expect(hdText).toBe(SAMPLE_HD);
  });
});

// Real ISED amateur_delim.txt layout (per readme_amat_delim.txt bundled in
// the zip): callsign;first_name;surname;address;city;prov_cd;postal_code;
// qual_a;qual_b;qual_c;qual_d;qual_e;club_name;club_name_2;club_address;
// club_city;club_prov_cd;club_postal_code.
function isedLine(fields: { call: string; first?: string; surname?: string; prov?: string; clubName?: string }): string {
  const cols = new Array(18).fill('');
  cols[0] = fields.call;
  cols[1] = fields.first ?? '';
  cols[2] = fields.surname ?? '';
  cols[5] = fields.prov ?? '';
  cols[12] = fields.clubName ?? '';
  return cols.join(';');
}

const ISED_HEADER =
  'callsign;first_name;surname;address_line;city;prov_cd;postal_code;qual_a;qual_b;qual_c;qual_d;qual_e;club_name;club_name_2;club_address;club_city;club_prov_cd;club_postal_code';

const SAMPLE_ISED = [
  ISED_HEADER,
  isedLine({ call: 'VA1AA', first: 'Bill', surname: 'McFadden', prov: 'NS' }),
  isedLine({ call: 'VE3CLUB', prov: 'ON', clubName: 'Ottawa Amateur Radio Club' }),
].join('\n');

describe('ISED: parseAmateurDelim', () => {
  test('skips the header row and composes First Surname for individuals', () => {
    const callsigns = parseAmateurDelim(SAMPLE_ISED);
    expect(callsigns['VA1AA']).toEqual({ name: 'Bill McFadden', state: 'NS' });
  });

  test('uses the club name when First/Surname are blank', () => {
    const callsigns = parseAmateurDelim(SAMPLE_ISED);
    expect(callsigns['VE3CLUB']).toEqual({ name: 'Ottawa Amateur Radio Club', state: 'ON' });
  });

  test('does not produce an entry for the header row itself', () => {
    const callsigns = parseAmateurDelim(SAMPLE_ISED);
    expect(callsigns['CALLSIGN']).toBeUndefined();
  });
});

describe('ISED: parseIsedZip', () => {
  test('extracts amateur_delim.txt, ignoring other files in the zip', () => {
    const zipBytes = zipSync({
      'amateur_delim.txt': strToU8(SAMPLE_ISED),
      'readme_amat_delim.txt': strToU8('irrelevant, must be ignored'),
    });
    const callsigns = parseIsedZip(zipBytes);
    expect(callsigns['VA1AA']?.name).toBe('Bill McFadden');
  });
});
