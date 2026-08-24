/**
 * Parsing and validation for the GeoNames postal-code export.
 *
 * Split out from the ingest script so the rules can be tested directly: the
 * script around it is file and database I/O, this is the part with decisions in
 * it.
 */

/** Tab-separated column positions in the GeoNames postal-code export. */
const COL = {
  postalCode: 1,
  placeName: 2,
  adminName1: 3,
  adminCode1: 4,
  latitude: 9,
  longitude: 10,
} as const;

export interface Row {
  zip: string;
  city: string;
  stateCode: string;
  stateName: string;
  lat: number;
  lng: number;
}

export type SkipReason = 'malformed' | 'no_state_code' | 'bad_coordinates';

/**
 * Returns a skip reason rather than null so the run summary can explain losses.
 * ~511 US rows are APO/FPO military mail codes with no state code: they are
 * routing identifiers, not places, so they are excluded deliberately.
 */
export function parseLine(line: string): Row | SkipReason {
  const cols = line.split('\t');
  if (cols.length < 11) return 'malformed';

  const zip = cols[COL.postalCode]?.trim();
  const city = cols[COL.placeName]?.trim();
  const stateCode = cols[COL.adminCode1]?.trim();
  const stateName = cols[COL.adminName1]?.trim();
  const lat = toNumber(cols[COL.latitude]);
  const lng = toNumber(cols[COL.longitude]);

  if (!zip || !city) return 'malformed';
  if (!stateCode || stateCode.length !== 2) return 'no_state_code';
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'bad_coordinates';
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'bad_coordinates';

  return { zip, city, stateCode, stateName: stateName || stateCode, lat, lng };
}

/**
 * Number('') is 0, not NaN — so a blank coordinate column would otherwise pass
 * every range check and silently place the row at 0,0 in the Gulf of Guinea.
 * Blank input is missing data, not a valid zero.
 */
function toNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return Number.NaN;
  return Number(value);
}
