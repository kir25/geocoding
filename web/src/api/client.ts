import type {
  AutocompleteResponse,
  GeocodeResponse,
  GeocodeResult,
} from './types';

/**
 * Relative by default: the dev server proxies /api to the backend, so the
 * browser stays on one origin and CORS never applies.
 */
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });

  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function autocomplete(
  query: string,
  signal?: AbortSignal,
): Promise<AutocompleteResponse> {
  return get(`/autocomplete?q=${encodeURIComponent(query)}&limit=8`, signal);
}

/** Resolves a chosen prediction to coordinates. */
export async function geocodePlaceId(
  placeId: string,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const res = await get<GeocodeResponse>(
    `/geocode?place_id=${encodeURIComponent(placeId)}`,
    signal,
  );
  return res.results[0] ?? null;
}

/**
 * Resolves a point to the nearest known location. Returns null for
 * ZERO_RESULTS — the API reports "nothing near here" as a successful response,
 * not an error, and the UI treats it the same way.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const res = await get<GeocodeResponse>(
    `/reverse?lat=${lat}&lng=${lng}`,
    signal,
  );
  return res.results[0] ?? null;
}
