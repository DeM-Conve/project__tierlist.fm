import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import DuelWrap from './DuelWrap';
import { IDS, renderDuel, suggestion } from '../../test/duelFixtures';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
const h = vi.hoisted(() => ({ summary: null, error: null }));
vi.mock('../../api/queries', () => ({
  useDuelSummaryQuery: () => ({ data: h.summary, isError: !!h.error, error: h.error }),
  useDuelDecisionMutation: () => ({ mutate: vi.fn() }),
  useDuelLockMutation: () => ({ mutate: vi.fn() }),
}));

const page = () => renderDuel(<DuelWrap category="Rock" sessionId="s1" boardLoading={false} base="/tier/Rock" />);

beforeEach(() => {
  h.error = null;
  h.summary = {
    sessionId: 's1', duels: 14, seconds: 252, certaintyStart: 0.64, certainty: 0.71,
    newMoves: [suggestion({ confidence: 0.88 })], movesWaiting: 7, placed: 1, bordersSettled: 3, tierOrders: 2,
    upset: { winner: IDS.mid2, loser: IDS.top, odds: 0.12, clearly: true },
    undecided: [{ a: IDS.mid, b: IDS.mid2 }],
  };
});

describe('DuelWrap', () => {
  it('sums the session up', () => {
    page();
    expect(screen.getByText('Session done · 14 duels · 4 min 12 s')).toBeInTheDocument();
    expect(screen.getByText('Your Rock board got sharper.')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('71%')).toBeInTheDocument();
    expect(screen.getByText(/borders settled/)).toHaveTextContent('3 borders settled');
    expect(screen.getByText('1 new move from this session')).toBeInTheDocument();
    expect(screen.getByText('Review all 7 waiting →')).toBeInTheDocument();
    expect(screen.getByText(/beat/)).toHaveTextContent('Other Song beat Top Song - clearly. (It had a 12% chance.)');
    expect(screen.getByText(/three “too close” in a row/)).toHaveTextContent('Middle Song vs Other Song');
  });

  it('says so when there was no upset or undecided pair, and when certainty fell', () => {
    h.summary = { ...h.summary, certainty: 0.5, upset: null, undecided: [], newMoves: [] };
    page();
    expect(screen.getByText('Rock: every duel counts.')).toBeInTheDocument();
    expect(screen.getByText(/No surprises/)).toBeInTheDocument();
    expect(screen.getByText(/No pair came out/)).toBeInTheDocument();
  });

  it('a failed load says why', () => {
    h.summary = undefined;
    h.error = { response: { data: { detail: 'Gone.' } } };
    page();
    expect(screen.getByText('Gone.')).toBeInTheDocument();
  });
});
