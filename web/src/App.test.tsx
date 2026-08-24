import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { GeocodeResult } from './api/types';

vi.mock('./api/client', () => ({
  autocomplete: vi.fn(),
  geocodePlaceId: vi.fn(),
  reverseGeocode: vi.fn(),
}));

/**
 * Leaflet needs a laid-out DOM that jsdom does not provide, and the map itself
 * is not what these tests are about. The stub exposes the same props as a
 * button, so a click on it is a click on the map.
 */
vi.mock('./components/MapView', () => ({
  MapView: ({
    selected,
    onMapClick,
  }: {
    selected: GeocodeResult | null;
    onMapClick: (lat: number, lng: number) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onMapClick(42.31, -71.11)}>
        map
      </button>
      <span data-testid="marker">
        {selected ? selected.formatted_address : 'none'}
      </span>
    </div>
  ),
}));

const { autocomplete, geocodePlaceId, reverseGeocode } = await import(
  './api/client'
);

const BOSTON = {
  place_id: 'us-city-MA-Boston',
  formatted_address: 'Boston, MA, USA',
  geometry: { location: { lat: 42.3523, lng: -71.0387 } },
} as GeocodeResult;

const JAMAICA_PLAIN = {
  place_id: 'us-zip-02130',
  formatted_address: 'Jamaica Plain, MA 02130, USA',
  geometry: { location: { lat: 42.3098, lng: -71.1147 } },
  distance_meters: 314,
} as GeocodeResult;

beforeEach(() => {
  vi.mocked(autocomplete).mockReset();
  vi.mocked(geocodePlaceId).mockReset();
  vi.mocked(reverseGeocode).mockReset();

  vi.mocked(autocomplete).mockResolvedValue({
    status: 'OK',
    predictions: [
      { place_id: 'us-city-MA-Boston', description: 'Boston, MA, USA' },
    ],
  });
  vi.mocked(geocodePlaceId).mockResolvedValue(BOSTON);
  vi.mocked(reverseGeocode).mockResolvedValue(JAMAICA_PLAIN);
});

describe('App', () => {
  it('prompts for either interaction before anything is selected', () => {
    render(<App />);

    expect(
      screen.getByText('Search for a place, or click anywhere on the map'),
    ).toBeInTheDocument();
  });

  it('moves the map when a suggestion is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await user.click(await screen.findByText('Boston, MA, USA'));

    await waitFor(() =>
      expect(screen.getByTestId('marker')).toHaveTextContent('Boston, MA, USA'),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Boston, MA, USA · 42.3523, -71.0387',
    );
  });

  it('fills the search field from a map click', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveValue(
        'Jamaica Plain, MA 02130, USA',
      ),
    );
    expect(reverseGeocode).toHaveBeenCalledWith(
      42.31,
      -71.11,
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId('marker')).toHaveTextContent('Jamaica Plain');
  });

  it('does not search for the address a map click wrote back', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveValue(
        'Jamaica Plain, MA 02130, USA',
      ),
    );

    // Looking this up would spend a request resolving what was just resolved,
    // and reopen a dropdown the user never asked for.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(autocomplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('lets a map click replace an earlier selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await user.click(await screen.findByText('Boston, MA, USA'));
    await waitFor(() =>
      expect(screen.getByTestId('marker')).toHaveTextContent('Boston'),
    );

    await user.click(screen.getByRole('button', { name: 'map' }));

    await waitFor(() =>
      expect(screen.getByTestId('marker')).toHaveTextContent('Jamaica Plain'),
    );
  });

  it('reports a click outside the dataset as no location, not an error', async () => {
    // The API bounds reverse lookups, so a click in open ocean is a legitimate
    // ZERO_RESULTS rather than a failure.
    vi.mocked(reverseGeocode).mockResolvedValue(null);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    expect(
      await screen.findByText('No known location near that point'),
    ).toBeInTheDocument();
  });

  it('surfaces a failed lookup', async () => {
    vi.mocked(reverseGeocode).mockRejectedValue(new Error('network'));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    expect(await screen.findByText('Lookup failed')).toBeInTheDocument();
  });

  it('ignores an aborted lookup rather than showing an error', async () => {
    // A second click aborts the first; the abort must not surface as a failure.
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    vi.mocked(reverseGeocode).mockRejectedValue(abort);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('Lookup failed')).not.toBeInTheDocument();
  });
});
