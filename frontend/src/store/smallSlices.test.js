import { afterEach, describe, expect, it, vi } from 'vitest';
import appearance, { setAccent, setTheme, setTierPalette } from './appearanceSlice';
import view, { setCurrentCategory, setHomeQuery, setMobileSidebarOpen, setSidebarQuery, toggleSidebarCollapsed } from './viewSlice';
import auth, { setLoggedIn, setPlaylists } from './authSlice';
import { settingsLoaded } from './settingsActions';
import { SETTINGS } from '../settings';

const init = (r) => r(undefined, { type: '@@init' });

describe('settingsActions', () => {
  it('settingsLoaded is a plain action creator', () => {
    expect(settingsLoaded.type).toBe('settings/loaded');
    expect(settingsLoaded({ a: 1 })).toEqual({ type: 'settings/loaded', payload: { a: 1 } });
    expect(settingsLoaded.match({ type: 'settings/loaded' })).toBe(true);
  });
});

describe('appearanceSlice', () => {
  it('defaults to Tokyo Night + Blue + Vivid', () => {
    expect(init(appearance)).toEqual({ theme: 'tokyo', accent: 'blue', tierPalette: 'vivid' });
  });

  it('setters', () => {
    let s = appearance(init(appearance), setTheme('paper'));
    s = appearance(s, setAccent('amber'));
    s = appearance(s, setTierPalette('heat'));
    expect(s).toEqual({ theme: 'paper', accent: 'amber', tierPalette: 'heat' });
  });

  it('settingsLoaded adopts the account’s appearance', () => {
    const s = appearance(init(appearance), settingsLoaded({ appearance: { theme: 'dracula', accent: 'violet', tierPalette: 'classic' } }));
    expect(s).toEqual({ theme: 'dracula', accent: 'violet', tierPalette: 'classic' });
  });

  it('settingsLoaded resolves unknown options to defaults', () => {
    const s = appearance(init(appearance), settingsLoaded({ appearance: { theme: 'nope', accent: 'teal', tierPalette: null } }));
    expect(s).toEqual({ theme: 'tokyo', accent: 'teal', tierPalette: 'vivid' });
  });

  it('settingsLoaded without appearance keeps state', () => {
    const before = appearance(init(appearance), setTheme('sand'));
    expect(appearance(before, settingsLoaded({}))).toBe(before);
  });
});

describe('boot cache for appearance', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('appearance reads the cached choice', async () => {
    localStorage.setItem(SETTINGS.appearance, JSON.stringify({ theme: 'solarized', accent: 'green', tierPalette: 'heat' }));
    vi.resetModules();
    const { default: fresh } = await import('./appearanceSlice');
    expect(init(fresh)).toEqual({ theme: 'solarized', accent: 'green', tierPalette: 'heat' });
  });
});

describe('viewSlice', () => {
  it('initial state', () => {
    expect(init(view)).toEqual({ currentCategory: null, sidebarQuery: '', homeQuery: '', mobileSidebarOpen: false, sidebarCollapsed: false });
  });

  it('setters are independent', () => {
    let s = view(init(view), setCurrentCategory('Rap'));
    s = view(s, setSidebarQuery('ja'));
    s = view(s, setHomeQuery('ro'));
    s = view(s, setMobileSidebarOpen(true));
    expect(s).toEqual({ currentCategory: 'Rap', sidebarQuery: 'ja', homeQuery: 'ro', mobileSidebarOpen: true, sidebarCollapsed: false });
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
