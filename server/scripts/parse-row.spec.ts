import { describe, expect, it } from 'vitest';
import { parseLine } from './parse-row';

/** A real line from the GeoNames US export. */
const BOSTON =
  'US\t02108\tBoston\tMassachusetts\tMA\tSuffolk\t025\t\t\t42.3583\t-71.0603\t4';

/** A real APO line: the AA/AE/AP designator sits in the place name, not the state column. */
const APO = 'US\t09001\tAPO AA\t\t\t\t\t\t\t34.0522\t-118.2437\t4';

function cols(line: string): string[] {
  return line.split('\t');
}

function withCol(line: string, index: number, value: string): string {
  const parts = cols(line);
  parts[index] = value;
  return parts.join('\t');
}

describe('parseLine', () => {
  it('maps the columns this ingest actually uses', () => {
    expect(parseLine(BOSTON)).toEqual({
      zip: '02108',
      city: 'Boston',
      stateCode: 'MA',
      stateName: 'Massachusetts',
      lat: 42.3583,
      lng: -71.0603,
    });
  });

  it('skips APO/FPO rows, which carry no state code', () => {
    expect(parseLine(APO)).toBe('no_state_code');
  });

  it('rejects a row with too few columns', () => {
    expect(parseLine('US\t02108\tBoston')).toBe('malformed');
  });

  it.each([
    ['latitude above 90', 9, '91'],
    ['latitude below -90', 9, '-91'],
    ['longitude above 180', 10, '181'],
    ['longitude below -180', 10, '-181'],
    ['non-numeric latitude', 9, 'north'],
    ['empty longitude', 10, ''],
  ])('rejects %s', (_label, index, value) => {
    expect(parseLine(withCol(BOSTON, index, value))).toBe('bad_coordinates');
  });

  it.each([
    ['a missing zip', 1],
    ['a missing city', 2],
  ])('rejects %s', (_label, index) => {
    expect(parseLine(withCol(BOSTON, index, ''))).toBe('malformed');
  });

  it('rejects a state code that is not two characters', () => {
    expect(parseLine(withCol(BOSTON, 4, 'MASS'))).toBe('no_state_code');
  });

  it('accepts the boundary coordinates rather than rejecting them', () => {
    const atPole = withCol(withCol(BOSTON, 9, '90'), 10, '180');
    expect(parseLine(atPole)).toMatchObject({ lat: 90, lng: 180 });
  });

  it('trims surrounding whitespace from text columns', () => {
    const padded = withCol(withCol(BOSTON, 2, '  Boston  '), 4, ' MA ');
    expect(parseLine(padded)).toMatchObject({ city: 'Boston', stateCode: 'MA' });
  });

  it('falls back to the state code when the full state name is absent', () => {
    expect(parseLine(withCol(BOSTON, 3, ''))).toMatchObject({
      stateName: 'MA',
    });
  });
});
