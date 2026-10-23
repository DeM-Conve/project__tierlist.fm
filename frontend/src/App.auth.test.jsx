import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import { notifications } from '@mantine/notifications';
import App from './App';
import AppearanceRoot from './components/AppearanceRoot';
import { makeStore } from './test/render';
import { api } from './api/client';
import { setLoggedIn } from './store/authSlice';

// Login / auth states and failed loads: every one says why - never a blank
// landing page, a spinner or skeletons forever.
const quota = { response: { data: { detail: 'YouTube’s daily API quota for this app is used up.' } } };
const h = vi.hoisted(() => ({
  auth: null,
  playlists: null,
}));
vi.mock('./api/queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStatusQuery: () => h.auth,
  usePlaylistsQuery: () => h.playlists,
}));
vi.mock('./api/useSettingsSync', () => ({ useSettingsSync: () => ({ ready: true }) }));

const PLAYLISTS = [
  { id: 'p1', title: 'Rap S', itemCount: 3, thumbnail: null },
  { id: 'p2', title: 'Rap A', itemCount: 2, thumbnail: null },
];
const loggedIn = { data: { loggedIn: true, userId: 'u1' }, isError: false, refetch: vi.fn() };

// As at boot: the login check hasn't answered yet.
function bootStore(playlists = null) {
  const store = makeStore({ playlists });
  store.dispatch(setLoggedIn(null));
  return store;
}

function renderApp(path, store = bootStore()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  render(
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
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the signed-out page', () => {
  it('says the server can’t be reached (with Retry) when the login check fails', async () => {
    const refetch = vi.fn();
    h.auth = { data: undefined, isError: true, error: new Error('Network Error'), refetch, isFetching: false };
    h.playlists = { data: undefined };
    renderApp('/');
    expect(await screen.findByText('Couldn’t reach the Tierlist.fm server')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('says Google sign-in didn’t finish after a failed login (?error)', async () => {
    h.auth = { data: { loggedIn: false }, isError: false, refetch: vi.fn() };
    h.playlists = { data: undefined };
    renderApp('/login?error');
    expect(await screen.findByText('Google sign-in didn’t finish')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('is just the landing page when simply logged out', async () => {
    h.auth = { data: { loggedIn: false }, isError: false, refetch: vi.fn() };
    h.playlists = { data: undefined };
    renderApp('/');
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the playlists list failing to load', () => {
  it.each(['/tier/Rap', '/tier/Rap/t/S'])('%s (a refresh straight onto a board) says why, with Retry - never skeletons forever', async (path) => {
    const refetch = vi.fn();
    h.auth = loggedIn;
    h.playlists = { data: undefined, error: quota, refetch, isFetching: false };
    renderApp(path);
    expect(await screen.findByText('Couldn’t load this board')).toBeInTheDocument();
    const page = within(document.querySelector('main'));
    expect(page.getByText(/daily API quota/)).toBeInTheDocument();
    fireEvent.click(page.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('a board whose login expired offers Log in again', async () => {
    h.auth = loggedIn;
    h.playlists = { data: undefined, refetch: vi.fn(), isFetching: false,
      error: { response: { status: 401, data: { detail: 'You’re not logged in (or your login expired) - log in again.' } } } };
    renderApp('/tier/Rap');
    expect(await screen.findByText('Couldn’t load this board')).toBeInTheDocument();
    expect(within(document.querySelector('main')).getByRole('button', { name: 'Log in again' })).toBeInTheDocument();
  });

  it('the side panel says so too, with Retry - not placeholders forever', async () => {
    const refetch = vi.fn();
    h.auth = loggedIn;
    h.playlists = { data: undefined, error: quota, refetch, isFetching: false };
    renderApp('/settings');
    const nav = await screen.findByText(/Couldn’t load your playlists\./);
    fireEvent.click(within(nav.parentElement).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('Home shows the reason with Retry / Log in again', async () => {
    h.auth = loggedIn;
    h.playlists = { data: undefined, error: quota, refetch: vi.fn(), isFetching: false };
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Log in again' })).toBeInTheDocument();
    expect(within(document.querySelector('main')).getByText(/daily API quota/)).toBeInTheDocument();
  });
});

describe('logging out', () => {
  it('a failed logout says so and keeps the app (the session is still alive)', async () => {
    h.auth = loggedIn;
    h.playlists = { data: PLAYLISTS };
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Network Error'));
    const show = vi.spyOn(notifications, 'show');
    const store = renderApp('/', bootStore(PLAYLISTS));
    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    await waitFor(() => expect(show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Couldn’t log out' })));
    expect(store.getState().auth.loggedIn).toBe(true);
  });
});
