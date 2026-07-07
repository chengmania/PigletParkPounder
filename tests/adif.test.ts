import { describe, expect, test } from 'bun:test';
import { groupForSubmission, toAdifLog, toPersonalAdifLog } from '../src/shared/export/adif.ts';
import { makeQso } from './fixtures.ts';

describe('toAdifLog', () => {
  test('emits a header and one EOR-terminated record per QSO', () => {
    const qsos = [makeQso({ call: 'W2ABC', band: '20m', mode: 'SSB', ts: '2026-05-13T22:58:00.000Z' })];
    const adif = toAdifLog(qsos, 'W1CLUB');
    expect(adif).toContain('<EOH>');
    expect(adif).toContain('<CALL:5>W2ABC');
    expect(adif).toContain('<QSO_DATE:8>20260513');
    expect(adif).toContain('<TIME_ON:6>225800');
    expect(adif).toContain('<BAND:3>20M');
    expect(adif).toContain('<MODE:3>SSB');
    expect(adif).toContain('<STATION_CALLSIGN:6>W1CLUB');
    expect(adif).toContain('<OPERATOR:4>W1OP');
    expect(adif).toContain('<MY_SIG:4>POTA');
    expect(adif).toContain('<MY_SIG_INFO:6>K-1234');
    expect(adif).toContain('<EOR>');
  });

  test('includes SIG/SIG_INFO only for a park-to-park QSO', () => {
    const p2p = toAdifLog([makeQso({ theirPark: 'K-9999' })], 'W1CLUB');
    expect(p2p).toContain('<SIG:4>POTA');
    expect(p2p).toContain('<SIG_INFO:6>K-9999');

    const notP2p = toAdifLog([makeQso()], 'W1CLUB');
    expect(notP2p).not.toContain('<SIG:4>POTA');
    expect(notP2p).not.toContain('<SIG_INFO:');
  });

  test('excludes deleted and dupe-flagged QSOs', () => {
    const adif = toAdifLog([makeQso({ deleted: true }), makeQso({ dupe: true })], 'W1CLUB');
    expect(adif).not.toContain('<EOR>');
  });

  test('sorts records chronologically', () => {
    const qsos = [
      makeQso({ call: 'W2LATE', ts: '2026-05-13T23:00:00.000Z' }),
      makeQso({ call: 'W3EARLY', ts: '2026-05-13T20:00:00.000Z' }),
    ];
    const adif = toAdifLog(qsos, 'W1CLUB');
    expect(adif.indexOf('W3EARLY')).toBeLessThan(adif.indexOf('W2LATE'));
  });
});

describe('toPersonalAdifLog', () => {
  test('includes only the given operator\'s QSOs', () => {
    const qsos = [makeQso({ call: 'W2ABC', operatorCall: 'W1OP' }), makeQso({ call: 'W3DEF', operatorCall: 'W2OP' })];
    const adif = toPersonalAdifLog(qsos, 'W1CLUB', 'W1OP');
    expect(adif).toContain('W2ABC');
    expect(adif).not.toContain('W3DEF');
  });

  test('keeps STATION_CALLSIGN/OPERATOR/RST/STATE but omits POTA SIG fields entirely', () => {
    const adif = toPersonalAdifLog([makeQso({ operatorCall: 'W1OP', theirPark: 'K-9999', theirState: 'FL' })], 'W1CLUB', 'W1OP');
    expect(adif).toContain('<STATION_CALLSIGN:6>W1CLUB');
    expect(adif).toContain('<OPERATOR:4>W1OP');
    expect(adif).toContain('<RST_SENT:');
    expect(adif).toContain('<STATE:2>FL');
    expect(adif).not.toContain('MY_SIG');
    expect(adif).not.toContain('<SIG:');
    expect(adif).not.toContain('SIG_INFO');
  });

  test('still excludes deleted and dupe-flagged QSOs', () => {
    const adif = toPersonalAdifLog(
      [makeQso({ operatorCall: 'W1OP', deleted: true }), makeQso({ operatorCall: 'W1OP', dupe: true })],
      'W1CLUB',
      'W1OP',
    );
    expect(adif).not.toContain('<EOR>');
  });
});

describe('groupForSubmission', () => {
  test('splits QSOs into one group per (park, state, UTC day), named per the guide\'s convention', () => {
    const qsos = [
      makeQso({ myPark: 'K-1234', myState: 'PA', ts: '2026-05-13T20:00:00.000Z' }),
      makeQso({ myPark: 'K-1234', myState: 'PA', ts: '2026-05-13T21:00:00.000Z' }),
      makeQso({ myPark: 'K-5678', myState: 'NY', ts: '2026-05-13T20:00:00.000Z' }),
      makeQso({ myPark: 'K-1234', myState: 'PA', ts: '2026-05-14T20:00:00.000Z' }),
    ];
    const groups = groupForSubmission(qsos, 'W1CLUB');
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.filename)).toContain('W1CLUB@K-1234-20260513.adi');
    expect(groups.map((g) => g.filename)).toContain('W1CLUB@K-5678-20260513.adi');
    expect(groups.map((g) => g.filename)).toContain('W1CLUB@K-1234-20260514.adi');

    const firstGroup = groups.find((g) => g.filename === 'W1CLUB@K-1234-20260513.adi')!;
    expect((firstGroup.content.match(/<EOR>/g) ?? []).length).toBe(2);
  });

  test('excludes deleted/dupe QSOs from grouping', () => {
    const qsos = [makeQso({ deleted: true }), makeQso({ dupe: true })];
    expect(groupForSubmission(qsos, 'W1CLUB')).toEqual([]);
  });

  test('disambiguates filenames when the same park+day splits by state (a park crossing state lines)', () => {
    const qsos = [
      makeQso({ myPark: 'K-1234', myState: 'PA', ts: '2026-05-13T20:00:00.000Z' }),
      makeQso({ myPark: 'K-1234', myState: 'NY', ts: '2026-05-13T20:00:00.000Z' }),
    ];
    const groups = groupForSubmission(qsos, 'W1CLUB');
    expect(groups).toHaveLength(2);
    const filenames = groups.map((g) => g.filename);
    expect(new Set(filenames).size).toBe(2);
    expect(filenames).toContain('W1CLUB@K-1234-20260513-PA.adi');
    expect(filenames).toContain('W1CLUB@K-1234-20260513-NY.adi');
  });
});
