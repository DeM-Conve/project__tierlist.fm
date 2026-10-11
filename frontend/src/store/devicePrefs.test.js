import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_UI, SETTINGS } from '../settings';

const SIDEBAR_STATE_KEY = DEVICE_UI.sidebar.key;

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

describe('other device prefs held in Redux, across a reload', () => {
  it('the repeat mode and Add songs\' last board come back', async () => {
    let { store } = await freshStore();
    const focus = await import('./focusSlice');
    const addSongs = await import('./addSongsSlice');
    expect(store.getState().focus.repeatMode).toBe('off');
    expect(store.getState().addSongs.lastBoard).toBeNull();
    store.dispatch(focus.cycleRepeat());
    store.dispatch(focus.cycleRepeat());
    store.dispatch(addSongs.addVideos([{ videoId: 'v1', title: 'Song' }]));
    store.dispatch(addSongs.recordAction({ entry: { kind: 'file', video: { videoId: 'v1' }, category: 'Rap', tier: 'S', playlistId: 'p1' }, nextId: null }));
    ({ store } = await freshStore());
    expect(store.getState().focus.repeatMode).toBe('one');
    expect(store.getState().addSongs.lastBoard).toBe('Rap');
    // Nothing else of the queue / session is kept.
    expect(store.getState().focus.current).toBeNull();
    expect(store.getState().addSongs.queue).toEqual([]);
  });

  it('bad saved values start from the defaults', async () => {
    localStorage.setItem(DEVICE_UI.repeatMode.key, JSON.stringify('forever'));
    localStorage.setItem(DEVICE_UI.addSongsLastBoard.key, JSON.stringify(7));
    const { store } = await freshStore();
    expect(store.getState().focus.repeatMode).toBe('off');
    expect(store.getState().addSongs.lastBoard).toBeNull();
  });
});

// The user found {"duelStrategy":"tierAwareMerge"} still in their storage,
// left by the retired frontend duel strategies. Boot cleans it up.
describe('boot cleans this browser\'s storage', () => {
  it('drops retired keys and unknown fields of the cached settings', async () => {
    localStorage.setItem('ytTierApp:prefs', JSON.stringify({ duelStrategy: 'tierAwareMerge' }));
    localStorage.setItem('ytTierApp:duelStrategy', JSON.stringify('tierAwareMerge'));
    localStorage.setItem(SETTINGS.appearance, JSON.stringify({ theme: 'solarized', accent: 'green', tierPalette: 'heat', duelStrategy: 'tierAwareMerge' }));
    const { store } = await freshStore();
    expect(localStorage.getItem('ytTierApp:prefs')).toBeNull();
    expect(localStorage.getItem('ytTierApp:duelStrategy')).toBeNull();
    const appearance = JSON.parse(localStorage.getItem(SETTINGS.appearance));
    expect(appearance).not.toHaveProperty('duelStrategy');
    expect(appearance).toEqual(store.getState().appearance);
    expect(appearance).toMatchObject({ theme: 'solarized', accent: 'green', tierPalette: 'heat' });
  });
});
