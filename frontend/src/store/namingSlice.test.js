import { afterEach, describe, expect, it, vi } from 'vitest';
import reducer, { detectedNaming, finishMigration, linkTodoList, setNaming, startMigration } from './namingSlice';
import { settingsLoaded } from './settingsActions';
import { DEFAULT_TIER_LABELS } from '../tiers';
import { NO_DISPLAY_NAMES } from '../naming';
import { SETTINGS } from '../settings';

const init = () => reducer(undefined, { type: '@@init' });
const CUSTOM = { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'TZ', TODO: '(**TODO**)' };

describe('namingSlice initial state (no saved settings)', () => {
  it('uses the default naming and asks for detection', () => {
    expect(init()).toEqual({
      template: '{category} {tier}',
      tierLabels: DEFAULT_TIER_LABELS,
      tierDisplayNames: NO_DISPLAY_NAMES,
      migratingFrom: null,
      migratingFromTierLabels: null,
      needsDetection: true,
      todoLinks: {},
    });
  });
});

describe('setNaming', () => {
  it('sets template, labels and display names, clears migration and detection', () => {
    let s = reducer(
      init(),
      startMigration({ from: { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS }, to: { template: '{tier} | {category}', tierLabels: CUSTOM } })
    );
    const shown = { ...NO_DISPLAY_NAMES, S: 'Best' };
    s = reducer(s, setNaming({ template: '{category} - {tier}', tierLabels: CUSTOM, tierDisplayNames: shown }));
    expect(s.template).toBe('{category} - {tier}');
    expect(s.tierLabels).toEqual(CUSTOM);
    expect(s.tierDisplayNames).toEqual(shown);
    expect(s.migratingFrom).toBeNull();
    expect(s.migratingFromTierLabels).toBeNull();
    expect(s.needsDetection).toBe(false);
  });

  it('keeps to-do links', () => {
    let s = reducer(init(), linkTodoList({ playlistId: 'p', category: 'Rap' }));
    s = reducer(s, setNaming({ template: '{category} {tier}', tierLabels: CUSTOM, tierDisplayNames: NO_DISPLAY_NAMES }));
    expect(s.todoLinks).toEqual({ p: 'Rap' });
  });
});

describe('detectedNaming', () => {
  it('applies while detection is needed, once', () => {
    let s = reducer(init(), detectedNaming({ template: '{category} - {tier}', tierLabels: CUSTOM }));
    expect(s.template).toBe('{category} - {tier}');
    expect(s.tierLabels).toEqual(CUSTOM);
    expect(s.needsDetection).toBe(false);
    s = reducer(s, detectedNaming({ template: '{tier} | {category}', tierLabels: DEFAULT_TIER_LABELS }));
    expect(s.template).toBe('{category} - {tier}');
  });

  it('never overrides a naming the user chose', () => {
    let s = reducer(init(), setNaming({ template: '{category} ({tier})', tierLabels: DEFAULT_TIER_LABELS, tierDisplayNames: NO_DISPLAY_NAMES }));
    s = reducer(s, detectedNaming({ template: '{category} - {tier}', tierLabels: CUSTOM }));
    expect(s.template).toBe('{category} ({tier})');
  });
});

describe('startMigration / finishMigration', () => {
  it('keeps the old naming recognised until finished', () => {
    let s = reducer(
      init(),
      startMigration({ from: { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS }, to: { template: '{category} - {tier}', tierLabels: CUSTOM } })
    );
    expect(s.migratingFrom).toBe('{category} {tier}');
    expect(s.migratingFromTierLabels).toEqual(DEFAULT_TIER_LABELS);
    expect(s.template).toBe('{category} - {tier}');
    expect(s.tierLabels).toEqual(CUSTOM);
    expect(s.needsDetection).toBe(false);
    s = reducer(s, finishMigration());
    expect(s.migratingFrom).toBeNull();
    expect(s.migratingFromTierLabels).toBeNull();
    expect(s.template).toBe('{category} - {tier}');
  });
});

describe('linkTodoList', () => {
  it('links a playlist to a board', () => {
    const s = reducer(init(), linkTodoList({ playlistId: 'p1', category: 'Rap' }));
    expect(s.todoLinks).toEqual({ p1: 'Rap' });
  });

  it('relinks to another board', () => {
    let s = reducer(init(), linkTodoList({ playlistId: 'p1', category: 'Rap' }));
    s = reducer(s, linkTodoList({ playlistId: 'p1', category: 'Jazz' }));
    expect(s.todoLinks).toEqual({ p1: 'Jazz' });
  });

  it('null category unlinks (back to automatic)', () => {
    let s = reducer(init(), linkTodoList({ playlistId: 'p1', category: 'Rap' }));
    s = reducer(s, linkTodoList({ playlistId: 'p2', category: 'Jazz' }));
    s = reducer(s, linkTodoList({ playlistId: 'p1', category: null }));
    expect(s.todoLinks).toEqual({ p2: 'Jazz' });
  });

  it('unlinking an unknown playlist is harmless', () => {
    const s = reducer(init(), linkTodoList({ playlistId: 'nope', category: null }));
    expect(s.todoLinks).toEqual({});
  });

  it('empty-string category also unlinks', () => {
    let s = reducer(init(), linkTodoList({ playlistId: 'p1', category: 'Rap' }));
    s = reducer(s, linkTodoList({ playlistId: 'p1', category: '' }));
    expect(s.todoLinks).toEqual({});
  });

  it('unicode board names', () => {
    const s = reducer(init(), linkTodoList({ playlistId: 'p1', category: 'Chanson française 🎵' }));
    expect(s.todoLinks.p1).toBe('Chanson française 🎵');
  });
});

