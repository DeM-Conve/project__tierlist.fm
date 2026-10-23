import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import DuelSettings from './DuelSettings';
import { makeStore, renderWithApp } from '../test/render';
import { BOARD, IDS, analysis, song } from '../test/duelFixtures';
import { loadBoard } from '../tierActions';
import { setOwnRanges } from '../store/duelSettingsSlice';
import { settingsLoaded } from '../store/settingsActions';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
const h = vi.hoisted(() => ({ analysis: undefined, calls: [] }));
vi.mock('../api/queries', () => ({
  useDuelAnalysisQuery: (...args) => {
    h.calls.push(args);
    return { data: h.analysis };
  },
}));

// The user's own tier names (T1..TZ for S..D) - shown everywhere, never the ids.
const NAMING = { template: '{category} {tier}', tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: 'TODO' } };

function page({ board = false } = {}) {
  const store = makeStore({ naming: NAMING });
  if (board) store.dispatch(loadBoard({ category: 'Rock', data: BOARD }));
  renderWithApp(<DuelSettings />, { store });
  return store;
}

const input = (name) => screen.getByLabelText(`Lowest score for ${name}`);
const type = (name, value) => fireEvent.change(input(name), { target: { value: String(value) } });
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  localStorage.clear();
  h.analysis = undefined;
  h.calls = [];
});

describe('DuelSettings', () => {
  it('defaults to learned borders, with no range form', () => {
    const store = page();
    expect(screen.getByRole('radio', { name: /Learned from my tiers/ })).toBeChecked();
    expect(screen.queryByLabelText('Lowest score for T1')).not.toBeInTheDocument();
    expect(store.getState().duels.tierBorders).toBe('learned');
  });

  it('"My own ranges" shows each tier by its own name with its range, and changes nothing until saved', () => {
    const store = page();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    for (const name of ['T1', 'T2', 'T3', 'TE']) expect(input(name)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lowest score for TZ')).not.toBeInTheDocument();
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('TZ')).toBeInTheDocument();
    expect(screen.queryByText(/^S$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('range-S')).toHaveTextContent('340 and up');
    expect(screen.getByTestId('range-A')).toHaveTextContent('280 – 339');
    expect(screen.getByTestId('range-D')).toHaveTextContent('below 160');
    expect(screen.getByText('Not in use until you save')).toBeInTheDocument();
    expect(store.getState().duels.tierBorders).toBe('learned');
  });

  it('validates live: a border not below the one above is refused, by tier name', async () => {
    page();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    type('T3', 300);
    expect(await screen.findByText("Must be below T2's 280")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(screen.getByTestId('range-B')).toHaveTextContent('-');
    type('T3', 250);
    await waitFor(() => expect(screen.queryByText("Must be below T2's 280")).not.toBeInTheDocument());
    expect(screen.getByTestId('range-B')).toHaveTextContent('250 – 279');
    expect(screen.getByTestId('range-C')).toHaveTextContent('160 – 249');
    expect(save()).toBeEnabled();
  });

  it('flags an empty or out-of-range score', async () => {
    page();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    type('T1', '');
    expect(await screen.findByText('Enter a score')).toBeInTheDocument();
    type('T1', 1500);
    expect(await screen.findByText('Between 0 and 1000')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('Save puts the ranges in use (the account setting); Learned switches back and keeps them', async () => {
    const store = page();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    type('T1', 400);
    await waitFor(() => expect(screen.getByTestId('range-A')).toHaveTextContent('280 – 399'));
    await act(async () => fireEvent.click(save()));
    expect(store.getState().duels).toEqual({ tierBorders: 'custom', tierMinimums: { S: 400, A: 280, B: 220, C: 160 } });
    expect(screen.getByText('In use')).toBeInTheDocument();
    expect(save()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /Learned from my tiers/ }));
    expect(store.getState().duels).toEqual({ tierBorders: 'learned', tierMinimums: { S: 400, A: 280, B: 220, C: 160 } });
    expect(screen.queryByLabelText('Lowest score for T1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    expect(input('T1')).toHaveValue('400');
  });

  it('Reset goes back to the saved ranges', async () => {
    const store = page();
    act(() => store.dispatch(setOwnRanges({ S: 500, A: 400, B: 300, C: 200 })));
    expect(screen.getByRole('radio', { name: /My own ranges/ })).toBeChecked();
    type('T1', 600);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(input('T1')).toHaveValue('500'));
  });

  it('follows the account row when it loads', async () => {
    const store = page();
    act(() => store.dispatch(settingsLoaded({ duels: { tierBorders: 'custom', tierMinimums: { S: 450, A: 350, B: 250, C: 150 } } })));
    expect(screen.getByRole('radio', { name: /My own ranges/ })).toBeChecked();
    // The form shows the account's ranges, in use - not this browser's older copy, offered for Save.
    await waitFor(() => expect(input('T1')).toHaveValue('450'));
    expect(screen.getByText('In use')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('Reset with no saved ranges goes back to where the form started (the board\'s learned borders)', async () => {
    h.analysis = analysis({ borders: [{ upper: 'S', lower: 'A', score: 30 }, { upper: 'A', lower: 'B', score: 23 }] });
    page({ board: true });
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    await waitFor(() => expect(input('T1')).toHaveValue('300'));
    type('T1', 310);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(input('T1')).toHaveValue('300'));
  });

  it('previews how the open board would fall, starting from its learned borders', async () => {
    h.analysis = analysis({
      borders: [{ upper: 'S', lower: 'A', score: 30 }, { upper: 'A', lower: 'B', score: 23 }],
      songs: [song(IDS.top, 'S', { mu: 31 }), song(IDS.mid, 'A', { mu: 26 }), song(IDS.mid2, 'A', { mu: 22 }), song(IDS.low, 'B', { mu: 24 })],
    });
    page({ board: true });
    expect(h.calls.at(-1)[0]).toBe('Rock');
    expect(h.calls.at(-1)[2]).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    await waitFor(() => expect(input('T1')).toHaveValue('300'));
    expect(input('T2')).toHaveValue('230');
    expect(screen.getByText('On Rock')).toBeInTheDocument();
    expect(screen.getByTestId('count-S')).toHaveTextContent('1 song');
    expect(screen.getByTestId('count-A')).toHaveTextContent('2 songs');
    expect(screen.getByTestId('count-B')).toHaveTextContent('1 song');
    type('T1', 250);
    type('T2', 240);
    await waitFor(() => expect(screen.getByTestId('count-S')).toHaveTextContent('2 songs'));
    expect(screen.getByTestId('count-A')).toHaveTextContent('1 song');
  });

  it('no board open: no preview, and the analysis is not asked for', () => {
    page();
    fireEvent.click(screen.getByRole('radio', { name: /My own ranges/ }));
    expect(h.calls.at(-1)[2]).toBe(false);
    expect(screen.queryByTestId('count-S')).not.toBeInTheDocument();
  });
});
