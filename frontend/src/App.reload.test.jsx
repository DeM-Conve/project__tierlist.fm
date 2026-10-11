import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEVICE_UI } from './settings';

const SIDEBAR_STATE_KEY = DEVICE_UI.sidebar;

vi.mock('./api/queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStatusQuery: () => ({ data: { loggedIn: true }, isError: false }),
  usePlaylistsQuery: () => ({ data: [{ id: 'p1', title: 'Rap S', itemCount: 3, thumbnail: null }] }),
}));
vi.mock('./api/useSettingsSync', () => ({ useSettingsSync: () => ({ ready: true }) }));

// A reload: fresh modules (a fresh store) over what this device saved.
async function reload() {
  vi.resetModules();
  const React = await import('react');
  const { Provider } = await import('react-redux');
  const { MemoryRouter } = await import('react-router-dom');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { ProgressProvider } = await import('@bprogress/react');
  const { default: App } = await import('./App');
  const { default: AppearanceRoot } = await import('./components/AppearanceRoot');
  const { store } = await import('./store/store');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  const h = React.createElement;
  render(h(QueryClientProvider, { client: queryClient },
    h(Provider, { store },
      h(MemoryRouter, { initialEntries: ['/'] },
        h(AppearanceRoot, null, h(ProgressProvider, null, h(App)))))));
  await screen.findByRole('navigation', { name: 'Activity bar' });
  return store;
}

const LAYOUT_KEY = 'react-resizable-panels:workbench:sidebar-panel:page';
const panel = () => document.getElementById('sidebar-panel');
const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// The user's bug: shut the side panel, reload, and it was open again (on
// Tier lists, at the default width).
describe('the side panel after a reload', () => {
  it('stays shut - it mounts collapsed - and reopens on the view it was on', async () => {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: true, view: 'playlists' }));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ 'sidebar-panel': 20, page: 80 }));
    const store = await reload();
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: true, sidebarView: 'playlists' });
    expect(panel().style.flex).toMatch(/^0 /);
    expect(pressed('Tier lists')).toBe('false');
    expect(pressed('Playlists')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Tier lists' }));
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY))).toEqual({ collapsed: false, view: 'boards' });
  });

  it('comes back open at its saved width on its view', async () => {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: false, view: 'playlists' }));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ 'sidebar-panel': 20, page: 80 }));
    await reload();
    expect(panel().style.flex).toBe('20 1 0px');
    expect(pressed('Playlists')).toBe('true');
  });

  it('starts from the defaults when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const store = await reload();
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
    expect(pressed('Tier lists')).toBe('true');
  });

  it('a corrupt saved width is ignored, not a crash', async () => {
    localStorage.setItem(LAYOUT_KEY, '{oops');
    await reload();
    expect(panel()).toBeInTheDocument();
  });
});
