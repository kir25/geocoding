import { useEffect, useState } from 'react';
import { autocomplete, geocodePlaceId } from '../api/client';
import { useDebounced } from '../hooks/useDebounced';
import type { GeocodeResult, Prediction } from '../api/types';

const DEBOUNCE_MS = 250;

interface Props {
  /** Text to display, owned by the parent so a map click can fill the field. */
  value: string;
  /**
   * True when the change should trigger a lookup. Text the user typed should;
   * text written back after a map click or a selection should not, or the box
   * would search for an address that is already resolved.
   */
  searchable: boolean;
  onValueChange: (value: string, searchable: boolean) => void;
  onSelect: (result: GeocodeResult) => void;
}

export function SearchBox({
  value,
  searchable,
  onValueChange,
  onSelect,
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const debounced = useDebounced(value, DEBOUNCE_MS);

  useEffect(() => {
    // Text written by the map or by a selection is already a resolved address;
    // searching for it would spend a request to look up what we just displayed
    // and reopen a dropdown the user did not ask for.
    if (!searchable) {
      setPredictions([]);
      setOpen(false);
      return;
    }

    const query = debounced.trim();
    if (query.length === 0) {
      setPredictions([]);
      setOpen(false);
      return;
    }

    // Aborting on cleanup is what keeps results in order. Without it, a slow
    // response for "bo" can land after a fast one for "boston" and overwrite
    // the list with stale suggestions.
    const controller = new AbortController();
    setLoading(true);

    autocomplete(query, controller.signal)
      .then((res) => {
        setPredictions(res.predictions);
        setOpen(true);
        setHighlighted(-1);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') {
          setPredictions([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debounced, searchable]);

  async function choose(prediction: Prediction) {
    onValueChange(prediction.description, false);
    setOpen(false);
    setPredictions([]);

    const result = await geocodePlaceId(prediction.place_id);
    if (result) onSelect(result);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlighted((i) => (i + 1) % predictions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlighted(
          (i) => (i - 1 + predictions.length) % predictions.length,
        );
        break;
      case 'Enter': {
        event.preventDefault();
        // Enter with nothing highlighted takes the top suggestion, which is
        // what a user who typed and hit return expects.
        const choice = predictions[highlighted] ?? predictions[0];
        if (choice) void choose(choice);
        break;
      }
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  const showEmpty = open && !loading && predictions.length === 0;

  return (
    <div className="search">
      <input
        className="search__input"
        type="text"
        value={value}
        placeholder="Search a city or ZIP code…"
        aria-label="Search a city or ZIP code"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        autoComplete="off"
        onChange={(e) => onValueChange(e.target.value, true)}
        onKeyDown={onKeyDown}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        // Delayed so a click on a suggestion registers before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {loading && <span className="search__spinner" aria-hidden="true" />}

      {open && predictions.length > 0 && (
        <ul className="search__list" role="listbox">
          {predictions.map((prediction, index) => (
            <li key={prediction.place_id} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                className={
                  index === highlighted
                    ? 'search__option search__option--active'
                    : 'search__option'
                }
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => void choose(prediction)}
              >
                {prediction.description}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <div className="search__list search__empty">No matches</div>
      )}
    </div>
  );
}
