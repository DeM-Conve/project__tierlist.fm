import { afterEach, describe, expect, it, vi } from 'vitest';
import appearance, { selectActivityOrder, setAccent, setActivityOrder, setTheme, setTierPalette } from './appearanceSlice';
import { ACTIVITY_ITEMS, DEFAULT_ACTIVITY_ORDER, completeActivityOrder } from '../activityOrder';
import view, { setCurrentCategory, setHomeQuery, setMobileSidebarOpen, setSidebarQuery, toggleSidebarCollapsed, showSidebarView, setSidebarCollapsed } from './viewSlice';
import auth, { setLoggedIn, setPlaylists } from './authSlice';
import { settingsLoaded } from './settingsActions';
import { SETTINGS } from '../settings';

const init = (r) => r(undefined, { type: '@@init' });
const ORDER = { activityOrder: DEFAULT_ACTIVITY_ORDER };

describe('settingsActions', () => {
  it('settingsLoaded is a plain action creator', () => {
    expect(settingsLoaded.type).toBe('settings/loaded');
    expect(settingsLoaded({ a: 1 })).toEqual({ type: 'settings/loaded', payload: { a: 1 } });
    expect(settingsLoaded.match({ type: 'settings/loaded' })).toBe(true);
  });
});

describe('appearanceSlice', () => {
  it('defaults to Tokyo Night + Blue + Vivid', () => {
    expect(init(appearance)).toEqual({ theme: 'tokyo', accent: 'blue', tierPalette: 'vivid', ...ORDER });
  });

  it('setters', () => {
    let s = appearance(init(appearance), setTheme('paper'));
    s = appearance(s, setAccent('amber'));
    s = appearance(s, setTierPalette('heat'));
    expect(s).toEqual({ theme: 'paper', accent: 'amber', tierPalette: 'heat', ...ORDER });
  });

  it('settingsLoaded adopts the account’s appearance', () => {
    const s = appearance(init(appearance), settingsLoaded({ appearance: { theme: 'dracula', accent: 'violet', tierPalette: 'classic' } }));
    expect(s).toEqual({ theme: 'dracula', accent: 'violet', tierPalette: 'classic', ...ORDER });
  });

  it('settingsLoaded resolves unknown options to defaults', () => {
    const s = appearance(init(appearance), settingsLoaded({ appearance: { theme: 'nope', accent: 'teal', tierPalette: null } }));
    expect(s).toEqual({ theme: 'tokyo', accent: 'teal', tierPalette: 'vivid', ...ORDER });
  });

  it('setActivityOrder stores a complete order, selectActivityOrder reads it', () => {
    const mine = ['addSongs', 'boards', 'home', 'playlists', 'jump', 'duels'];
    const s = appearance(init(appearance), setActivityOrder(mine));
    expect(s.activityOrder).toEqual(mine);
    expect(selectActivityOrder({ appearance: s })).toEqual(mine);
    // Partial / junk input is completed, never stored as-is.
    expect(appearance(s, setActivityOrder(['playlists'])).activityOrder).toEqual(['playlists', 'home', 'jump', 'boards', 'addSongs', 'duels']);
    expect(appearance(s, setActivityOrder(null)).activityOrder).toEqual(DEFAULT_ACTIVITY_ORDER);
  });

  it('settingsLoaded adopts the account’s activity order, completing a partial one', () => {
    const s = appearance(init(appearance), settingsLoaded({ appearance: { theme: 'tokyo', accent: 'blue', tierPalette: 'vivid', activityOrder: ['jump', 'settings'] } }));
    expect(s.activityOrder).toEqual(['jump', 'home', 'boards', 'playlists', 'addSongs', 'duels']);
  });

  it('settingsLoaded without appearance keeps state', () => {
    const before = appearance(init(appearance), setTheme('sand'));
    expect(appearance(before, settingsLoaded({}))).toBe(before);
  });
});

