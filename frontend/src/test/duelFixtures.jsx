import { vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { makeStore, renderWithApp } from './render';
import { loadBoard } from '../tierActions';

// Shared fixtures for the duel screens' tests: a small "Rock" board in the
// store, song states as the duel API returns them, and stand-ins for the
// duel API hooks (each test file vi.mocks '../../api/queries' with these).

export const NAMING = { template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
const vid = (id, title) => ({ videoId: id, id: `item-${id}`, title, channelTitle: 'Band', thumbnail: '' });
export const IDS = { top: 'sssssssssss', mid: 'aaaaaaaaaaa', mid2: 'bbbbbbbbbbb', low: 'ccccccccccc', todo: 'ttttttttttt' };
export const BOARD = {
  S: [vid(IDS.top, 'Top Song')],
  A: [vid(IDS.mid, 'Middle Song'), vid(IDS.mid2, 'Other Song')],
  B: [vid(IDS.low, 'Low Song')],
  TODO: [vid(IDS.todo, 'New Song')],
};

export const song = (id, tier, over = {}) => ({
  id, tier, mu: 25, sigma: 3, probabilities: { S: 0.58, A: 0.39, B: 0.03 }, bestTier: 'S', bestProbability: 0.58,
  duels: 3, wins: 2, losses: 1, draws: 0, onFence: true, ...over,
});

// A to-do song never gets one (the backend leaves to-do songs out of duels).
export const suggestion = (over = {}) => ({
  song: IDS.low, from: 'B', to: 'A', confidence: 0.92, wins: 4, losses: 1, draws: 0,
  keyResults: [{ opponent: IDS.mid, opponentTier: 'A', result: 1 }, { opponent: IDS.top, opponentTier: 'S', result: -1 }],
  trend: [25, 26, 27], ...over,
});

export const analysis = (over = {}) => ({
  certainty: 0.64, duelsTotal: 12, onFence: 2, activeSession: null,
  borders: [{ upper: 'S', lower: 'A', score: 28 }],
  songs: [song(IDS.top, 'S', { mu: 31, onFence: false }), song(IDS.mid, 'A', { mu: 26 }), song(IDS.mid2, 'A', { mu: 22, onFence: false }), song(IDS.low, 'B', { mu: 24 })],
  suggestions: [suggestion()],
  tierOrders: {},
  ...over,
});

// A mutation stand-in whose mutate is a spy.
export const mutation = (fn = vi.fn()) => ({ mutate: fn, isPending: false, isError: false });

// Renders `ui` at /tier/Rock/duel... with the board loaded; returns the store.
// `context`: the Layout's outlet context (e.g. { pushSongs }).
export function renderDuel(ui, path = '/tier/Rock/duel', { context } = {}) {
  const store = makeStore({ playlists: ['S', 'A', 'B', 'TODO'].map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 1 })), naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data: BOARD }));
  renderWithApp(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="*" element={ui} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { store }
  );
  return store;
}
