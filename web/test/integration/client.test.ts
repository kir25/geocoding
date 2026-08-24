import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { autocomplete, geocodePlaceId, reverseGeocode } from '../../src/api/client';
import { lastRequest } from '../support/handlers';
import { server } from '../support/msw';

/**
 * The client's own contract with the API, exercised over real fetch with MSW
 * at the network boundary. The component suite mocks this module out entirely,
 * so without these the request building and response handling are never run.
 */

describe('autocomplete', () => {
  it('sends the query and a limit', async () => {
    await autocomplete('bos');

    expect(lastRequest().params.get('q')).toBe('bos');
    expect(lastRequest().params.get('limit')).toBe('8');
  });

  it('escapes characters that would otherwise change the query string', async () => {
    await autocomplete('a&b#c');

    // Unescaped, "&" would start a new parameter and "#" would truncate the
    // URL — the server would receive "a" and never report the difference.
    expect(lastRequest().url).toContain('q=a%26b%23c');
    expect(lastRequest().params.get('q')).toBe('a&b#c');
  });

  it('returns the parsed envelope, ZERO_RESULTS included', async () => {
    await expect(autocomplete('zzzz')).resolves.toEqual({
      status: 'ZERO_RESULTS',
      predictions: [],
    });
  });

  it('rejects on a non-2xx rather than returning a half-read body', async () => {
    server.use(
      http.get('*/api/v1/autocomplete', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    await expect(autocomplete('bos')).rejects.toThrow('request failed: 500');
  });

  it('rejects when the request is aborted', async () => {
    const controller = new AbortController();
    const pending = autocomplete('bos', controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow();
  });
});

describe('geocodePlaceId', () => {
  it('unwraps the first result', async () => {
    const result = await geocodePlaceId('us-city-MA-Boston');

    expect(result?.formatted_address).toBe('Boston, MA, USA');
    expect(result?.geometry.location).toEqual({ lat: 42.3523, lng: -71.0387 });
  });

  it('returns null for ZERO_RESULTS instead of throwing', async () => {
    await expect(geocodePlaceId('us-city-XX-Nowhere')).resolves.toBeNull();
  });

  it('escapes a place_id containing a space', async () => {
    await geocodePlaceId('us-city-LA-Bossier City');

    expect(lastRequest().url).toContain('place_id=us-city-LA-Bossier%20City');
  });
});

describe('reverseGeocode', () => {
  it('sends latitude and longitude in the documented order', async () => {
    await reverseGeocode(42.31, -71.11);

    // ST_MakePoint takes longitude first inside the database, which makes this
    // a standing candidate for a transposition; the HTTP contract is lat, lng.
    expect(lastRequest().params.get('lat')).toBe('42.31');
    expect(lastRequest().params.get('lng')).toBe('-71.11');
  });

  it('returns the nearest result with its distance', async () => {
    const result = await reverseGeocode(42.31, -71.11);

    expect(result?.formatted_address).toBe('Jamaica Plain, MA 02130, USA');
    expect(result?.distance_meters).toBe(314);
  });

  it('returns null when the point is outside the dataset', async () => {
    await expect(reverseGeocode(0, 0)).resolves.toBeNull();
  });
});
