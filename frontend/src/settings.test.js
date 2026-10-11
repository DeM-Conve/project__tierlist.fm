import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEVICE_UI, RETIRED_KEYS, SETTINGS, cleanStorage, layoutStorage, readDevicePref, restoreSidebarLayout, shouldSaveLayout, useDevicePref, writeDevicePref,
} from './settings';

const SIDEBAR_STATE_KEY = DEVICE_UI.sidebar.key;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// Storage.prototype, since jsdom's localStorage methods live there.
const storageThrows = () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
};

describe('device prefs (readDevicePref / writeDevicePref)', () => {
  it('every pref has its own key in the ytTierApp: family and a valid default', () => {
    const keys = Object.values(DEVICE_UI).map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [name, pref] of Object.entries(DEVICE_UI)) {
      expect(pref.key).toMatch(/^ytTierApp:ui:/);
      expect(readDevicePref(name)).toEqual(pref.fallback);
      // The default itself passes validation.
      expect(pref.parse(pref.fallback)).toEqual(pref.fallback);
    }
  });

  it('saves and loads back', () => {
    writeDevicePref('sidebar', { collapsed: true, view: 'playlists' });
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY))).toEqual({ collapsed: true, view: 'playlists' });
    expect(readDevicePref('sidebar')).toEqual({ collapsed: true, view: 'playlists' });
    writeDevicePref('repeatMode', 'one');
    expect(readDevicePref('repeatMode')).toBe('one');
    writeDevicePref('playerVolume', { volume: 35, muted: true });
    expect(readDevicePref('playerVolume')).toEqual({ volume: 35, muted: true });
    writeDevicePref('duelMinutes', '15');
    expect(readDevicePref('duelMinutes')).toBe('15');
    writeDevicePref('addSongsLastBoard', 'Rap');
    expect(readDevicePref('addSongsLastBoard')).toBe('Rap');
  });

  it('bad JSON means the default', () => {
    for (const [name, pref] of Object.entries(DEVICE_UI)) {
      localStorage.setItem(pref.key, '{not json');
      expect(readDevicePref(name)).toEqual(pref.fallback);
    }
  });

  it('remembers the Duels view too', () => {
    writeDevicePref('sidebar', { collapsed: false, view: 'duels' });
    expect(readDevicePref('sidebar')).toEqual({ collapsed: false, view: 'duels' });
  });

  it('invalid values mean the default', () => {
    const bad = {
      repeatMode: ['shuffle', 1, null],
      playerVolume: [{ volume: 101, muted: false }, { volume: -1, muted: false }, { volume: 50.5, muted: false }, { volume: 50 }, 'loud', null],
      duelMinutes: ['7', 5, null],
      addSongsLastBoard: ['', 42, {}],
      sidebar: ['open', null, 3],
    };
    for (const [name, values] of Object.entries(bad)) {
      for (const v of values) {
        localStorage.setItem(DEVICE_UI[name].key, JSON.stringify(v));
        expect(readDevicePref(name), `${name} ${JSON.stringify(v)}`).toEqual(DEVICE_UI[name].fallback);
      }
    }
  });

  it('the sidebar is checked field by field', () => {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: 'yes', view: 'explorer' }));
    expect(readDevicePref('sidebar')).toEqual({ collapsed: false, view: 'boards' });
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: true, view: 'explorer' }));
    expect(readDevicePref('sidebar')).toEqual({ collapsed: true, view: 'boards' });
  });

  it('falls back to the defaults, and saving is a no-op, when storage throws', () => {
    storageThrows();
    for (const [name, pref] of Object.entries(DEVICE_UI)) {
      expect(readDevicePref(name)).toEqual(pref.fallback);
      expect(() => writeDevicePref(name, pref.fallback)).not.toThrow();
    }
  });
});

