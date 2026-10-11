import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SIDEBAR_STATE, DEVICE_UI, layoutStorage, loadSidebarState, restoreSidebarLayout,
  saveSidebarState, shouldSaveLayout,
} from './settings';

const SIDEBAR_STATE_KEY = DEVICE_UI.sidebar;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// Storage.prototype, since jsdom's localStorage methods live there.
const storageThrows = () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
};

describe('sidebar state (per device)', () => {
  it('defaults to an open panel on Tier lists when nothing is saved', () => {
    expect(loadSidebarState()).toEqual(DEFAULT_SIDEBAR_STATE);
    expect(DEFAULT_SIDEBAR_STATE).toEqual({ collapsed: false, view: 'boards' });
  });

  it('saves and loads back', () => {
    saveSidebarState({ collapsed: true, view: 'playlists' });
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY))).toEqual({ collapsed: true, view: 'playlists' });
    expect(loadSidebarState()).toEqual({ collapsed: true, view: 'playlists' });
  });

  it('ignores bad JSON', () => {
    localStorage.setItem(SIDEBAR_STATE_KEY, '{not json');
    expect(loadSidebarState()).toEqual(DEFAULT_SIDEBAR_STATE);
  });

  it('ignores unknown values field by field', () => {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: 'yes', view: 'explorer' }));
    expect(loadSidebarState()).toEqual(DEFAULT_SIDEBAR_STATE);
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed: true, view: 'explorer' }));
    expect(loadSidebarState()).toEqual({ collapsed: true, view: 'boards' });
    localStorage.setItem(SIDEBAR_STATE_KEY, 'null');
    expect(loadSidebarState()).toEqual(DEFAULT_SIDEBAR_STATE);
  });

  it('falls back to the defaults, and saving is a no-op, when storage throws', () => {
    storageThrows();
    expect(loadSidebarState()).toEqual(DEFAULT_SIDEBAR_STATE);
    expect(() => saveSidebarState({ collapsed: true, view: 'playlists' })).not.toThrow();
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
