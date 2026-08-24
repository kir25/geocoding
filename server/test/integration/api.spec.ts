import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/app.factory';
import { loadEnv } from '../../scripts/env';

/**
 * Integration tests: controller, service, repository and a real Postgres,
 * exercised together in one process.
 *
 * Boots the same app factory main.ts uses, so the global prefix and validation
 * pipe under test are the ones that ship. Requests go through Fastify's inject
 * rather than a socket — no port to allocate, no race on startup. Not
 * end-to-end: there is no browser and no network hop. Browser-level coverage
 * arrives with the UI, driven by Playwright.
 *
 * Expects the committed sample fixture to be loaded:
 *   npm run db:migrate && npm run db:ingest -- --sample
 */

let app: NestFastifyApplication;

async function get(url: string) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
}

beforeAll(async () => {
  loadEnv();
  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe('GET /api/v1/health', () => {
  it('reports the service version', async () => {
    const { status, body } = await get('/api/v1/health');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', version: '1.0.0' });
  });
});

describe('GET /api/v1/autocomplete', () => {
  it('returns city predictions for a text prefix', async () => {
    const { status, body } = await get('/api/v1/autocomplete?q=bos');

    expect(status).toBe(200);
    expect(body.status).toBe('OK');
    expect(body.predictions[0]).toEqual({
      place_id: 'us-city-MA-Boston',
      description: 'Boston, MA, USA',
    });
  });

  it('returns ZIP predictions for a numeric prefix', async () => {
    const { body } = await get('/api/v1/autocomplete?q=021');

    expect(body.predictions.map((p: any) => p.place_id)).toContain(
      'us-zip-02108',
    );
  });

  it('constrains to a state when one is given', async () => {
    const { body } = await get('/api/v1/autocomplete?q=Boston,%20MA');

    expect(body.predictions).toHaveLength(1);
    expect(body.predictions[0].description).toBe('Boston, MA, USA');
  });

  it('answers ZERO_RESULTS with a 200, not a 404', async () => {
    const { status, body } = await get('/api/v1/autocomplete?q=zzzzzzz');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ZERO_RESULTS', predictions: [] });
  });

  it.each([
    ['an empty query', '/api/v1/autocomplete?q='],
    ['a limit above the maximum', '/api/v1/autocomplete?q=bos&limit=999'],
    ['an unknown parameter', '/api/v1/autocomplete?q=bos&unexpected=1'],
  ])('rejects %s with a 400', async (_label, url) => {
    expect((await get(url)).status).toBe(400);
  });

  it('treats an injection attempt as ordinary text', async () => {
    const { status, body } = await get(
      `/api/v1/autocomplete?q=${encodeURIComponent("bos'; DROP TABLE locations;--")}`,
    );

    expect(status).toBe(200);
    expect(body.status).toBe('ZERO_RESULTS');

    // The table is still there.
    expect((await get('/api/v1/autocomplete?q=bos')).body.status).toBe('OK');
  });
});

describe('GET /api/v1/geocode', () => {
  it('resolves a ZIP place_id to coordinates and components', async () => {
    const { body } = await get('/api/v1/geocode?place_id=us-zip-02108');
    const [result] = body.results;

    expect(result.formatted_address).toBe('Boston, MA 02108, USA');
    expect(result.geometry.location.lat).toBeCloseTo(42.36, 1);
    expect(result.geometry.location.lng).toBeCloseTo(-71.06, 1);
    expect(
      result.address_components.map((c: any) => c.types[0]),
    ).toEqual(['postal_code', 'locality', 'administrative_area_level_1', 'country']);
  });

  it('resolves a city place_id to the centroid of its ZIPs', async () => {
    const { body } = await get('/api/v1/geocode?place_id=us-city-MA-Boston');

    expect(body.results[0].types).toContain('locality');
    expect(body.results[0].geometry.location.lat).toBeCloseTo(42.36, 1);
  });

  it('requires either q or place_id', async () => {
    expect((await get('/api/v1/geocode')).status).toBe(400);
  });
});

describe('GET /api/v1/reverse', () => {
  it('resolves coordinates to the nearest location with a distance', async () => {
    // A point in Jamaica Plain, which is in the sample fixture.
    const { body } = await get('/api/v1/reverse?lat=42.31&lng=-71.11');
    const [result] = body.results;

    expect(result.formatted_address).toContain('MA');
    expect(result.distance_meters).toBeTypeOf('number');
    expect(result.distance_meters).toBeLessThan(100_000);
  });

  it('reports ZERO_RESULTS far outside the dataset', async () => {
    // Mid-Atlantic. Nearest-centroid would otherwise answer confidently with a
    // location thousands of kilometres away.
    const { status, body } = await get('/api/v1/reverse?lat=0&lng=0');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ZERO_RESULTS', results: [] });
  });

  it.each([
    ['latitude out of range', '/api/v1/reverse?lat=99&lng=-71'],
    ['longitude out of range', '/api/v1/reverse?lat=42&lng=-999'],
    ['a non-numeric latitude', '/api/v1/reverse?lat=north&lng=-71'],
    ['missing coordinates', '/api/v1/reverse'],
  ])('rejects %s with a 400', async (_label, url) => {
    expect((await get(url)).status).toBe(400);
  });
});