describe('useDevicePref', () => {
  it('starts from the saved value on the first render and saves changes', () => {
    writeDevicePref('duelMinutes', '15');
    const renders = [];
    const { result, unmount } = renderHook(() => {
      const pref = useDevicePref('duelMinutes');
      renders.push(pref[0]);
      return pref;
    });
    expect(renders[0]).toBe('15'); // no default-then-saved flash
    act(() => result.current[1]('2'));
    expect(result.current[0]).toBe('2');
    expect(readDevicePref('duelMinutes')).toBe('2');
    unmount();
    // A reload: a fresh hook reads what was saved.
    expect(renderHook(() => useDevicePref('duelMinutes')).result.current[0]).toBe('2');
  });

  it('defaults when nothing is saved, the data is bad, or storage throws', () => {
    expect(renderHook(() => useDevicePref('playerVolume')).result.current[0]).toEqual({ volume: 100, muted: false });
    localStorage.setItem(DEVICE_UI.playerVolume.key, JSON.stringify({ volume: 900, muted: false }));
    expect(renderHook(() => useDevicePref('playerVolume')).result.current[0]).toEqual({ volume: 100, muted: false });
    localStorage.setItem(DEVICE_UI.duelMinutes.key, '{oops');
    expect(renderHook(() => useDevicePref('duelMinutes')).result.current[0]).toBe('5');
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Mantine warns that storage is blocked
    storageThrows();
    const { result } = renderHook(() => useDevicePref('repeatMode'));
    expect(result.current[0]).toBe('off');
    expect(() => act(() => result.current[1]('all'))).not.toThrow();
    expect(result.current[0]).toBe('all');
  });
});

describe('cleanStorage (self-cleaning on boot)', () => {
  it('removes retired keys and rewrites stored entries with only the known fields', () => {
    localStorage.setItem('ytTierApp:prefs', JSON.stringify({ duelStrategy: 'tierAwareMerge' }));
    localStorage.setItem('ytTierApp:duelStrategy', JSON.stringify('tierAwareMerge'));
    localStorage.setItem(SETTINGS.appearance, JSON.stringify({ theme: 'tokyo', duelStrategy: 'tierAwareMerge' }));
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: true, view: 'nope', extra: 1 }));
    localStorage.setItem(DEVICE_UI.repeatMode.key, '{bad');
    localStorage.setItem('someone-else', 'kept');
    cleanStorage({ [SETTINGS.appearance]: { theme: 'tokyo' }, [SETTINGS.naming]: { template: '{category} {tier}' } });
    expect(RETIRED_KEYS).toEqual(['ytTierApp:duelStrategy', 'ytTierApp:prefs']);
    for (const key of RETIRED_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SETTINGS.appearance))).toEqual({ theme: 'tokyo' });
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY))).toEqual({ collapsed: true, view: 'boards' });
    expect(JSON.parse(localStorage.getItem(DEVICE_UI.repeatMode.key))).toBe('off');
    expect(localStorage.getItem('someone-else')).toBe('kept');
    // Nothing that wasn't stored gets created.
    expect(localStorage.getItem(SETTINGS.naming)).toBeNull();
    expect(localStorage.getItem(DEVICE_UI.duelMinutes.key)).toBeNull();
  });

  it('never throws when storage does', () => {
    storageThrows();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => cleanStorage({})).not.toThrow();
  });
});

describe('layoutStorage (for react-resizable-panels)', () => {
  it('passes values through', () => {
    layoutStorage.setItem('k', '{"a":1}');
    expect(layoutStorage.getItem('k')).toBe('{"a":1}');
    expect(layoutStorage.getItem('missing')).toBeNull();
  });

  it('hands back null for a corrupt entry instead of letting the library crash on it', () => {
    localStorage.setItem('k', '{oops');
    expect(layoutStorage.getItem('k')).toBeNull();
  });

  it('never throws when storage does', () => {
    storageThrows();
    expect(layoutStorage.getItem('k')).toBeNull();
    expect(() => layoutStorage.setItem('k', '1')).not.toThrow();
  });
});

describe('restoreSidebarLayout', () => {
  const saved = { 'sidebar-panel': 20, page: 80 };

  it('an open panel mounts at its saved width, or the default size with none saved', () => {
    expect(restoreSidebarLayout(saved, false)).toEqual(saved);
    expect(restoreSidebarLayout(undefined, false)).toBeUndefined();
    expect(restoreSidebarLayout({ 'sidebar-panel': 0, page: 100 }, false)).toBeUndefined();
  });

  it('a shut panel mounts collapsed, saved width or not', () => {
    expect(restoreSidebarLayout(saved, true)).toEqual({ 'sidebar-panel': 0, page: 100 });
    expect(restoreSidebarLayout(undefined, true)).toEqual({ 'sidebar-panel': 0, page: 100 });
  });
});

describe('shouldSaveLayout', () => {
  it('saves open layouts only, so the last open width survives shutting the panel', () => {
    expect(shouldSaveLayout({ 'sidebar-panel': 18, page: 82 })).toBe(true);
    expect(shouldSaveLayout({ 'sidebar-panel': 0, page: 100 })).toBe(false);
    expect(shouldSaveLayout({ page: 100 })).toBe(true);
  });
});
