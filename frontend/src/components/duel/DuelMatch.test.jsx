import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import DuelMatch from './DuelMatch';
import { IDS, renderDuel, song } from '../../test/duelFixtures';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
// A stand-in player: a button that reports its video as unplayable here.
vi.mock('../EmbeddedPlayer', () => ({
  default: ({ videoId, onBlocked }) => <button type="button" onClick={onBlocked}>{`block ${videoId}`}</button>,
}));

const h = vi.hoisted(() => ({ session: null, error: null, spies: {} }));
vi.mock('../../api/queries', () => ({
  useDuelSessionQuery: () => ({ data: h.session, isError: !!h.error, error: h.error, refetch: h.refetch ?? vi.fn() }),
  useDuelVerdictMutation: () => ({ mutate: h.spies.verdict, isPending: false }),
  useDuelSkipMutation: () => ({ mutate: h.spies.skip, isPending: false }),
  useDuelUndoMutation: () => ({ mutate: h.spies.undo, isPending: false }),
  useEndDuelMutation: () => ({ mutate: h.spies.end, isPending: false }),
  useDuelDecisionMutation: () => ({ mutate: vi.fn() }),
  useDuelLockMutation: () => ({ mutate: vi.fn() }),
}));

const matchup = (a = IDS.mid, b = IDS.top) => ({
  a, b, reason: { kind: 'BORDER', upperTier: 'S', lowerTier: 'A' },
  songA: song(a, 'A', { mu: 25 }), songB: song(b, 'S', { mu: 30, onFence: false }),
});

const page = () => renderDuel(<DuelMatch category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);

beforeEach(() => {
  h.error = null;
  h.spies = { verdict: vi.fn(), skip: vi.fn(), undo: vi.fn(), end: vi.fn() };
  h.session = {
    id: 's1', minutes: 5, endsAt: new Date(Date.now() + 240_000).toISOString(), certaintyStart: 0.6, certainty: 0.66,
    duels: [], skipped: [], previous: null, done: false, matchup: matchup(),
  };
});

