import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import DuelHub from './DuelHub';
import { IDS, analysis, renderDuel } from '../../test/duelFixtures';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const h = vi.hoisted(() => ({ analysis: null, error: null, start: null, decision: null }));
vi.mock('../../api/queries', () => ({
  useDuelAnalysisQuery: () => ({ data: h.analysis, isError: !!h.error, error: h.error, refetch: vi.fn() }),
  useStartDuelMutation: () => ({ mutate: h.start, isPending: false, isError: false }),
  useDuelDecisionMutation: () => ({ mutate: h.decision }),
  useDuelLockMutation: () => ({ mutate: vi.fn() }),
}));

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
const page = () => renderDuel(<><DuelHub category="Rock" boardLoading={false} base="/tier/Rock" /><Where /></>);

beforeEach(() => {
  localStorage.clear(); // the session length is remembered per device
  h.error = null;
  h.analysis = analysis();
  h.start = vi.fn((_, { onSuccess }) => onSuccess({ id: 'new-session' }));
  h.decision = vi.fn();
});

describe('DuelHub', () => {
  it('shows certainty, moves waiting, the fence and the score map', () => {
    page();
    expect(screen.getByText('Settle the board.')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('12 duels so far')).toBeInTheDocument();
    expect(screen.getByText('1 at ≥90% confidence')).toBeInTheDocument();
    expect(screen.queryByText(/unplaced/)).not.toBeInTheDocument();
    expect(screen.getByText('Score map')).toBeInTheDocument();
    expect(screen.getByText('S · 1')).toBeInTheDocument();
    expect(screen.getByText('A · 2')).toBeInTheDocument();
  });

  it('starts a Smart mix session for the chosen length and opens it', () => {
    page();
    fireEvent.click(screen.getByText('Deep · 15 min'));
    fireEvent.click(screen.getByRole('button', { name: /Start duelling/ }));
    expect(h.start.mock.calls[0][0]).toEqual({
      layout: { tiers: { S: [IDS.top], A: [IDS.mid, IDS.mid2], TODO: [IDS.todo] } },
      focus: 'SMART_MIX', minutes: 15,
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/tier/Rock/duel/play/new-session');
  });

  it('remembers the session length on this device, but the focus starts on Smart mix again', () => {
    page();
    fireEvent.click(screen.getByText('Quick · 2 min'));
    fireEvent.click(screen.getByText('Borderlines only'));
    cleanup();
    page(); // a reload / coming back to the hub
    fireEvent.click(screen.getByRole('button', { name: /Start duelling/ }));
    expect(h.start.mock.calls[0][0]).toMatchObject({ focus: 'SMART_MIX', minutes: 2 });
  });

  it('Enter starts too, with the chosen focus', () => {
    page();
    fireEvent.click(screen.getByText('Borderlines only'));
    fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });
    expect(h.start.mock.calls[0][0]).toMatchObject({ focus: 'BORDERLINES', minutes: 5 });
  });

  it('offers exactly three focuses - there is no One song mode', () => {
    page();
    for (const l of ['Smart mix', 'Place TODO songs', 'Borderlines only']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText('One song')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose a song/ })).not.toBeInTheDocument();
  });

  it('Place TODO is off when nothing is waiting', () => {
    h.analysis = analysis({ unplaced: 0 });
    page();
    expect(screen.getByText('Place TODO songs').closest('button')).toBeDisabled();
  });

  it('offers to resume a session in progress', () => {
    h.analysis = analysis({ activeSession: 'open-one' });
    page();
    expect(screen.getByText('Resume the session in progress →')).toHaveAttribute('href', '/tier/Rock/duel/play/open-one');
    expect(screen.getByRole('button', { name: /Start a new session/ })).toBeInTheDocument();
  });

  it('Ready to move: Move records the decision', () => {
    page();
    expect(screen.getByText('Ready to move')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.todo, decision: 'ACCEPTED' });
  });

  it('while loading there is nothing to start', () => {
    h.analysis = undefined;
    page();
    expect(screen.getByRole('button', { name: /Start duelling/ })).toBeDisabled();
  });

  it('loading draws the loaded layout: same headings, stat cards and focus cards, skeletons for the data', () => {
    const structure = () => ({
      headings: screen.getAllByRole('heading').map((x) => x.textContent).filter((t) => t !== 'Ready to move'),
      stats: ['Board certainty', 'Moves waiting', 'On the fence'].map((l) => !!screen.queryByText(l)),
      focus: ['Smart mix', 'Place TODO songs', 'Borderlines only'].map((l) => !!screen.queryByText(l)),
    });
    page();
    const after = structure();
    cleanup();
    h.analysis = undefined;
    page();
    expect(structure()).toEqual(after);
    expect(after.stats.every(Boolean) && after.focus.every(Boolean)).toBe(true);
    expect(screen.getByTestId('score-map-skeleton')).toBeInTheDocument();
  });

  it('a failed load says why', () => {
    h.analysis = undefined;
    h.error = { response: { data: { detail: 'Login expired.' } } };
    page();
    expect(screen.getByText('Login expired.')).toBeInTheDocument();
  });
});
