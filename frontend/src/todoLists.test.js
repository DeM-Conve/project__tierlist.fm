import { describe, expect, it } from 'vitest';
import { boardsOf, resolveTodoLists, todoTitle } from './todoLists';
import { DEFAULT_TIER_LABELS, groupByTier } from './tiers';

const CUSTOM = {
  template: '[{tag}] {category} {tier}',
  tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: '(**TODO**)' },
};
const DEFAULT = { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS };
const pl = (id, title, itemCount = 0) => ({ id, title, itemCount });
const resolve = (playlists, { links = {}, boards = ['Rock'], namings = [CUSTOM] } = {}) =>
  resolveTodoLists(playlists, { links, boards: boards.map((category) => ({ category, fields: [] })), namings });
const statusOf = (rows) => Object.fromEntries(rows.map((r) => [r.playlist.id, r.status]));

describe('todoTitle', () => {
  it('renders the to-do name in the tier slot with the board values', () => {
    expect(todoTitle(CUSTOM, { category: 'Rock', fields: [{ tag: 'G' }] })).toBe('[G] Rock (**TODO**)');
    expect(todoTitle(DEFAULT, { category: 'Rap', fields: [] })).toBe('Rap TODO');
  });
  it('uses the first set of values when a board has several', () => {
    expect(todoTitle(CUSTOM, { category: 'Rock', fields: [{ tag: 'A' }, { tag: 'B' }] })).toBe('[A] Rock (**TODO**)');
  });
});

describe('boardsOf', () => {
  it('groups ranked playlists by board with distinct own-token values', () => {
    const ranked = [
      { parsed: { category: 'Rock', fields: { tag: 'G' } } },
      { parsed: { category: 'Rock', fields: { tag: 'G' } } },
      { parsed: { category: 'Rock', fields: { tag: 'H' } } },
      { parsed: { category: 'Rap', fields: {} } },
    ];
    expect(boardsOf(ranked)).toEqual([
      { category: 'Rock', fields: [{ tag: 'G' }, { tag: 'H' }] },
      { category: 'Rap', fields: [] },
    ]);
  });
  it('is empty for no playlists', () => {
    expect(boardsOf([])).toEqual([]);
  });
});

describe('resolveTodoLists', () => {
  it('matches the to-do name literally', () => {
    const rows = resolve([pl('1', '[G] Rock (**TODO**)'), pl('2', '[G] Rock TODO'), pl('3', 'Rock (**TODO**)')]);
    expect(rows.map((r) => r.playlist.id)).toEqual(['1']);
    expect(rows[0]).toMatchObject({ category: 'Rock', via: 'name', status: 'active', fields: { tag: 'G' } });
  });

  it('a to-do list for a board with no ranked tiers is missingBoard', () => {
    const rows = resolve([pl('1', '[G] Soul (**TODO**)', 30)]);
    expect(rows[0]).toMatchObject({ category: 'Soul', status: 'missingBoard' });
  });

  it('ignores playlists that are not to-do lists', () => {
    expect(resolve([pl('1', 'Liked'), pl('2', '[G] Rock T1')])).toEqual([]);
  });

  it('an explicit link beats a name match', () => {
    const rows = resolve([pl('named', '[G] Rock (**TODO**)', 500), pl('linked', 'anything', 1)], { links: { linked: 'Rock' } });
    expect(statusOf(rows)).toEqual({ named: 'duplicate', linked: 'active' });
  });

  it('a link to an unknown board is missingBoard', () => {
    const rows = resolve([pl('x', 'whatever')], { links: { x: 'Nope' } });
    expect(rows[0]).toMatchObject({ via: 'link', status: 'missingBoard', category: 'Nope' });
  });

  it('among same-named lists the one with more songs wins', () => {
    const rows = resolve([pl('new', '[G] Rock (**TODO**)', 1), pl('old', '[G] Rock (**TODO**)', 200)]);
    expect(statusOf(rows)).toEqual({ new: 'duplicate', old: 'active' });
  });

  it('on equal song counts the first one wins', () => {
    const rows = resolve([pl('first', '[G] Rock (**TODO**)', 5), pl('second', '[H] Rock (**TODO**)', 5)]);
    expect(statusOf(rows)).toEqual({ first: 'active', second: 'duplicate' });
  });

  it('a missing itemCount counts as 0', () => {
    const rows = resolve([{ id: 'a', title: '[G] Rock (**TODO**)' }, pl('b', '[G] Rock (**TODO**)', 3)]);
    expect(statusOf(rows)).toEqual({ a: 'duplicate', b: 'active' });
  });

  it('between several links to one board the bigger wins', () => {
    const rows = resolve([pl('l1', 'x', 2), pl('l2', 'y', 9)], { links: { l1: 'Rock', l2: 'Rock' } });
    expect(statusOf(rows)).toEqual({ l1: 'duplicate', l2: 'active' });
  });

  it('keeps one to-do list per board across boards', () => {
    const rows = resolve([pl('r', '[G] Rock (**TODO**)'), pl('p', '[G] Rap (**TODO**)')], { boards: ['Rock', 'Rap'] });
    expect(statusOf(rows)).toEqual({ r: 'active', p: 'active' });
  });

  it('returns rows in playlist order', () => {
    const rows = resolve([pl('small', '[G] Rock (**TODO**)', 1), pl('big', '[G] Rock (**TODO**)', 100)]);
    expect(rows.map((r) => r.playlist.id)).toEqual(['small', 'big']);
  });

  it('reads the old naming too while a migration is unfinished', () => {
    const rows = resolve([pl('1', 'Rock TODO')], { namings: [CUSTOM, DEFAULT] });
    expect(rows[0]).toMatchObject({ category: 'Rock', status: 'active' });
  });
});

describe('groupByTier', () => {
  it('groups by board then tier', () => {
    const groups = groupByTier([
      { id: '1', parsed: { category: 'Rock', tier: 'S' } },
      { id: '2', parsed: { category: 'Rock', tier: 'TODO' } },
      { id: '3', parsed: { category: 'Rap', tier: 'A' } },
    ]);
    expect(groups.Rock.S.id).toBe('1');
    expect(groups.Rock.TODO.id).toBe('2');
    expect(groups.Rap.A.id).toBe('3');
  });
  it('two playlists for one tier: the later one is kept (current behaviour)', () => {
    const groups = groupByTier([
      { id: 'first', parsed: { category: 'Rock', tier: 'S' } },
      { id: 'second', parsed: { category: 'Rock', tier: 'S' } },
    ]);
    expect(groups.Rock.S.id).toBe('second');
  });
});
