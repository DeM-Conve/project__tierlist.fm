import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { spotlight } from '@mantine/spotlight';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import App from './App';
import AppearanceRoot from './components/AppearanceRoot';
import { store } from './store/store';
import { setLoadedCategory } from './store/tiersSlice';
import { moveWithFeedback } from './tierActions';

// A smoke test of the real shell (Layout: activity bar, resizable panel,
// canvas card, routes): every page mounts without throwing. It caught a
// crash no component test could - a hook reading a value declared below it.
const PLAYLISTS = [
  { id: 'p1', title: 'Rap S', itemCount: 3, thumbnail: null },
  { id: 'p2', title: 'Rap A', itemCount: 2, thumbnail: null },
];
const h = vi.hoisted(() => ({ board: null }));
vi.mock('./api/queries', async (importOriginal) => {
  const original = await importOriginal();
  return {
  ...original,
  useTierBoardQueries: (...args) => h.board ?? original.useTierBoardQueries(...args),
  useAuthStatusQuery: () => ({ data: { loggedIn: true }, isError: false }),
  usePlaylistsQuery: () => ({ data: PLAYLISTS }),
  };
});
vi.mock('./api/useSettingsSync', () => ({ useSettingsSync: () => ({ ready: true }) }));

function renderApp(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(appTree(queryClient, path));
}

function appTree(queryClient, path) {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <AppearanceRoot>
            <ProgressProvider>
              <App />
            </ProgressProvider>
          </AppearanceRoot>
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>
  );
}

describe('App shell', () => {
  it.each(['/', '/settings', '/add', '/tier/Rap', '/tier/Rap/duel'])('%s renders the shell without crashing', async (path) => {
    renderApp(path);
    expect(await screen.findByRole('navigation', { name: 'Activity bar' })).toBeInTheDocument();
    expect(document.querySelector('main')).toBeInTheDocument();
  });
});

// A board whose playlists couldn't be read says why. It used to "load" as
// empty tiers, and the duel hub then showed an empty score map at 0%.
describe('a board that failed to load', () => {
  afterEach(() => { h.board = null; });

  it.each(['/tier/Rap', '/tier/Rap/duel'])('%s shows the reason and a Retry, not an empty board', async (path) => {
    const retry = vi.fn();
    store.dispatch(setLoadedCategory(null)); // the shell tests above loaded Rap
    h.board = { data: null, isLoading: false, retry, presentTiers: ['S', 'A'],
      error: { response: { data: { detail: 'YouTube’s daily API quota for this app is used up.' } } } };
    renderApp(path);
    expect(await screen.findByText('Couldn’t load this board')).toBeInTheDocument();
    expect(screen.getByText(/daily API quota/)).toBeInTheDocument();
    expect(screen.queryByText('Settle the board.')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalled();
  });
});

// A board opened from the board cache (IndexedDB): shown at once from that
// copy; the background refresh replaces it only if nothing was edited.
describe('a board shown from the board cache', () => {
  const song = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Song ${videoId}`, thumbnail: null });
  const CACHED = { S: [song('cached00001')], A: [song('cached00002')] };
  const FRESH = { S: [song('cached00001'), song('fresh000001')], A: [song('cached00002')] };
  const board = (over) => ({ isLoading: false, error: null, retry: vi.fn(), presentTiers: ['S', 'A'], refreshError: null, ...over });
  const cached = board({ data: CACHED, dataUpdatedAt: 1000, isStale: true, isFetching: true });
  const fresh = board({ data: FRESH, dataUpdatedAt: 2000, isStale: false, isFetching: false });
  const sIds = () => store.getState().tiers.tierItems.S.map((v) => v.videoId);

  function openFromCache() {
    store.dispatch(setLoadedCategory(null));
    h.board = cached;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const view = render(appTree(queryClient, '/tier/Rap'));
    return (next) => { h.board = next; view.rerender(appTree(queryClient, '/tier/Rap')); };
  }
  afterEach(() => { h.board = null; });

  it('loads the cached copy, then the fresh one when it lands', async () => {
    const land = openFromCache();
    await screen.findByRole('navigation', { name: 'Activity bar' });
    expect(sIds()).toEqual(['cached00001']);
    land(fresh);
    expect(sIds()).toEqual(['cached00001', 'fresh000001']);
  });

  it('a refresh landing after a drag does not clobber it', async () => {
    const land = openFromCache();
    await screen.findByRole('navigation', { name: 'Activity bar' });
    act(() => { store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'cached00001', dropIndex: null }])); });
    land(fresh);
    expect(sIds()).toEqual([]);
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual(['cached00002', 'cached00001']);
  });

  it('a failed refresh keeps the board up, with a quiet notice instead of an error page', async () => {
    const land = openFromCache();
    await screen.findByRole('navigation', { name: 'Activity bar' });
    const quota = { response: { data: { detail: 'YouTube’s daily API quota for this app is used up.' } } };
    land(board({ data: CACHED, dataUpdatedAt: 1000, isStale: true, isFetching: false, refreshError: quota }));
    expect(await screen.findByText(/Showing the copy saved on this device/)).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t load this board')).not.toBeInTheDocument();
    expect(sIds()).toEqual(['cached00001']);
  });
});

// Duels are reachable from anywhere: the palette has a "Duel: <board>" for
// every board, and the side panel's board rows a Duel action.
describe('duel entry points', () => {
  it('the palette lists Duel: <board> and goes to that board’s duel hub', async () => {
    renderApp('/settings');
    act(() => spotlight.open());
    fireEvent.click(await screen.findByText('Duel: Rap'));
    expect(await screen.findByText('Settle the board.')).toBeInTheDocument();
    act(() => spotlight.close());
  });

  it('a board row’s Duel action in the side panel opens the duel hub', async () => {
    renderApp('/settings');
    fireEvent.click(await screen.findByRole('link', { name: 'Duel Rap' }));
    expect(await screen.findByText('Settle the board.')).toBeInTheDocument();
  });
});
