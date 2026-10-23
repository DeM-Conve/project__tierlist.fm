import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import App from './App';
import AppearanceRoot from './components/AppearanceRoot';
import { makeStore } from './test/render';

// Home, the side panel and the privacy filter, on the real shell.
const PLAYLISTS = [
  { id: 'p1', title: 'Rap S', itemCount: 3, thumbnail: null },
  { id: 'p2', title: 'Rap A', itemCount: 2, thumbnail: null },
  { id: 'p3', title: 'Rap TODO', itemCount: 4, thumbnail: null },
  { id: 'p4', title: 'Rock S', itemCount: 1, thumbnail: null },
  { id: 'p5', title: 'R&B/Soul S', itemCount: 1, thumbnail: null },
  { id: 'secret', title: 'Holiday mix', itemCount: 9, thumbnail: null },
];
const h = vi.hoisted(() => ({ fetchVideo: null }));
vi.mock('./api/queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useFetchVideo: () => (id) => h.fetchVideo(id),
  useAuthStatusQuery: () => ({ data: { loggedIn: true, userId: 'u1' }, isError: false }),
  usePlaylistsQuery: () => ({ data: PLAYLISTS }),
}));
vi.mock('./api/useSettingsSync', () => ({ useSettingsSync: () => ({ ready: true }) }));

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function renderApp(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Provider store={makeStore({ playlists: PLAYLISTS })}>
        <MemoryRouter initialEntries={[path]}>
          <AppearanceRoot>
            <ProgressProvider>
              <App />
              <Where />
            </ProgressProvider>
          </AppearanceRoot>
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>
  );
}
const where = () => screen.getByTestId('where').textContent;
const sidePanel = () => screen.getByPlaceholderText('Filter boards…').closest('.mantine-Stack-root');

describe('Home', () => {
  it('a board card’s total is its ranked songs - the same number as the side panel (to-do has its own line)', async () => {
    renderApp('/');
    const card = (await screen.findByRole('button', { name: 'Open Rap' })).closest('.board-card');
    expect(within(card).getByText('5 videos')).toBeInTheDocument();
    expect(within(sidePanel()).getByRole('link', { name: /^Rap/ })).toHaveTextContent('5');
  });

  it('lists only playlists named by the template; the rest are a count, never a title', async () => {
    renderApp('/');
    expect(await screen.findByText('1 playlist hidden - not named by your template')).toBeInTheDocument();
    expect(screen.queryByText('Holiday mix')).not.toBeInTheDocument();
    expect(screen.getByText('Rap TODO')).toBeInTheDocument();
  });

  it('its filter and the side panel’s filter are independent', async () => {
    renderApp('/');
    fireEvent.change(await screen.findByPlaceholderText('Filter boards & playlists…'), { target: { value: 'rock' } });
    expect(screen.queryByRole('button', { name: 'Open Rap' })).not.toBeInTheDocument();
    expect(within(sidePanel()).getByRole('link', { name: /^Rap/ })).toBeInTheDocument();
  });
});

describe('old /playlist/<id> links', () => {
  it('go to that playlist’s tier page', async () => {
    renderApp('/playlist/p2');
    await screen.findByRole('navigation', { name: 'Activity bar' });
    expect(where()).toBe('/tier/Rap/t/A');
  });

  it('a playlist the template doesn’t name goes home - its contents are never shown', async () => {
    renderApp('/playlist/secret');
    await screen.findByRole('navigation', { name: 'Activity bar' });
    expect(where()).toBe('/');
  });
});

describe('pasting a YouTube link on any page', () => {
  it('shows that the song is being looked up, then opens Add songs with it', async () => {
    let land;
    h.fetchVideo = vi.fn(() => new Promise((resolve) => { land = resolve; }));
    const show = vi.spyOn(notifications, 'show');
    const hide = vi.spyOn(notifications, 'hide');
    renderApp('/');
    await screen.findByRole('navigation', { name: 'Activity bar' });
    const paste = new Event('paste', { bubbles: true });
    paste.clipboardData = { getData: () => 'https://youtu.be/pastedvid01' };
    act(() => { window.dispatchEvent(paste); });
    await waitFor(() => expect(show).toHaveBeenCalledWith(expect.objectContaining({ id: 'add-links', loading: true })));
    await act(async () => land({ videoId: 'pastedvid01', title: 'Pasted song', thumbnail: null }));
    await waitFor(() => expect(where()).toBe('/add'));
    expect(hide).toHaveBeenCalledWith('add-links');
    show.mockRestore();
    hide.mockRestore();
  });
});

describe('routing', () => {
  it.each([
    ['/nope', '/'],
    ['/login?error', '/'],
    ['/tier/Nope', '/'],
    ['/tier/Nope/duel', '/'],
  ])('%s (no such page / board) goes to %s', async (path, to) => {
    renderApp(path);
    await screen.findByRole('navigation', { name: 'Activity bar' });
    await waitFor(() => expect(where()).toBe(to));
  });

  it('a board whose name needs encoding opens, and its URL opens it again', async () => {
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Open R&B/Soul' }));
    expect(where()).toBe('/tier/R%26B%2FSoul');
    cleanup();
    renderApp('/tier/R%26B%2FSoul');
    expect(await screen.findByRole('heading', { name: 'R&B/Soul', level: 1 })).toBeInTheDocument();
    expect(where()).toBe('/tier/R%26B%2FSoul');
  });
});
