import { useCallback, useRef, useState } from 'react';
import { reverseGeocode } from './api/client';
import { MapView } from './components/MapView';
import { SearchBox } from './components/SearchBox';
import type { GeocodeResult } from './api/types';

/**
 * The two interactions share one piece of state.
 *
 * Choosing a suggestion sets `selected`, which the map flies to. Clicking the
 * map reverse-geocodes the point, sets the same `selected`, and writes the
 * resolved address back into the search field — so the two halves stay in
 * agreement whichever one the user drives.
 */
export default function App() {
  const [query, setQuery] = useState('');
  /**
   * Whether the current query text should be looked up. False when the text was
   * written by the app rather than typed — see SearchBox.
   */
  const [querySearchable, setQuerySearchable] = useState(true);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pendingReverse = useRef<AbortController | null>(null);

  const handleQueryChange = useCallback((value: string, searchable: boolean) => {
    setQuery(value);
    setQuerySearchable(searchable);
  }, []);

  const handleSelect = useCallback((result: GeocodeResult) => {
    setSelected(result);
    setStatus(null);
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // A user can click faster than the round trip; drop the previous lookup so
    // an earlier response cannot overwrite a later click.
    pendingReverse.current?.abort();
    const controller = new AbortController();
    pendingReverse.current = controller;

    setStatus('Looking up…');

    try {
      const result = await reverseGeocode(lat, lng, controller.signal);

      if (result) {
        setSelected(result);
        setQuery(result.formatted_address);
        setQuerySearchable(false);
        setStatus(null);
      } else {
        // The API bounds reverse lookups, so a click far from any ZIP is a
        // legitimate "nothing here" rather than a failure.
        setStatus('No known location near that point');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('Lookup failed');
      }
    }
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Geocoding</h1>
        <SearchBox
          value={query}
          searchable={querySearchable}
          onValueChange={handleQueryChange}
          onSelect={handleSelect}
        />
      </header>

      <main className="app__map">
        <MapView selected={selected} onMapClick={handleMapClick} />
      </main>

      <footer className="app__footer">
        {/* The live region is nested rather than applied to the footer itself:
            role="status" would override the implicit contentinfo landmark. */}
        <span role="status" aria-live="polite">
          {status ??
            (selected
              ? `${selected.formatted_address} · ${selected.geometry.location.lat.toFixed(4)}, ${selected.geometry.location.lng.toFixed(4)}`
              : 'Search for a place, or click anywhere on the map')}
        </span>
      </footer>
    </div>
  );
}
