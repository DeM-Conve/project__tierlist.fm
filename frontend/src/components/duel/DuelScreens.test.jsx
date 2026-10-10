import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeStore, renderWithApp } from '../../test/render';
import { loadBoard } from '../../tierActions';
import DuelMatch from './DuelMatch';
import DuelMoves from './DuelMoves';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../EmbeddedPlayer', () => ({ default: () => null }));

const mutations = { verdict: vi.fn(), skip: vi.fn(), undo: vi.fn(), end: vi.fn(), decision: vi.fn(), lock: vi.fn() };
const mutation = (fn) => ({ mutate: fn, isPending: false });
let session;
let analysis;
vi.mock('../../api/queries', () => ({
  useDuelSessionQuery: () => ({ data: session }),
  useDuelVerdictMutation: () => mutation(mutations.verdict),
  useDuelSkipMutation: () => mutation(mutations.skip),
  useDuelUndoMutation: () => mutation(mutations.undo),
  useEndDuelMutation: () => mutation(mutations.end),
  useDuelDecisionMutation: () => mutation(mutations.decision),
  useDuelLockMutation: () => mutation(mutations.lock),
  useDuelAnalysisQuery: () => ({ data: analysis }),
}));

const NAMING = { template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
const vid = (id, title) => ({ videoId: id, id: `item-${id}`, title, channelTitle: 'Band' });
const data = { S: [vid('sssssssssss', 'Top Song')], A: [vid('aaaaaaaaaaa', 'Middle Song')], TODO: [vid('ttttttttttt', 'New Song')] };
const probs = { S: 0.58, A: 0.39, B: 0.03 };
const song = (id, tier) => ({ id, tier, mu: 25, sigma: 3, probabilities: probs, bestTier: 'S', bestProbability: 0.58, duels: 3, onFence: true });

function setup(ui) {
  const store = makeStore({ playlists: ['S', 'A', 'TODO'].map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 1 })), naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data }));
  renderWithApp(<MemoryRouter>{ui}</MemoryRouter>, { store });
  return store;
}

beforeEach(() => Object.values(mutations).forEach((m) => m.mockReset()));

describe('DuelMatch', () => {
  beforeEach(() => {
    session = {
      id: 's1', minutes: 5, endsAt: new Date(Date.now() + 300_000).toISOString(), certaintyStart: 0.6, certainty: 0.66,
      duels: [], skipped: [], previous: null, done: false,
      matchup: { a: 'aaaaaaaaaaa', b: 'sssssssssss', reason: { kind: 'BORDER', upperTier: 'S', lowerTier: 'A' }, songA: song('aaaaaaaaaaa', 'A'), songB: song('sssssssssss', 'S') },
    };
  });

  it('explains the duel and takes the five verdicts from the keyboard', () => {
    setup(<DuelMatch category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);
    expect(screen.getByText('Which one hits harder?')).toBeInTheDocument();
    expect(screen.getByText(/sits near the S \/ A border - 58% likely S/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    expect(mutations.verdict.mock.calls[0][0]).toMatchObject({ a: 'aaaaaaaaaaa', b: 'sssssssssss', verdict: 'A_CLEARLY' });
  });

  it('shows the Tab hint only on the paused side (Tab switches to it)', () => {
    setup(<DuelMatch category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);
    expect(screen.getByRole('button', { name: 'Replay clip' })).not.toHaveTextContent('Tab');
    expect(screen.getByRole('button', { name: /Hear B/ })).toHaveTextContent('Tab');
  });

  it('"Don\'t know one of them" skips the opponent', () => {
    setup(<DuelMatch category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);
    fireEvent.keyDown(window, { key: 's' });
    expect(mutations.skip.mock.calls[0][0]).toMatchObject({ videoId: 'sssssssssss' });
  });

  it('when nothing is left it offers the summary', () => {
    session = { ...session, matchup: null, done: true };
    setup(<DuelMatch category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);
    fireEvent.click(screen.getByText('See the summary'));
    expect(mutations.end).toHaveBeenCalled();
  });
});

describe('DuelMoves', () => {
  it('Move stages the move on the board and records the decision', () => {
    analysis = {
      songs: [song('ttttttttttt', null), song('sssssssssss', 'S'), song('aaaaaaaaaaa', 'A')],
      borders: [{ upper: 'S', lower: 'A', score: 28 }],
      suggestions: [{ song: 'ttttttttttt', from: 'TODO', to: 'A', confidence: 0.92, wins: 4, losses: 1, draws: 0, keyResults: [], trend: [25, 26] }],
      tierOrders: {},
    };
    const store = setup(<DuelMoves category="Rock" boardLoading={false} base="/tier/Rock" />);
    expect(screen.getByText('Suggested moves')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Move')[0]);
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toContain('ttttttttttt');
    expect(mutations.decision.mock.calls[0][0]).toMatchObject({ videoId: 'ttttttttttt', decision: 'ACCEPTED', from: 'TODO', to: 'A' });
    expect(screen.getByText('Moved to A')).toBeInTheDocument();
  });
});
