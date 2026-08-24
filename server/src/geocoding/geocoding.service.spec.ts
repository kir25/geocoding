import { describe, expect, it, vi } from 'vitest';
import { GeocodingService } from './geocoding.service';
import type { GeocodingRepository } from './geocoding.repository';
import type { CityRow, LocationRow } from './types';

const BOSTON_ZIP: LocationRow = {
  zip: '02101',
  city: 'Boston',
  state_code: 'MA',
  state_name: 'Massachusetts',
  lat: 42.3601,
  lng: -71.0589,
};

const BOSTON_CITY: CityRow = {
  city: 'Boston',
  state_code: 'MA',
  state_name: 'Massachusetts',
  zip: '02101',
  zip_count: 36,
  lat: 42.3523,
  lng: -71.0387,
};

function makeService(overrides: Partial<GeocodingRepository> = {}) {
  const repo = {
    findByZip: vi.fn().mockResolvedValue(null),
    findByZipPrefix: vi.fn().mockResolvedValue([]),
    findCitiesByPrefix: vi.fn().mockResolvedValue([]),
    findCitiesByPrefixAndState: vi.fn().mockResolvedValue([]),
    findCity: vi.fn().mockResolvedValue(null),
    findNearest: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GeocodingRepository;

  return { service: new GeocodingService(repo), repo };
}

describe('parseQuery', () => {
  const { service } = makeService();

  it.each([
    ['02101', { kind: 'zip', zip: '02101' }],
    ['021', { kind: 'zip_prefix', prefix: '021' }],
    ['bos', { kind: 'city', prefix: 'bos' }],
    ['Boston, MA', { kind: 'city_state', prefix: 'Boston', stateCode: 'MA' }],
    ['boston, ma', { kind: 'city_state', prefix: 'boston', stateCode: 'MA' }],
  ])('classifies %j', (input, expected) => {
    expect(service.parseQuery(input)).toEqual(expected);
  });

  it('falls back to a city search when the text after the comma is not a state', () => {
    // "Springfield, Sprin" should degrade rather than 400 — the user is mid-typing.
    expect(service.parseQuery('Springfield, Sprin')).toEqual({
      kind: 'city',
      prefix: 'Springfield, Sprin',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(service.parseQuery('  bos  ')).toEqual({ kind: 'city', prefix: 'bos' });
  });
});

describe('autocomplete', () => {
  it('routes a numeric query to the ZIP index, not the city index', async () => {
    const { service, repo } = makeService({
      findByZipPrefix: vi.fn().mockResolvedValue([BOSTON_ZIP]),
    });

    const res = await service.autocomplete('021', 10);

    expect(repo.findByZipPrefix).toHaveBeenCalledWith('021', 10);
    expect(repo.findCitiesByPrefix).not.toHaveBeenCalled();
    expect(res.predictions[0]).toEqual({
      place_id: 'us-zip-02101',
      description: 'Boston, MA 02101, USA',
    });
  });

  it('returns city-level predictions for a text query', async () => {
    const { service } = makeService({
      findCitiesByPrefix: vi.fn().mockResolvedValue([BOSTON_CITY]),
    });

    const res = await service.autocomplete('bos', 10);

    expect(res.status).toBe('OK');
    expect(res.predictions).toEqual([
      { place_id: 'us-city-MA-Boston', description: 'Boston, MA, USA' },
    ]);
  });

  it('reports ZERO_RESULTS rather than an error when nothing matches', async () => {
    const { service } = makeService();
    const res = await service.autocomplete('zzzzz', 10);

    expect(res.status).toBe('ZERO_RESULTS');
    expect(res.predictions).toEqual([]);
  });
});

describe('geocode by place_id', () => {
  it('resolves a ZIP id', async () => {
    const { service, repo } = makeService({
      findByZip: vi.fn().mockResolvedValue(BOSTON_ZIP),
    });

    const res = await service.geocode({ placeId: 'us-zip-02101', limit: 10 });

    expect(repo.findByZip).toHaveBeenCalledWith('02101');
    expect(res.results[0].formatted_address).toBe('Boston, MA 02101, USA');
  });

  it('resolves a city id, including names containing a space', async () => {
    const { service, repo } = makeService({
      findCity: vi.fn().mockResolvedValue(BOSTON_CITY),
    });

    await service.geocode({ placeId: 'us-city-LA-Bossier City', limit: 10 });

    expect(repo.findCity).toHaveBeenCalledWith('Bossier City', 'LA');
  });

  it('returns ZERO_RESULTS for a malformed place_id', async () => {
    const { service } = makeService();
    const res = await service.geocode({ placeId: 'nonsense', limit: 10 });

    expect(res.status).toBe('ZERO_RESULTS');
  });
});

describe('reverse', () => {
  it('returns the nearest location with a rounded distance', async () => {
    const { service, repo } = makeService({
      findNearest: vi
        .fn()
        .mockResolvedValue({ ...BOSTON_ZIP, distance_meters: 313.7 }),
    });

    const res = await service.reverse(42.31, -71.11);

    // lng before lat: ST_MakePoint takes x (longitude) first.
    expect(repo.findNearest).toHaveBeenCalledWith(42.31, -71.11);
    expect(res.status).toBe('OK');
    expect(res.results[0].distance_meters).toBe(314);
  });

  it('returns ZERO_RESULTS when the nearest match is implausibly far', async () => {
    // Clicking the mid-Atlantic finds Eastport, ME 8,219 km away — a real
    // geocoder reports no result rather than answering confidently.
    const { service } = makeService({
      findNearest: vi
        .fn()
        .mockResolvedValue({ ...BOSTON_ZIP, distance_meters: 8_219_000 }),
    });

    const res = await service.reverse(0, 0);

    expect(res.status).toBe('ZERO_RESULTS');
    expect(res.results).toEqual([]);
  });

  it('accepts a match just inside the radius bound', async () => {
    const { service } = makeService({
      findNearest: vi
        .fn()
        .mockResolvedValue({ ...BOSTON_ZIP, distance_meters: 99_999 }),
    });

    expect((await service.reverse(39.5, -117)).status).toBe('OK');
  });
});