describe('DuelMatch', () => {
  it('shows the duel, why it was picked, where the song belongs and the session so far', () => {
    page();
    expect(screen.getByText('Which one hits harder?')).toBeInTheDocument();
    expect(screen.getByText('Middle Song', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/sits near the S \/ A border - 58% likely S. Top Song is a settled S song/)).toBeInTheDocument();
    expect(screen.getByText('Middle Song - where it belongs')).toBeInTheDocument();
    expect(screen.getByText('Your verdicts show up here.')).toBeInTheDocument();
    expect(screen.getByText(/Certainty/)).toHaveTextContent('Certainty +6% · 0 duels');
    expect(screen.getByText('~4 min left')).toBeInTheDocument();
  });

  it.each([
    [{ key: 'ArrowLeft', shiftKey: true }, 'A_CLEARLY'],
    [{ key: 'ArrowLeft' }, 'A'],
    [{ key: 'ArrowDown' }, 'TOO_CLOSE'],
    [{ key: 'ArrowRight' }, 'B'],
    [{ key: 'ArrowRight', shiftKey: true }, 'B_CLEARLY'],
  ])('key %o gives the verdict %s', (key, verdict) => {
    page();
    fireEvent.keyDown(window, key);
    expect(h.spies.verdict.mock.calls[0][0]).toMatchObject({ a: IDS.mid, b: IDS.top, verdict });
  });

  it('the verdict buttons give the same verdicts', () => {
    page();
    fireEvent.click(screen.getByText('Too close'));
    expect(h.spies.verdict.mock.calls[0][0].verdict).toBe('TOO_CLOSE');
  });

  it('after a verdict: the headline, both score changes and what it did - then Space for the next duel', () => {
    h.spies.verdict.mockImplementation(() => {
      h.session = {
        ...h.session,
        duels: [{ id: 1, a: IDS.mid, b: IDS.top, verdict: 'A_CLEARLY' }],
        previous: {
          duel: { id: 1, a: IDS.mid, b: IDS.top, verdict: 'A_CLEARLY' },
          a: song(IDS.mid, 'A', { mu: 28.1, bestTier: 'S', bestProbability: 0.81, duels: 4 }),
          b: song(IDS.top, 'S', { mu: 28.6 }),
        },
        matchup: matchup(IDS.mid2, IDS.top),
      };
    });
    page();
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    expect(screen.getByText('Middle Song, clearly.')).toBeInTheDocument();
    expect(screen.getByText('+31')).toBeInTheDocument();
    expect(screen.getByText('−14')).toBeInTheDocument();
    expect(screen.getByText('Middle Song is now 81% S - leaning up, not decided yet.')).toBeInTheDocument();
    // Verdict keys wait for "Next duel".
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(h.spies.verdict).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByText('Middle Song, clearly.')).not.toBeInTheDocument();
    expect(screen.getByText('Other Song', { selector: 'p' })).toBeInTheDocument();
  });

  it('sends how many duels it saw; a 409 (stale or ended) reloads the session instead of failing', () => {
    h.session.duels = [{ id: 1, a: IDS.mid, b: IDS.top, verdict: 'A' }];
    h.refetch = vi.fn();
    h.spies.verdict.mockImplementation((_, { onError }) => onError({ response: { status: 409, data: { title: 'Duel session changed', detail: 'moved on' } } }));
    page();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(h.spies.verdict.mock.calls[0][0].seenDuels).toBe(1);
    expect(h.refetch).toHaveBeenCalled();
    expect(screen.getByText('A, clearly')).toBeInTheDocument();
  });

  it('a verdict that fails to save brings the duel back', () => {
    h.spies.verdict.mockImplementation((_, { onError }) => onError(new Error('down')));
    page();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('A, clearly')).toBeInTheDocument();
  });

  it('Space pauses and resumes the clip being heard; switching sides plays again', () => {
    page();
    expect(screen.getAllByText('▶ Playing')).toHaveLength(1);
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByText('▶ Playing')).not.toBeInTheDocument();
    expect(h.spies.verdict).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getAllByText('▶ Playing')).toHaveLength(1);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getAllByText('▶ Playing')).toHaveLength(1);
  });

  it('Tab switches which clip plays, and only the paused side shows the Tab hint', () => {
    page();
    expect(screen.getAllByText('▶ Playing')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Replay clip' })).not.toHaveTextContent('Tab');
    expect(screen.getByRole('button', { name: /Hear B/ })).toHaveTextContent('Tab');
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /Hear A/ })).toHaveTextContent('Tab');
  });

  it("s skips the opponent; u undoes; the list shows this session's verdicts", () => {
    h.session.duels = [
      { id: 1, a: IDS.mid, b: IDS.top, verdict: 'TOO_CLOSE' },
      { id: 2, a: IDS.mid2, b: IDS.top, verdict: 'B_CLEARLY' },
    ];
    page();
    fireEvent.keyDown(window, { key: 's' });
    expect(h.spies.skip.mock.calls[0][0]).toMatchObject({ videoId: IDS.top });
    fireEvent.keyDown(window, { key: 'u' });
    expect(h.spies.undo).toHaveBeenCalled();
    expect(screen.getByText('too close')).toBeInTheDocument();
    expect(screen.getByText('clearly')).toBeInTheDocument();
  });

  it('long song names truncate instead of resizing the layout', () => {
    h.session.duels = [{ id: 1, a: IDS.mid, b: IDS.top, verdict: 'A' }];
    page();
    const title = screen.getByText('Middle Song', { selector: 'p' });
    expect(title).toHaveAttribute('data-truncate');
    expect(title).toHaveAttribute('title', 'Middle Song');
    const row = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Middle Song over Top Song');
    expect(row).toHaveAttribute('data-truncate');
    expect(parseFloat(row.style.minWidth)).toBe(0);
  });

  it('a video that can\'t be played here hands over to the other side; both blocked stops switching', () => {
    page();
    fireEvent.click(screen.getByText(`block ${IDS.mid}`)); // A, the side playing
    expect(screen.getByRole('button', { name: /Hear A/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText(`block ${IDS.top}`)); // B too
    expect(screen.getByRole('button', { name: /Hear A/ })).toBeInTheDocument();
  });

  it('a held key gives one verdict, not many', () => {
    page();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft', repeat: true });
    expect(h.spies.verdict).toHaveBeenCalledTimes(1);
  });

  it('Undo is off before the first verdict', () => {
    page();
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  });

  it('when time is up it offers the summary', () => {
    h.session = { ...h.session, matchup: null, done: true, endsAt: new Date(Date.now() - 1000).toISOString() };
    page();
    expect(screen.getByText('Time’s up.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('See the summary'));
    expect(h.spies.end).toHaveBeenCalled();
  });

  it('a session that can’t load says why', () => {
    h.session = null;
    h.error = { response: { data: { detail: 'That duel session doesn’t exist on this board.' } } };
    page();
    expect(screen.getByText('That duel session doesn’t exist on this board.')).toBeInTheDocument();
    expect(screen.getByText('Back to the duel hub')).toBeInTheDocument();
  });

  it('pauses the mini player when it opens', () => {
    const store = page();
    expect(store.getState().focus.pauseRequest).toBe(1);
  });
});
