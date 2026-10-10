import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rebase, sameSettings, toServer } from './settingsMapping';
import appearanceReducer, { setAccent, setActivityOrder, setTheme, setTierPalette } from '../store/appearanceSlice';
import { DEFAULT_ACTIVITY_ORDER } from '../activityOrder';
import namingReducer, { linkTodoList } from '../store/namingSlice';
import { settingsLoaded } from '../store/settingsActions';
import { DEFAULT_TIER_LABELS } from '../tiers';
import { NO_DISPLAY_NAMES } from '../naming';

const CUSTOM = { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'TZ', TODO: '(**TODO**)' };

const dto = (over = {}) => ({
  appearance: { theme: 'tokyo', accent: 'blue', tierPalette: 'vivid', activityOrder: DEFAULT_ACTIVITY_ORDER, ...over.appearance },
  naming: {
    template: '{category} {tier}',
    tierLabels: DEFAULT_TIER_LABELS,
    tierDisplayNames: NO_DISPLAY_NAMES,
    migratingFrom: null,
    migratingFromTierLabels: null,
    todoLinks: {},
    ...over.naming,
  },
});

const makeStore = () => configureStore({ reducer: { appearance: appearanceReducer, naming: namingReducer } });

describe('toServer', () => {
  it('maps the default Redux state to the full DTO shape', () => {
    expect(toServer(makeStore().getState())).toEqual(dto());
  });

  it('drops client-only fields (needsDetection)', () => {
    const body = toServer(makeStore().getState());
    expect(body.naming).not.toHaveProperty('needsDetection');
    expect(Object.keys(body)).toEqual(['appearance', 'naming']);
  });

  it('undefined / missing fields become null', () => {
    const body = toServer({ appearance: {}, naming: {} });
    expect(body.appearance).toEqual({ theme: null, accent: null, tierPalette: null, activityOrder: null });
    expect(Object.values(body.naming).every((x) => x === null)).toBe(true);
  });

  it('reflects edits', () => {
    const s = makeStore();
    s.dispatch(setTheme('paper'));
    s.dispatch(setTierPalette('heat'));
    s.dispatch(linkTodoList({ playlistId: 'p', category: 'Rap' }));
    const body = toServer(s.getState());
    expect(body.appearance.theme).toBe('paper');
    expect(body.appearance.tierPalette).toBe('heat');
    expect(body.naming.todoLinks).toEqual({ p: 'Rap' });
  });

  it('sends the activity bar order', () => {
    const s = makeStore();
    s.dispatch(setActivityOrder(['playlists', 'home', 'jump', 'boards', 'addSongs']));
    expect(toServer(s.getState()).appearance.activityOrder).toEqual(['playlists', 'home', 'jump', 'boards', 'addSongs']);
  });

  it('round-trips: DTO -> settingsLoaded -> toServer gives the same DTO', () => {
    const account = dto({
      appearance: { theme: 'solarized', accent: 'amber', tierPalette: 'heat', activityOrder: ['addSongs', 'jump', 'home', 'boards', 'playlists'] },
      naming: {
        template: '[{my_label}] {category} - {tier}',
        tierLabels: CUSTOM,
        tierDisplayNames: { ...NO_DISPLAY_NAMES, S: 'Gold' },
        todoLinks: { p1: 'Rap', p2: 'Música' },
      },
    });
    const s = makeStore();
    s.dispatch(settingsLoaded(account));
    expect(toServer(s.getState())).toEqual(account);
    expect(sameSettings(toServer(s.getState()), account)).toBe(true);
  });

  it('round-trips a half-finished migration', () => {
    const account = dto({ naming: { tierLabels: CUSTOM, migratingFrom: '{category} - {tier}', migratingFromTierLabels: DEFAULT_TIER_LABELS } });
    const s = makeStore();
    s.dispatch(settingsLoaded(account));
    expect(toServer(s.getState())).toEqual(account);
  });

  it('normalises an unknown option on load (so the next save fixes the row)', () => {
    const s = makeStore();
    s.dispatch(settingsLoaded(dto({ appearance: { theme: 'retired-theme' } })));
    expect(toServer(s.getState()).appearance.theme).toBe('tokyo');
  });
});

