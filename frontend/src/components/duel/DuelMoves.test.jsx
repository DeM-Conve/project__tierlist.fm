import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import DuelMoves from './DuelMoves';
import { IDS, analysis, renderDuel, suggestion } from '../../test/duelFixtures';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../EmbeddedPlayer', () => ({ default: ({ videoId }) => <div data-testid="player">{videoId}</div> }));

const h = vi.hoisted(() => ({ analysis: null, error: null, decision: null, lock: null }));
vi.mock('../../api/queries', () => ({
  useDuelAnalysisQuery: () => ({ data: h.analysis, isError: !!h.error, error: h.error, refetch: vi.fn() }),
  useDuelDecisionMutation: () => ({ mutate: h.decision }),
  useDuelLockMutation: () => ({ mutate: h.lock }),
}));

const page = () => renderDuel(<DuelMoves category="Rock" boardLoading={false} base="/tier/Rock" />, '/tier/Rock/duel/moves');
const tierOf = (store, id) => Object.keys(store.getState().tiers.tierItems).find((t) => store.getState().tiers.tierItems[t].some((v) => v.videoId === id));

// Two moves: a sure new placement (TODO -> A, 92%) and a less sure move up (A -> S, 87%).
const up = suggestion({ song: IDS.mid2, from: 'A', to: 'S', confidence: 0.87, wins: 5, losses: 1, keyResults: [{ opponent: IDS.top, opponentTier: 'S', result: 1 }] });

beforeEach(() => {
  h.error = null;
  h.decision = vi.fn();
  h.lock = vi.fn();
  h.analysis = analysis({ suggestions: [suggestion(), up] });
});

describe('DuelMoves', () => {
  it('lists every suggested move with its record, sure ones first, and filters by kind', () => {
    page();
    expect(screen.getByText('Suggested moves')).toBeInTheDocument();
    expect(screen.getByText(/4–1–0 \(W–L–D\)/)).toBeInTheDocument();
    expect(screen.getByText('All · 2')).toBeInTheDocument();
    expect(screen.getByText('Up a tier · 1')).toBeInTheDocument();
    expect(screen.getByText('New placements · 1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Up a tier · 1'));
    expect(screen.queryByRole('button', { name: /Show evidence for New Song/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show evidence for Other Song/ })).toBeInTheDocument();
  });

  it('Move stages the move on the board (placed by score) and records it; Undo takes both back', () => {
    const store = page();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[0]);
    expect(tierOf(store, IDS.todo)).toBe('A');
    // New Song (score 24) lands between Middle (26) and Other (22).
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual([IDS.mid, IDS.todo, IDS.mid2]);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.todo, decision: 'ACCEPTED', from: 'TODO', to: 'A', confidence: 0.92 });
    expect(screen.getByText('Moved to A')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Undo'));
    expect(tierOf(store, IDS.todo)).toBe('TODO');
    expect(h.decision.mock.calls[1][0]).toMatchObject({ videoId: IDS.todo, decision: null });
  });

  it('Keep records the decision and leaves the board alone', () => {
    const store = page();
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.todo, decision: 'KEPT' });
    expect(screen.getByText('Kept in TODO')).toBeInTheDocument();
    expect(tierOf(store, IDS.todo)).toBe('TODO');
  });

  it('Move all at >= 90% moves only the sure ones', () => {
    const store = page();
    fireEvent.click(screen.getByRole('button', { name: 'Move all 1 at ≥90%' }));
    expect(tierOf(store, IDS.todo)).toBe('A');
    expect(tierOf(store, IDS.mid2)).toBe('A');
    expect(h.decision).toHaveBeenCalledTimes(1);
  });

  it('the evidence panel follows the selected song; lock toggles; play opens a player', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: /Show evidence for Other Song/ }));
    const panel = screen.getByRole('button', { name: 'Move to S' }).closest('.mantine-Paper-root');
    expect(within(panel).getByText('Won')).toBeInTheDocument();
    expect(within(panel).getByText('Score over 6 duels')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('checkbox'));
    expect(h.lock.mock.calls[0][0]).toEqual({ videoId: IDS.mid2, locked: true });
    fireEvent.click(within(panel).getByRole('checkbox'));
    expect(h.lock.mock.calls[1][0]).toEqual({ videoId: IDS.mid2, locked: false });
    fireEvent.click(within(panel).getByRole('button', { name: /Play Other Song/ }));
    expect(screen.getByTestId('player')).toHaveTextContent(IDS.mid2);
  });

  it('keys: down/up browse, m moves, x keeps', () => {
    page();
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Move to S' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'x', code: 'KeyX' });
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.mid2, decision: 'KEPT' });
    fireEvent.keyDown(document, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'm', code: 'KeyM' });
    expect(h.decision.mock.calls[1][0]).toMatchObject({ videoId: IDS.todo, decision: 'ACCEPTED' });
  });

  it('offers to sort a tier by score', () => {
    h.analysis = analysis({ suggestions: [], tierOrders: { A: [IDS.mid2, IDS.mid] } });
    const store = page();
    expect(screen.getByText('No moves to review. Duel more and the strongest cases show up here.')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 songs change places')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sort A by score' }));
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual([IDS.mid2, IDS.mid]);
  });

  it('a failed load says why and offers Retry', () => {
    h.analysis = undefined;
    h.error = { response: { data: { detail: 'YouTube says no.' } } };
    page();
    expect(screen.getByText('YouTube says no.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
