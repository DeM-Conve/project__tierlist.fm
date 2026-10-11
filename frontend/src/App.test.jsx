import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import App from './App';
import AppearanceRoot from './components/AppearanceRoot';
import { store } from './store/store';
import { setLoadedCategory } from './store/tiersSlice';

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
  return render(
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
