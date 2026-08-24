import { Injectable } from '@nestjs/common';
import { GeocodingRepository } from './geocoding.repository';
import type {
  AutocompleteResponse,
  CityRow,
  GeocodeResponse,
  GeocodeResult,
  LocationRow,
  Prediction,
} from './types';

/** What the user's raw input appears to be. */
type ParsedQuery =
  | { kind: 'zip'; zip: string }
  | { kind: 'zip_prefix'; prefix: string }
  | { kind: 'city'; prefix: string }
  | { kind: 'city_state'; prefix: string; stateCode: string };

/**
 * Beyond this, "nearest ZIP centroid" stops being a useful answer: clicking the
 * mid-Atlantic would otherwise resolve confidently to Eastport, ME, 8,219 km
 * away. Real geocoders return ZERO_RESULTS there. Generous enough for sparse
 * rural ZIPs in Alaska and Nevada, where centroids are genuinely far apart.
 */
const MAX_REVERSE_DISTANCE_METERS = 100_000;

const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP',
]);

@Injectable()
export class GeocodingService {
  constructor(private readonly repo: GeocodingRepository) {}

  /**
   * Classifies raw input so each shape hits the index built for it.
   * Real geocoders do far more here; this covers the shapes this dataset holds.
   */
  parseQuery(raw: string): ParsedQuery {
    const q = raw.trim();

    // "Boston, MA" — split on the comma and keep the state only if it is real,
    // so "Springfield, Sprin" degrades to a plain city search rather than 400ing.
    const comma = q.indexOf(',');
    if (comma > 0) {
      const city = q.slice(0, comma).trim();
      const state = q.slice(comma + 1).trim().toUpperCase();
      if (city && US_STATE_CODES.has(state)) {
        return { kind: 'city_state', prefix: city, stateCode: state };
      }
    }

    if (/^\d+$/.test(q)) {
      return q.length === 5
        ? { kind: 'zip', zip: q }
        : { kind: 'zip_prefix', prefix: q };
    }

    return { kind: 'city', prefix: q };
  }

  /** Resolves free text to either city-level or ZIP-level rows. */
  private async lookup(
    raw: string,
    limit: number,
  ): Promise<{ cities: CityRow[]; zips: LocationRow[] }> {
    const parsed = this.parseQuery(raw);

    switch (parsed.kind) {
      case 'zip': {
        const row = await this.repo.findByZip(parsed.zip);
        return { cities: [], zips: row ? [row] : [] };
      }
      case 'zip_prefix':
        return {
          cities: [],
          zips: await this.repo.findByZipPrefix(parsed.prefix, limit),
        };
      case 'city_state':
        return {
          cities: await this.repo.findCitiesByPrefixAndState(
            parsed.prefix,
            parsed.stateCode,
            limit,
          ),
          zips: [],
        };
      case 'city':
        return {
          cities: await this.repo.findCitiesByPrefix(parsed.prefix, limit),
          zips: [],
        };
    }
  }

  async autocomplete(q: string, limit: number): Promise<AutocompleteResponse> {
    const { cities, zips } = await this.lookup(q, limit);

    const predictions: Prediction[] = [
      ...cities.map((row) => ({
        place_id: cityPlaceId(row),
        description: formatCity(row),
      })),
      ...zips.map((row) => ({
        place_id: zipPlaceId(row.zip),
        description: formatAddress(row),
      })),
    ];

    return {
      status: predictions.length ? 'OK' : 'ZERO_RESULTS',
      predictions,
    };
  }

  async geocode(params: {
    q?: string;
    placeId?: string;
    limit: number;
  }): Promise<GeocodeResponse> {
    if (params.placeId) {
      const results = await this.resolvePlaceId(params.placeId);
      return { status: results.length ? 'OK' : 'ZERO_RESULTS', results };
    }

    const { cities, zips } = await this.lookup(params.q ?? '', params.limit);
    const results = [...cities.map(cityToResult), ...zips.map(toResult)];

    return { status: results.length ? 'OK' : 'ZERO_RESULTS', results };
  }

  /** place_id is opaque by contract but encodes which lookup to run. */
  private async resolvePlaceId(id: string): Promise<GeocodeResult[]> {
    const zip = parseZipPlaceId(id);
    if (zip) {
      const row = await this.repo.findByZip(zip);
      return row ? [toResult(row)] : [];
    }

    const city = parseCityPlaceId(id);
    if (city) {
      const row = await this.repo.findCity(city.name, city.stateCode);
      return row ? [cityToResult(row)] : [];
    }

    return [];
  }

  async reverse(lat: number, lng: number): Promise<GeocodeResponse> {
    const row = await this.repo.findNearest(lat, lng);

    const withinRange =
      row !== null &&
      Number(row.distance_meters ?? Infinity) <= MAX_REVERSE_DISTANCE_METERS;

    return {
      status: withinRange ? 'OK' : 'ZERO_RESULTS',
      results: withinRange ? [toResult(row)] : [],
    };
  }
}

/**
 * Stable, human-readable identifiers. Opaque to the client by contract, but
 * two kinds exist: a single ZIP, or a city aggregated across its ZIPs.
 */
function zipPlaceId(zip: string): string {
  return `us-zip-${zip}`;
}

function cityPlaceId(row: CityRow): string {
  return `us-city-${row.state_code}-${row.city}`;
}

function parseZipPlaceId(id: string): string | null {
  const match = /^us-zip-(\d{5})$/.exec(id);
  return match ? match[1] : null;
}

function parseCityPlaceId(
  id: string,
): { stateCode: string; name: string } | null {
  const match = /^us-city-([A-Z]{2})-(.+)$/.exec(id);
  return match ? { stateCode: match[1], name: match[2] } : null;
}

function formatCity(row: CityRow): string {
  return `${row.city}, ${row.state_code}, USA`;
}

function formatAddress(row: LocationRow): string {
  return `${row.city}, ${row.state_code} ${row.zip}, USA`;
}

function toResult(row: LocationRow): GeocodeResult {
  const result: GeocodeResult = {
    place_id: zipPlaceId(row.zip),
    formatted_address: formatAddress(row),
    address_components: [
      { long_name: row.zip, short_name: row.zip, types: ['postal_code'] },
      { long_name: row.city, short_name: row.city, types: ['locality', 'political'] },
      {
        long_name: row.state_name,
        short_name: row.state_code,
        types: ['administrative_area_level_1', 'political'],
      },
      { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
    ],
    geometry: {
      // pg returns numerics as strings; ST_X/ST_Y come back as float8 but coerce
      // defensively so the JSON contract is always numbers.
      location: { lat: Number(row.lat), lng: Number(row.lng) },
    },
    types: ['postal_code'],
  };

  if (row.distance_meters !== undefined) {
    result.distance_meters = Math.round(Number(row.distance_meters));
  }

  return result;
}

/** A city result carries no postal_code component — it spans many ZIPs. */
function cityToResult(row: CityRow): GeocodeResult {
  return {
    place_id: cityPlaceId(row),
    formatted_address: formatCity(row),
    address_components: [
      { long_name: row.city, short_name: row.city, types: ['locality', 'political'] },
      {
        long_name: row.state_name,
        short_name: row.state_code,
        types: ['administrative_area_level_1', 'political'],
      },
      { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
    ],
    geometry: { location: { lat: Number(row.lat), lng: Number(row.lng) } },
    types: ['locality', 'political'],
  };
}
