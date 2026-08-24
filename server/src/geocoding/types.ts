/**
 * Response shapes modelled on the Google Geocoding API: a status enum plus a
 * results array, so a caller distinguishes "no match" from "bad request"
 * without inspecting the HTTP status alone.
 */

export type GeocodeStatus = 'OK' | 'ZERO_RESULTS' | 'INVALID_REQUEST';

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  place_id: string;
  formatted_address: string;
  address_components: AddressComponent[];
  geometry: { location: LatLng };
  types: string[];
  /** Present on reverse lookups only: how far the match is from the query point. */
  distance_meters?: number;
}

export interface GeocodeResponse {
  status: GeocodeStatus;
  results: GeocodeResult[];
}

/**
 * Autocomplete returns predictions rather than full results: it fires on every
 * keystroke, so the payload stays minimal and the client asks for the full
 * record only once the user commits to a choice.
 */
export interface Prediction {
  place_id: string;
  description: string;
}

export interface AutocompleteResponse {
  status: GeocodeStatus;
  predictions: Prediction[];
}

/** A row of `locations`, as returned by the repository. */
export interface LocationRow {
  zip: string;
  city: string;
  state_code: string;
  state_name: string;
  lat: number;
  lng: number;
  distance_meters?: number;
}

/**
 * A city aggregated across its ZIPs: centroid coordinates plus the ZIP count
 * used as a prominence proxy when ranking autocomplete results.
 */
export interface CityRow {
  city: string;
  state_code: string;
  state_name: string;
  zip: string;
  zip_count: number;
  lat: number;
  lng: number;
}
