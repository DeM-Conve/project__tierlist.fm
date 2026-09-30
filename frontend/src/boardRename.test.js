import { describe, expect, it } from 'vitest';
import { planBoardRename } from './boardRename';
import { selectTierGroups, selectTodoRows } from './store/selectors';
import { DEFAULT_TIER_LABELS } from './tiers';

const CUSTOM = {
  template: '[{tag}] {category} {tier}',
  tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: '(**TODO**)' },
};
const DEFAULT = { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS };

// The same state shape the app's selectors read.
function state(playlists, naming = CUSTOM, todoLinks = {}) {
  return {
    auth: { playlists },
    naming: { ...naming, migratingFrom: null, migratingFromTierLabels: null, todoLinks },
  };
}
const pl = (id, title, itemCount = 0) => ({ id, title, itemCount });

// What the app does after a rename: the new titles land in the playlist list.
function applyRename(playlists, changes) {
  const to = new Map(changes.map((c) => [c.id, c.to]));
  return playlists.map((p) => (to.has(p.id) ? { ...p, title: to.get(p.id) } : p));
}

const INDO = [
  pl('s', '[G] Indo_Normal T1', 7),
  pl('a', '[G] Indo_Normal T2', 10),
  pl('b', '[G] Indo_Normal T3', 17),
  pl('c', '[G] Indo_Normal TE', 25),
  pl('d', '[G] Indo_Normal TZ', 27),
  pl('todo', '[G] Indo_Normal (**TODO**)', 200),
  pl('other', '[G] Rock T1', 1),
  pl('private', 'My private mix', 50),
];

describe('planBoardRename', () => {
  it('renames every tier and the to-do list, keeping own tokens', () => {
    const groups = selectTierGroups(state(INDO));
    const { changes, error } = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'Indo Normal' });
    expect(error).toBeNull();
    expect(changes.map((c) => [c.id, c.to])).toEqual([
      ['s', '[G] Indo Normal T1'],
      ['a', '[G] Indo Normal T2'],
      ['b', '[G] Indo Normal T3'],
      ['c', '[G] Indo Normal TE'],
      ['d', '[G] Indo Normal TZ'],
      ['todo', '[G] Indo Normal (**TODO**)'],
    ]);
  });

  it('after the rename the board keeps the same to-do list (and its songs)', () => {
    const groups = selectTierGroups(state(INDO));
    const { changes } = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'Indo Normal' });
    const after = selectTierGroups(state(applyRename(INDO, changes)));
    expect(after.Indo_Normal).toBeUndefined();
    expect(after['Indo Normal'].TODO).toMatchObject({ id: 'todo', itemCount: 200 });
    expect(Object.keys(after['Indo Normal']).sort()).toEqual(['A', 'B', 'C', 'D', 'S', 'TODO']);
    expect(after.Rock.S.id).toBe('other');
  });

  it('renames a hand-linked to-do list to the template shape and keeps it on the board', () => {
    const playlists = [pl('s', '[G] Jazz T1', 3), pl('mine', 'Jazz stuff to check', 40)];
    const links = { mine: 'Jazz' };
    const groups = selectTierGroups(state(playlists, CUSTOM, links));
    expect(groups.Jazz.TODO.id).toBe('mine');
    const { changes, error } = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Jazz', rawName: 'Jazz Bebop' });
    expect(error).toBeNull();
    expect(changes.find((c) => c.id === 'mine').to).toBe('[G] Jazz Bebop (**TODO**)');
    const after = selectTierGroups(state(applyRename(playlists, changes), CUSTOM, {}));
    expect(after['Jazz Bebop'].TODO.id).toBe('mine');
  });

  it('squashes whitespace in the typed name', () => {
    const groups = selectTierGroups(state(INDO));
    const { name } = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: '  Indo    Normal ' });
    expect(name).toBe('Indo Normal');
  });

  it('unchanged name is not an error and changes nothing', () => {
    const groups = selectTierGroups(state(INDO));
    const r = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'Indo_Normal' });
    expect(r.error).toBeNull();
    expect(r.changes).toEqual([]);
  });

  it('refuses an empty name', () => {
    const groups = selectTierGroups(state(INDO));
    expect(planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: '   ' }).error).toBe('Enter a name');
  });

  it('refuses while changes are staged', () => {
    const groups = selectTierGroups(state(INDO));
    const r = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'X', pendingCount: 2 });
    expect(r.error).toMatch(/2 staged changes/);
    const one = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'X', pendingCount: 1 });
    expect(one.error).toMatch(/1 staged change first/);
  });

  it('refuses a name another board already has (normalized)', () => {
    const groups = selectTierGroups(state(INDO));
    expect(planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'rock' }).error).toMatch(/already a board called "Rock"/);
  });

  it('refuses a name the template would not read back', () => {
    const groups = selectTierGroups(state(INDO));
    // "()" is dropped as an empty bracket pair -> "[G] T1": no board left.
    const r = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: '()' });
    expect(r.error).toMatch(/wouldn't be recognised/);
  });

  it('allows a name that ends in a tier name (it still reads back)', () => {
    const groups = selectTierGroups(state(INDO));
    expect(planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Indo_Normal', rawName: 'Indo T1' }).error).toBeNull();
  });

  it('works with the default naming', () => {
    const playlists = [pl('1', 'Rap S', 1), pl('2', 'Rap A', 1), pl('3', 'Rap TODO', 9)];
    const groups = selectTierGroups(state(playlists, DEFAULT));
    const { changes, error } = planBoardRename({ naming: DEFAULT, tierGroups: groups, category: 'Rap', rawName: 'Hip Hop' });
    expect(error).toBeNull();
    expect(changes.map((c) => c.to)).toEqual(['Hip Hop S', 'Hip Hop A', 'Hip Hop TODO']);
    const after = selectTierGroups(state(applyRename(playlists, changes), DEFAULT));
    expect(after['Hip Hop'].TODO.id).toBe('3');
  });

  it('a board unknown to tierGroups plans nothing', () => {
    const r = planBoardRename({ naming: CUSTOM, tierGroups: {}, category: 'Nope', rawName: 'Other' });
    expect(r.plan).toEqual([]);
  });
});

describe('to-do list duplicates around a rename', () => {
  it('an empty same-named copy does not replace the real to-do list', () => {
    const playlists = [pl('empty', '[G] Rock (**TODO**)', 0), pl('s', '[G] Rock T1', 1), pl('real', '[G] Rock (**TODO**)', 200)];
    expect(selectTierGroups(state(playlists)).Rock.TODO.id).toBe('real');
    const rows = selectTodoRows(state(playlists));
    expect(rows.find((r) => r.playlist.id === 'empty').status).toBe('duplicate');
  });

  it('renaming onto a name that already has a to-do list keeps the bigger one', () => {
    // A stray "[G] New (**TODO**)" exists before "Old" is renamed to "New".
    const playlists = [pl('stray', '[G] New (**TODO**)', 0), pl('s', '[G] Old T1', 3), pl('todo', '[G] Old (**TODO**)', 120)];
    const groups = selectTierGroups(state(playlists));
    const { changes, error } = planBoardRename({ naming: CUSTOM, tierGroups: groups, category: 'Old', rawName: 'New' });
    expect(error).toBeNull();
    const after = selectTierGroups(state(applyRename(playlists, changes)));
    expect(after.New.TODO.id).toBe('todo');
  });
});
