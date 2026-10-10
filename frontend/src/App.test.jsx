import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import App from './App';
import AppearanceRoot from './components/AppearanceRoot';
import { store } from './store/store';

// A smoke test of the real shell (Layout: activity bar, resizable panel,
// canvas card, routes): every page mounts without throwing. It caught a
// crash no component test could - a hook reading a value declared below it.
const PLAYLISTS = [
  { id: 'p1', title: 'Rap S', itemCount: 3, thumbnail: null },
  { id: 'p2', title: 'Rap A', itemCount: 2, thumbnail: null },
];
vi.mock('./api/queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStatusQuery: () => ({ data: { loggedIn: true }, isError: false }),
  usePlaylistsQuery: () => ({ data: PLAYLISTS }),
}));
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
