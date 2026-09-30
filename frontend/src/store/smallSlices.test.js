import { afterEach, describe, expect, it, vi } from 'vitest';
import appearance, { setAccent, setTheme, setTierPalette } from './appearanceSlice';
import prefs, { setDuelStrategy } from './prefsSlice';
import view, { setCurrentCategory, setHomeQuery, setMobileSidebarOpen, setSidebarQuery } from './viewSlice';
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

describe('prefsSlice', () => {
  it('defaults to tierAwareMerge', () => {
    expect(init(prefs)).toEqual({ duelStrategy: 'tierAwareMerge' });
  });

  it('setDuelStrategy accepts known strategies only', () => {
    let s = prefs(init(prefs), setDuelStrategy('elo'));
    expect(s.duelStrategy).toBe('elo');
    s = prefs(s, setDuelStrategy('bogus'));
    expect(s.duelStrategy).toBe('elo');
    s = prefs(s, setDuelStrategy('mergeSort'));
    expect(s.duelStrategy).toBe('mergeSort');
  });

  it('settingsLoaded adopts / normalises / ignores', () => {
    const base = init(prefs);
    expect(prefs(base, settingsLoaded({ prefs: { duelStrategy: 'elo' } })).duelStrategy).toBe('elo');
    expect(prefs(base, settingsLoaded({ prefs: { duelStrategy: 'weird' } })).duelStrategy).toBe('tierAwareMerge');
    expect(prefs(base, settingsLoaded({}))).toBe(base);
  });

  // BUG (minor): DUEL_STRATEGIES is a plain object and the check is a
  // truthy lookup, so inherited keys like `toString` / `constructor` are
  // accepted as a strategy (and a cached `{ duelStrategy: 'toString' }`
  // would too); DuelView would then call Object.prototype.toString as a
  // strategy factory. Should be an own-key check (Object.hasOwn).
  it.fails('does not accept inherited object keys as strategies', () => {
    const s = prefs(init(prefs), setDuelStrategy('toString'));
    expect(s.duelStrategy).toBe('tierAwareMerge');
  });
});

describe('boot cache for appearance / prefs', () => {
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

  it('prefs reads the legacy duel-strategy key', async () => {
    localStorage.setItem(SETTINGS.duelStrategy, JSON.stringify('elo'));
    vi.resetModules();
    const { default: fresh } = await import('./prefsSlice');
    expect(init(fresh)).toEqual({ duelStrategy: 'elo' });
  });

  it('prefs key wins over the legacy key', async () => {
    localStorage.setItem(SETTINGS.duelStrategy, JSON.stringify('elo'));
    localStorage.setItem(SETTINGS.prefs, JSON.stringify({ duelStrategy: 'mergeSort' }));
    vi.resetModules();
    const { default: fresh } = await import('./prefsSlice');
    expect(init(fresh)).toEqual({ duelStrategy: 'mergeSort' });
  });
});

describe('viewSlice', () => {
  it('initial state', () => {
    expect(init(view)).toEqual({ currentCategory: null, sidebarQuery: '', homeQuery: '', mobileSidebarOpen: false });
  });

  it('setters are independent', () => {
    let s = view(init(view), setCurrentCategory('Rap'));
    s = view(s, setSidebarQuery('ja'));
    s = view(s, setHomeQuery('ro'));
    s = view(s, setMobileSidebarOpen(true));
    expect(s).toEqual({ currentCategory: 'Rap', sidebarQuery: 'ja', homeQuery: 'ro', mobileSidebarOpen: true });
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