describe('settingsLoaded', () => {
  const account = (naming) => settingsLoaded({ appearance: null, naming });

  it('adopts the account’s naming and skips detection', () => {
    const s = reducer(
      init(),
      account({
        template: '{category} - {tier}',
        tierLabels: CUSTOM,
        tierDisplayNames: { ...NO_DISPLAY_NAMES, TODO: 'Later' },
        migratingFrom: null,
        migratingFromTierLabels: null,
        todoLinks: { p: 'Rap' },
      })
    );
    expect(s).toEqual({
      template: '{category} - {tier}',
      tierLabels: CUSTOM,
      tierDisplayNames: { ...NO_DISPLAY_NAMES, TODO: 'Later' },
      migratingFrom: null,
      migratingFromTierLabels: null,
      needsDetection: false,
      todoLinks: { p: 'Rap' },
    });
  });

  it('keeps the current state when the account has no naming', () => {
    const before = reducer(init(), linkTodoList({ playlistId: 'p', category: 'Rap' }));
    expect(reducer(before, account(null))).toBe(before);
    expect(reducer(before, settingsLoaded({}))).toBe(before);
  });

  it('keeps the current state when the saved template is invalid', () => {
    const before = init();
    expect(reducer(before, account({ template: 'no tokens here', tierLabels: CUSTOM }))).toBe(before);
    expect(reducer(before, account({ template: 42, tierLabels: CUSTOM }))).toBe(before);
  });

  it('no saved tier names -> defaults and detection', () => {
    const s = reducer(init(), account({ template: '{category} {tier}', tierLabels: null }));
    expect(s.tierLabels).toEqual(DEFAULT_TIER_LABELS);
    expect(s.needsDetection).toBe(true);
  });

  it('invalid saved tier names fall back to the defaults', () => {
    const s = reducer(init(), account({ template: '{category} {tier}', tierLabels: { S: 'S', A: 'S', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } }));
    expect(s.tierLabels).toEqual(DEFAULT_TIER_LABELS);
  });

  it('partial display names are filled with nulls', () => {
    const s = reducer(init(), account({ template: '{category} {tier}', tierLabels: CUSTOM, tierDisplayNames: { S: 'Gold' } }));
    expect(s.tierDisplayNames).toEqual({ ...NO_DISPLAY_NAMES, S: 'Gold' });
  });

  it('invalid display names are dropped entirely', () => {
    const s = reducer(init(), account({ template: '{category} {tier}', tierLabels: CUSTOM, tierDisplayNames: { S: ' padded ' } }));
    expect(s.tierDisplayNames).toEqual(NO_DISPLAY_NAMES);
  });

  it('a half-finished rename always has both halves', () => {
    const onlyTemplate = reducer(init(), account({ template: '{category} - {tier}', tierLabels: CUSTOM, migratingFrom: '{category} {tier}' }));
    expect(onlyTemplate.migratingFrom).toBe('{category} {tier}');
    expect(onlyTemplate.migratingFromTierLabels).toEqual(CUSTOM);

    const onlyLabels = reducer(
      init(),
      account({ template: '{category} - {tier}', tierLabels: CUSTOM, migratingFromTierLabels: DEFAULT_TIER_LABELS })
    );
    expect(onlyLabels.migratingFrom).toBe('{category} - {tier}');
    expect(onlyLabels.migratingFromTierLabels).toEqual(DEFAULT_TIER_LABELS);
  });

  it('non-object todoLinks become {}', () => {
    const s = reducer(init(), account({ template: '{category} {tier}', tierLabels: CUSTOM, todoLinks: 'oops' }));
    expect(s.todoLinks).toEqual({});
  });

  it('a user token in the template is kept', () => {
    const s = reducer(init(), account({ template: '[{my_label}] {category} {tier}', tierLabels: CUSTOM }));
    expect(s.template).toBe('[{my_label}] {category} {tier}');
  });
});

describe('initial state from the localStorage boot cache', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('reads a saved naming', async () => {
    localStorage.setItem(SETTINGS.naming, JSON.stringify({ template: '{category} - {tier}', tierLabels: CUSTOM, todoLinks: { p: 'Rap' } }));
    vi.resetModules();
    const { default: fresh } = await import('./namingSlice');
    const s = fresh(undefined, { type: '@@init' });
    expect(s.template).toBe('{category} - {tier}');
    expect(s.tierLabels).toEqual(CUSTOM);
    expect(s.todoLinks).toEqual({ p: 'Rap' });
    expect(s.needsDetection).toBe(false);
  });

  it('ignores a corrupt cache', async () => {
    localStorage.setItem(SETTINGS.naming, '{not json');
    vi.resetModules();
    const { default: fresh } = await import('./namingSlice');
    expect(fresh(undefined, { type: '@@init' }).template).toBe('{category} {tier}');
  });
});