describe('sameSettings', () => {
  it('equal DTOs (different object identity) are the same', () => {
    expect(sameSettings(dto(), dto())).toBe(true);
  });

  it('compares tierLabels / todoLinks by value', () => {
    expect(sameSettings(dto({ naming: { tierLabels: { ...CUSTOM } } }), dto({ naming: { tierLabels: { ...CUSTOM } } }))).toBe(true);
    expect(sameSettings(dto({ naming: { tierLabels: CUSTOM } }), dto())).toBe(false);
    expect(sameSettings(dto({ naming: { todoLinks: { p: 'Rap' } } }), dto({ naming: { todoLinks: { p: 'Jazz' } } }))).toBe(false);
    expect(sameSettings(dto({ naming: { todoLinks: { p: 'Rap' } } }), dto({ naming: { todoLinks: {} } }))).toBe(false);
  });

  it('detects a primitive change in any group', () => {
    expect(sameSettings(dto(), dto({ appearance: { accent: 'red' } }))).toBe(false);
    expect(sameSettings(dto(), dto({ appearance: { tierPalette: 'heat' } }))).toBe(false);
    expect(sameSettings(dto(), dto({ naming: { template: '{tier} | {category}' } }))).toBe(false);
  });

  it('compares the activity order by value, order mattering', () => {
    expect(sameSettings(dto({ appearance: { activityOrder: [...DEFAULT_ACTIVITY_ORDER] } }), dto())).toBe(true);
    expect(sameSettings(dto({ appearance: { activityOrder: ['jump', 'home', 'boards', 'playlists', 'addSongs'] } }), dto())).toBe(false);
  });

  it('null vs an object is different; null vs null is the same', () => {
    expect(sameSettings(dto({ naming: { migratingFromTierLabels: CUSTOM } }), dto())).toBe(false);
    expect(sameSettings(null, null)).toBe(true);
    expect(sameSettings(dto(), null)).toBe(false);
    expect(sameSettings(undefined, dto())).toBe(false);
  });

  it('ignores fields outside the schema', () => {
    const a = dto();
    const b = { ...dto(), extra: 1, naming: { ...dto().naming, needsDetection: true } };
    expect(sameSettings(a, b)).toBe(true);
  });

  it('a missing group compares as all-undefined', () => {
    const a = { appearance: dto().appearance };
    expect(sameSettings(a, dto())).toBe(false);
  });
});

