import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { lastRequest, requestLog } from './test/handlers';
import { server } from './test/msw';
import type { GeocodeResult } from './api/types';

/**
 * The real component tree over the real API client and real fetch, with MSW
 * intercepting at the network boundary. Nothing in src/api is mocked, so these
 * cover the layer the component tests skip: how requests are built and how
 * responses are read.
 *
 * Leaflet is still stubbed — it needs a laid-out DOM jsdom does not provide,
 * and the map is not the integration under test. The stub exposes the same
 * props, so clicking its button is clicking the map.
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
      <button type="button" onClick={() => onMapClick(0, 0)}>
        ocean
      </button>
      <span data-testid="marker">
        {selected ? selected.formatted_address : 'none'}
      </span>
    </div>
  ),
}));

describe('search, end to end through the client', () => {
  it('builds the autocomplete request the API expects', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await screen.findByText('Boston, MA, USA');

    const { url, params } = lastRequest();
    expect(url).toContain('/api/v1/autocomplete');
    expect(params.get('q')).toBe('bos');
    expect(params.get('limit')).toBe('8');
  });

  it('encodes a query containing a comma and a space', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'Boston, MA');

    // The raw URL must carry the escaped form; an unencoded comma would still
    // arrive, but a "&" or "#" in a place name would silently truncate it.
    await waitFor(() => expect(lastRequest()).toBeDefined());
    expect(lastRequest().url).toContain('q=Boston%2C%20MA');
    expect(lastRequest().params.get('q')).toBe('Boston, MA');
  });

  it('renders predictions parsed from the real response shape', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');

    expect(await screen.findByText('Boston, MA, USA')).toBeInTheDocument();
    expect(screen.getByText('Bossier City, LA, USA')).toBeInTheDocument();
  });

  it('resolves a selection through geocode and shows its coordinates', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await user.click(await screen.findByText('Boston, MA, USA'));

    await waitFor(() =>
      expect(screen.getByTestId('marker')).toHaveTextContent('Boston, MA, USA'),
    );

    const geocode = requestLog.find((r) => r.url.includes('/geocode'));
    expect(geocode?.params.get('place_id')).toBe('us-city-MA-Boston');
    // Proves the nested geometry.location was read, not just the display text.
    expect(screen.getByRole('status')).toHaveTextContent('42.3523, -71.0387');
  });

  it('treats ZERO_RESULTS as an empty list, not a failure', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'zzzz');

    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('surfaces nothing when the API returns an error status', async () => {
    server.use(
      http.get('*/api/v1/autocomplete', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'bos');

    // The client throws on a non-2xx; the box must not render a stale or
    // half-parsed list because of it.
    await waitFor(() =>
      expect(screen.queryByRole('option')).not.toBeInTheDocument(),
    );
  });
});

describe('reverse geocoding, end to end through the client', () => {
  it('sends lat and lng as separate params in the right order', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    await waitFor(() => expect(lastRequest()).toBeDefined());
    const { url, params } = lastRequest();

    expect(url).toContain('/api/v1/reverse');
    // ST_MakePoint takes longitude first, which is a standing source of
    // transposed coordinates; the HTTP contract is lat then lng.
    expect(params.get('lat')).toBe('42.31');
    expect(params.get('lng')).toBe('-71.11');
  });

  it('writes the resolved address back into the search field', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveValue(
        'Jamaica Plain, MA 02130, USA',
      ),
    );
  });

  it('does not look up the address it just wrote back', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveValue(
        'Jamaica Plain, MA 02130, USA',
      ),
    );

    // Wrapped in act: the debounce fires inside this window, and any state
    // update it causes must be flushed before the assertion rather than
    // landing outside React's control.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(requestLog.filter((r) => r.url.includes('/autocomplete'))).toEqual(
      [],
    );
  });

  it('reports a point outside the dataset as no location', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'ocean' }));

    expect(
      await screen.findByText('No known location near that point'),
    ).toBeInTheDocument();
  });

  it('reports a network failure without leaving the field stale', async () => {
    server.use(http.get('*/api/v1/reverse', () => HttpResponse.error()));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'map' }));

    expect(await screen.findByText('Lookup failed')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});
