import { describe, expect, it } from 'vitest';
import { PALETTE_HOTKEYS, SHORTCUTS, hotkeyForCommand, shortcutKey } from './shortcuts';

describe('SHORTCUTS', () => {
  it('is a non-empty list', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(10);
  });

  it('every entry has an id, non-empty keys, a description and a category', () => {
    for (const s of SHORTCUTS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(Array.isArray(s.keys)).toBe(true);
      expect(s.keys.length).toBeGreaterThan(0);
      s.keys.forEach((k) => expect(typeof k === 'string' && k.length > 0).toBe(true));
      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(0);
      expect(typeof s.category).toBe('string');
    }
  });

  it('ids are unique', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('commandIds are unique', () => {
    const ids = SHORTCUTS.map((s) => s.commandId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no two shortcuts in the same category share the exact same keys', () => {
    const seen = new Set();
    for (const s of SHORTCUTS) {
      const key = `${s.category}|${s.keys.join('+')}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('documents the core global shortcuts', () => {
    const byId = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));
    expect(byId.palette.keys).toEqual(['Ctrl', 'K']);
    expect(byId.undo.keys).toEqual(['Ctrl', 'Z']);
    expect(byId.help.keys).toEqual(['?']);
    expect(byId.push.keys).toEqual(['Shift', 'P']);
  });

  it('Vim sequences start with a registered prefix (g / y)', async () => {
    const { SEQUENCE_PREFIXES } = await import('./keyboard/sequence');
    const sequences = SHORTCUTS.filter((s) => s.category === 'Navigation (Vim)').flatMap((s) => s.keys).filter((k) => k.length === 2);
    expect(sequences.length).toBeGreaterThan(0);
    sequences.forEach((k) => expect(SEQUENCE_PREFIXES).toContain(k[0]));
  });
});

describe('the board header keys', () => {
  const BOARD = ['board-duel', 'board-play', 'board-shuffle'];

  it('are single, unmodified keys', () => {
    expect(BOARD.map(shortcutKey)).toEqual(['d', 'p', 's']);
  });

  it('collide with no key that is live on a board page', async () => {
    const { SEQUENCE_PREFIXES } = await import('./keyboard/sequence');
    // Global, Vim and player keys work everywhere; the board's own search too.
    const live = new Set(
      SHORTCUTS.filter((s) => ['Global', 'Navigation (Vim)', 'Player'].includes(s.category) || (s.category === 'Tier board' && !BOARD.includes(s.id)))
        .filter((s) => s.keys.length === 1 || !s.keys.some((k) => ['Ctrl', 'Shift', 'Alt', 'Cmd'].includes(k)))
        .flatMap((s) => s.keys)
    );
    for (const id of BOARD) {
      const key = shortcutKey(id);
      expect(live.has(key), `${id}: ${key}`).toBe(false);
      expect(SEQUENCE_PREFIXES).not.toContain(key);
    }
  });
});

describe('shortcutKey', () => {
  it('throws for an unknown or multi-key shortcut', () => {
    expect(() => shortcutKey('nope')).toThrow();
    expect(() => shortcutKey('palette')).toThrow();
  });
});

describe('hotkeyForCommand', () => {
  it('finds the keys for a command id', () => {
    expect(hotkeyForCommand('action-sync')).toEqual(['Shift', 'P']);
  });

  it('gives the palette its VS Code hints: Settings Ctrl+, and help ?', () => {
    expect(hotkeyForCommand('page-settings')).toEqual(['Ctrl', ',']);
    expect(hotkeyForCommand('action-shortcuts')).toEqual(['?']);
  });

  it('undefined for an unknown command', () => {
    expect(hotkeyForCommand('nope')).toBeUndefined();
  });

  it('documents: an undefined command id matches the first shortcut without a commandId', () => {
    // `s.commandId === undefined` is true for every entry lacking one.
    expect(hotkeyForCommand(undefined)).toEqual(SHORTCUTS[0].keys);
  });
});

describe('PALETTE_HOTKEYS', () => {
  it('opens the palette on Ctrl+K and VS Code’s Ctrl+P / Ctrl+Shift+P / F1', () => {
    expect(PALETTE_HOTKEYS).toEqual(['mod + K', 'mod + P', 'mod + shift + P', 'F1']);
  });
});