describe('rebase (three-way merge after a 412)', () => {
  it('no base: the account’s copy wins outright', () => {
    const local = dto({ appearance: { theme: 'paper' } });
    const fresh = dto({ appearance: { theme: 'sand' } });
    expect(rebase(local, null, fresh)).toBe(fresh);
    expect(rebase(local, undefined, fresh)).toBe(fresh);
  });

  it('no fresh copy: keep local', () => {
    const local = dto();
    expect(rebase(local, dto(), null)).toBe(local);
    expect(rebase(local, null, undefined)).toBe(local);
  });

  it('nothing changed locally: take the server', () => {
    const base = dto();
    const fresh = dto({ appearance: { accent: 'teal', tierPalette: 'heat' } });
    expect(rebase(dto(), base, fresh)).toEqual(fresh);
  });

  it('this browser’s edits sit on top of the newer row', () => {
    const base = dto();
    const local = dto({ appearance: { theme: 'paper' } });
    const fresh = dto({ appearance: { accent: 'teal', tierPalette: 'heat' } });
    expect(rebase(local, base, fresh)).toEqual(dto({ appearance: { theme: 'paper', accent: 'teal', tierPalette: 'heat' } }));
  });

  it('the same field changed on both sides: this browser wins', () => {
    const base = dto();
    const local = dto({ appearance: { theme: 'paper' } });
    const fresh = dto({ appearance: { theme: 'dracula' } });
    expect(rebase(local, base, fresh).appearance.theme).toBe('paper');
  });

  it('object fields: an unchanged-by-value copy takes the server value', () => {
    const base = dto({ naming: { tierLabels: { ...DEFAULT_TIER_LABELS } } });
    const local = dto({ naming: { tierLabels: { ...DEFAULT_TIER_LABELS } } });
    const fresh = dto({ naming: { tierLabels: CUSTOM } });
    expect(rebase(local, base, fresh).naming.tierLabels).toEqual(CUSTOM);
  });

  it('object fields changed locally are kept whole', () => {
    const base = dto();
    const local = dto({ naming: { tierLabels: CUSTOM } });
    const fresh = dto({ naming: { template: '{category} - {tier}' } });
    const merged = rebase(local, base, fresh);
    expect(merged.naming.tierLabels).toEqual(CUSTOM);
    expect(merged.naming.template).toBe('{category} - {tier}');
  });

  it('a change back to null locally is kept', () => {
    const base = dto({ naming: { migratingFrom: '{category} - {tier}', migratingFromTierLabels: CUSTOM } });
    const local = dto();
    const fresh = dto({ naming: { migratingFrom: '{category} - {tier}', migratingFromTierLabels: CUSTOM }, appearance: { tierPalette: 'heat' } });
    const merged = rebase(local, base, fresh);
    expect(merged.naming.migratingFrom).toBeNull();
    expect(merged.naming.migratingFromTierLabels).toBeNull();
    expect(merged.appearance.tierPalette).toBe('heat');
  });

  it('a reordered activity bar is kept over the newer row, other fields merged', () => {
    const mine = ['addSongs', 'home', 'jump', 'boards', 'playlists'];
    const merged = rebase(dto({ appearance: { activityOrder: mine } }), dto(), dto({ appearance: { theme: 'sand' } }));
    expect(merged.appearance).toEqual({ theme: 'sand', accent: 'blue', tierPalette: 'vivid', activityOrder: mine });
    // ...and another device's reorder is taken when this one didn't touch it.
    expect(rebase(dto({ appearance: { theme: 'paper' } }), dto(), dto({ appearance: { activityOrder: mine } })).appearance.activityOrder).toEqual(mine);
  });

  it('only schema fields appear in the result', () => {
    const merged = rebase({ ...dto(), junk: 1 }, dto(), dto());
    expect(Object.keys(merged)).toEqual(['appearance', 'naming']);
  });

  // BUG (merge granularity): rebase merges per *field*, so the object-valued
  // fields (todoLinks, tierLabels, tierDisplayNames) are all-or-nothing. Two
  // devices linking different to-do lists at the same time: the retrying
  // device's whole todoLinks map wins and the other device's link is
  // silently dropped - contradicting useSettingsSync's "nobody's change is
  // silently lost".
  it.fails('concurrent to-do links on two devices are both kept', () => {
    const base = dto({ naming: { todoLinks: {} } });
    const local = dto({ naming: { todoLinks: { mine: 'Rap' } } });
    const fresh = dto({ naming: { todoLinks: { theirs: 'Jazz' } } });
    expect(rebase(local, base, fresh).naming.todoLinks).toEqual({ mine: 'Rap', theirs: 'Jazz' });
  });

  it('documents current behaviour for concurrent to-do links: local map wins whole', () => {
    const base = dto({ naming: { todoLinks: {} } });
    const local = dto({ naming: { todoLinks: { mine: 'Rap' } } });
    const fresh = dto({ naming: { todoLinks: { theirs: 'Jazz' } } });
    expect(rebase(local, base, fresh).naming.todoLinks).toEqual({ mine: 'Rap' });
  });

  it('a rebased result applied via settingsLoaded lands in the slices', () => {
    const s = makeStore();
    s.dispatch(setAccent('pink'));
    const local = toServer(s.getState());
    const base = dto();
    const fresh = dto({ appearance: { tierPalette: 'heat' } });
    s.dispatch(settingsLoaded(rebase(local, base, fresh)));
    expect(s.getState().appearance.accent).toBe('pink');
    expect(s.getState().appearance.tierPalette).toBe('heat');
  });
});
