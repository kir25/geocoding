import { http, HttpResponse } from 'msw';

/**
 * Stands in for the API at the network boundary, reproducing its contract:
 * the status envelope, the two place_id kinds, and ZERO_RESULTS as a 200.
 *
 * Handlers assert on the request itself, so a change to how the client builds
 * a URL — a dropped encodeURIComponent, a renamed query param — shows up as a
 * failing test rather than a silently empty result.
 */

const BOSTON_CITY = {
  place_id: 'us-city-MA-Boston',
  formatted_address: 'Boston, MA, USA',
  address_components: [
    { long_name: 'Boston', short_name: 'Boston', types: ['locality', 'political'] },
    {
      long_name: 'Massachusetts',
      short_name: 'MA',
      types: ['administrative_area_level_1', 'political'],
    },
    { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
  ],
  geometry: { location: { lat: 42.3523, lng: -71.0387 } },
  types: ['locality', 'political'],
};

const JAMAICA_PLAIN = {
  place_id: 'us-zip-02130',
  formatted_address: 'Jamaica Plain, MA 02130, USA',
  address_components: [
    { long_name: '02130', short_name: '02130', types: ['postal_code'] },
  ],
  geometry: { location: { lat: 42.3098, lng: -71.1147 } },
  types: ['postal_code'],
  distance_meters: 314,
};

/** Records what the client actually sent, for assertions in the tests. */
export const requestLog: { url: string; params: URLSearchParams }[] = [];

export function lastRequest() {
  return requestLog[requestLog.length - 1];
}

function record(url: string) {
  const parsed = new URL(url);
  requestLog.push({ url, params: parsed.searchParams });
  return parsed.searchParams;
}

export const handlers = [
  http.get('*/api/v1/autocomplete', ({ request }) => {
    const params = record(request.url);
    const q = params.get('q') ?? '';

    if (q.toLowerCase().startsWith('bos')) {
      return HttpResponse.json({
        status: 'OK',
        predictions: [
          { place_id: 'us-city-MA-Boston', description: 'Boston, MA, USA' },
          {
            place_id: 'us-city-LA-Bossier City',
            description: 'Bossier City, LA, USA',
          },
        ],
      });
    }

    return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
  }),

  http.get('*/api/v1/geocode', ({ request }) => {
    const params = record(request.url);

    return params.get('place_id') === 'us-city-MA-Boston'
      ? HttpResponse.json({ status: 'OK', results: [BOSTON_CITY] })
      : HttpResponse.json({ status: 'ZERO_RESULTS', results: [] });
  }),

  http.get('*/api/v1/reverse', ({ request }) => {
    const params = record(request.url);
    const lat = Number(params.get('lat'));

    // Mirrors the server's 100 km bound: outside the dataset is ZERO_RESULTS,
    // not an error.
    return Math.abs(lat) < 1
      ? HttpResponse.json({ status: 'ZERO_RESULTS', results: [] })
      : HttpResponse.json({ status: 'OK', results: [JAMAICA_PLAIN] });
  }),
];
