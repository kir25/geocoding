import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';
import type { GeocodeResult, Prediction } from '../api/types';

vi.mock('../api/client', () => ({
  autocomplete: vi.fn(),
  geocodePlaceId: vi.fn(),
}));

const { autocomplete, geocodePlaceId } = await import('../api/client');

const BOSTON: Prediction = {
  place_id: 'us-city-MA-Boston',
  description: 'Boston, MA, USA',
};
const BOSSIER: Prediction = {
  place_id: 'us-city-LA-Bossier City',
  description: 'Bossier City, LA, USA',
};

const RESULT = {
  place_id: 'us-city-MA-Boston',
  formatted_address: 'Boston, MA, USA',
  geometry: { location: { lat: 42.35, lng: -71.04 } },
} as GeocodeResult;

/**
 * The parent owns the text, so tests drive the real prop contract rather than
 * a detached component: typing marks the change searchable, a selection does not.
 */
function Harness({
  onSelect = vi.fn(),
  initialSearchable = true,
}: {
  onSelect?: (r: GeocodeResult) => void;
  initialSearchable?: boolean;
}) {
  const [value, setValue] = useState('');
  const [searchable, setSearchable] = useState(initialSearchable);

  return (
    <SearchBox
      value={value}
      searchable={searchable}
      onValueChange={(next, isSearchable) => {
        setValue(next);
        setSearchable(isSearchable);
      }}
      onSelect={onSelect}
    />
  );
}

beforeEach(() => {
  vi.mocked(autocomplete).mockReset();
  vi.mocked(geocodePlaceId).mockReset();
  vi.mocked(autocomplete).mockResolvedValue({
    status: 'OK',
    predictions: [BOSTON, BOSSIER],
  });
  vi.mocked(geocodePlaceId).mockResolvedValue(RESULT);
});

describe('SearchBox', () => {
  it('queries once the user stops typing, not once per keystroke', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await screen.findByText('Boston, MA, USA');

    // Debounced: three characters, one request.
    expect(autocomplete).toHaveBeenCalledTimes(1);
    expect(autocomplete).toHaveBeenCalledWith('bos', expect.any(AbortSignal));
  });

  it('does not query for text the app wrote back', async () => {
    render(<Harness initialSearchable={false} />);

    // A map click fills the field with an address that is already resolved;
    // looking it up again would waste a request and reopen the dropdown.
    await waitFor(() => expect(autocomplete).not.toHaveBeenCalled());
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('aborts the previous request when the query changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox'), 'bo');
    await screen.findByText('Boston, MA, USA');
    const firstSignal = vi.mocked(autocomplete).mock.calls[0][1] as AbortSignal;

    await user.type(screen.getByRole('combobox'), 'ston');
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
  });

  it('closes the list and reports the resolved place when one is chosen', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.type(screen.getByRole('combobox'), 'bos');
    await user.click(await screen.findByText('Boston, MA, USA'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(RESULT));
    expect(geocodePlaceId).toHaveBeenCalledWith('us-city-MA-Boston');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Boston, MA, USA');
  });

  it('reports no matches instead of showing an empty list', async () => {
    vi.mocked(autocomplete).mockResolvedValue({
      status: 'ZERO_RESULTS',
      predictions: [],
    });

    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('stops querying when the field is cleared', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'bos');
    await screen.findByText('Boston, MA, USA');

    await user.clear(input);
    await waitFor(() =>
      expect(screen.queryByRole('option')).not.toBeInTheDocument(),
    );
  });

  describe('keyboard', () => {
    it('moves the highlight with the arrow keys and wraps around', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByRole('combobox'), 'bos');
      await screen.findByText('Boston, MA, USA');

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
        'Boston, MA, USA',
      );

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
        'Bossier City, LA, USA',
      );

      // Past the end, back to the top.
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
        'Boston, MA, USA',
      );
    });

    it('selects the highlighted option on Enter', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);

      await user.type(screen.getByRole('combobox'), 'bos');
      await screen.findByText('Boston, MA, USA');

      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

      await waitFor(() =>
        expect(geocodePlaceId).toHaveBeenCalledWith('us-city-LA-Bossier City'),
      );
    });

    it('takes the top suggestion when Enter is pressed with nothing highlighted', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByRole('combobox'), 'bos');
      await screen.findByText('Boston, MA, USA');

      await user.keyboard('{Enter}');

      await waitFor(() =>
        expect(geocodePlaceId).toHaveBeenCalledWith('us-city-MA-Boston'),
      );
    });

    it('closes the list on Escape without selecting anything', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByRole('combobox'), 'bos');
      await screen.findByText('Boston, MA, USA');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(geocodePlaceId).not.toHaveBeenCalled();
    });
  });
});
