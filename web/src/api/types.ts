/** Mirrors the server's response contract (server/src/geocoding/types.ts). */

export type GeocodeStatus = 'OK' | 'ZERO_RESULTS' | 'INVALID_REQUEST';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GeocodeResult {
  place_id: string;
  formatted_address: string;
  address_components: AddressComponent[];
  geometry: { location: LatLng };
  types: string[];
  distance_meters?: number;
}

export interface Prediction {
  place_id: string;
  description: string;
}

export interface AutocompleteResponse {
  status: GeocodeStatus;
  predictions: Prediction[];
}

export interface GeocodeResponse {
  status: GeocodeStatus;
  results: GeocodeResult[];
}
