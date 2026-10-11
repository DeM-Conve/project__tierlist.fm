import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_UI } from '../settings';

const SIDEBAR_STATE_KEY = DEVICE_UI.sidebar;

// A reload is a fresh store: it must come back with the panel shut and the
// view the user left it on (per device, settings.js DEVICE_UI).
async function freshStore() {
  vi.resetModules();
  const { store } = await import('./store');
  const view = await import('./viewSlice');
  return { store, view };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.resetModules();
});

describe('sidebar state across a reload', () => {
  it('a shut panel and its view survive re-creating the store', async () => {
    let { store, view } = await freshStore();
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
    store.dispatch(view.showSidebarView('playlists'));
    store.dispatch(view.toggleSidebarCollapsed());
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY))).toEqual({ collapsed: true, view: 'playlists' });

    ({ store, view } = await freshStore());
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: true, sidebarView: 'playlists' });
    store.dispatch(view.openSidebarView('boards'));
    ({ store } = await freshStore());
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
  });

  it('the drawer and the filters are not kept', async () => {
    let { store, view } = await freshStore();
    store.dispatch(view.setMobileSidebarOpen(true));
    store.dispatch(view.setSidebarQuery('rap'));
    store.dispatch(view.setHomeQuery('rock'));
    ({ store } = await freshStore());
    expect(store.getState().view).toMatchObject({ mobileSidebarOpen: false, sidebarQuery: '', homeQuery: '' });
  });

  it('starts from the defaults when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { store, view } = await freshStore();
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
    expect(() => store.dispatch(view.toggleSidebarCollapsed())).not.toThrow();
  });
});