describe('completeActivityOrder', () => {
  it('default order is the six items, top to bottom - Duels (added later) last', () => {
    expect(DEFAULT_ACTIVITY_ORDER).toEqual(['home', 'jump', 'boards', 'playlists', 'addSongs', 'duels']);
    expect(ACTIVITY_ITEMS).toBe(DEFAULT_ACTIVITY_ORDER);
  });

  it('keeps the given order, drops unknown ids and repeats, appends what is missing', () => {
    expect(completeActivityOrder(['boards', 'nope', 'boards', 'home'])).toEqual(['boards', 'home', 'jump', 'playlists', 'addSongs', 'duels']);
    expect(completeActivityOrder([])).toEqual(DEFAULT_ACTIVITY_ORDER);
    expect(completeActivityOrder(undefined)).toEqual(DEFAULT_ACTIVITY_ORDER);
    expect(completeActivityOrder('home')).toEqual(DEFAULT_ACTIVITY_ORDER);
  });
});

describe('boot cache for appearance', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('appearance reads the cached activity order', async () => {
    localStorage.setItem(SETTINGS.appearance, JSON.stringify({ theme: 'tokyo', activityOrder: ['addSongs', 'home'] }));
    vi.resetModules();
    const { default: fresh } = await import('./appearanceSlice');
    expect(init(fresh).activityOrder).toEqual(['addSongs', 'home', 'jump', 'boards', 'playlists', 'duels']);
  });

  it('appearance reads the cached choice', async () => {
    localStorage.setItem(SETTINGS.appearance, JSON.stringify({ theme: 'solarized', accent: 'green', tierPalette: 'heat' }));
    vi.resetModules();
    const { default: fresh } = await import('./appearanceSlice');
    expect(init(fresh)).toEqual({ theme: 'solarized', accent: 'green', tierPalette: 'heat', ...ORDER });
  });
});

describe('viewSlice', () => {
  it('initial state', () => {
    expect(init(view)).toEqual({ currentCategory: null, sidebarQuery: '', homeQuery: '', mobileSidebarOpen: false, sidebarCollapsed: false, sidebarView: 'boards' });
  });

  it('setters are independent', () => {
    let s = view(init(view), setCurrentCategory('Rap'));
    s = view(s, setSidebarQuery('ja'));
    s = view(s, setHomeQuery('ro'));
    s = view(s, setMobileSidebarOpen(true));
    expect(s).toEqual({ currentCategory: 'Rap', sidebarQuery: 'ja', homeQuery: 'ro', mobileSidebarOpen: true, sidebarCollapsed: false, sidebarView: 'boards' });
  });

  it('showSidebarView: another view opens it, the open view closes the panel, a closed panel reopens', () => {
    let s = view(init(view), showSidebarView('playlists'));
    expect(s).toMatchObject({ sidebarCollapsed: false, sidebarView: 'playlists' });
    s = view(s, showSidebarView('playlists'));
    expect(s).toMatchObject({ sidebarCollapsed: true, sidebarView: 'playlists' });
    s = view(s, showSidebarView('boards'));
    expect(s).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
  });

  it('setSidebarCollapsed follows the panel being dragged shut / open', () => {
    expect(view(init(view), setSidebarCollapsed(true)).sidebarCollapsed).toBe(true);
    expect(view(view(init(view), setSidebarCollapsed(true)), setSidebarCollapsed(false)).sidebarCollapsed).toBe(false);
  });

  it('toggleSidebarCollapsed folds and unfolds the sidebar', () => {
    let s = view(init(view), toggleSidebarCollapsed());
    expect(s.sidebarCollapsed).toBe(true);
    s = view(s, toggleSidebarCollapsed());
    expect(s.sidebarCollapsed).toBe(false);
  });
});

describe('authSlice', () => {
  it('initial state is "not checked / not loaded"', () => {
    expect(init(auth)).toEqual({ loggedIn: null, playlists: null });
  });

  it('setLoggedIn / setPlaylists', () => {
    let s = auth(init(auth), setLoggedIn(true));
    s = auth(s, setPlaylists([{ id: '1', title: 'Rap S' }]));
    expect(s).toEqual({ loggedIn: true, playlists: [{ id: '1', title: 'Rap S' }] });
    s = auth(s, setLoggedIn(false));
    s = auth(s, setPlaylists(null));
    expect(s).toEqual({ loggedIn: false, playlists: null });
  });
});
