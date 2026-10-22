import { describe, expect, it } from 'vitest';
import { buildSyncPlan, resolveItemIds, songMoves, succeeded, syncOutcome, touchedPlaylists } from './syncPlan';

const groups = {
  Rock: { S: { id: 'rock-s' }, A: { id: 'rock-a' }, TODO: { id: 'rock-todo' } },
  Pop: { S: { id: 'pop-s' }, B: { id: 'pop-b' } },
};
const video = (videoId) => ({ videoId, id: `item-${videoId}`, title: videoId });
const move = { kind: 'move', video: video('m'), from: 'S', to: 'A' };
const removal = { kind: 'remove', video: video('r'), from: 'A', to: 'REMOVED' };
const dedupe = { kind: 'dedupe', video: video('d'), tier: 'TODO', keptTier: 'S' };
const transfer = { id: 'item-x', video: video('x'), fromCategory: 'Rock', fromTier: 'S', toCategory: 'Pop', toTier: 'B' };

describe('buildSyncPlan', () => {
  it('moves insert into the target tier; removals and duplicates only delete', () => {
    const { payload } = buildSyncPlan([move, removal, dedupe], [], groups, 'Rock');
    expect(payload).toEqual([
      { videoId: 'm', title: 'm', fromItemId: 'item-m', fromPlaylistId: 'rock-s', toPlaylistId: 'rock-a' },
      { videoId: 'r', title: 'r', fromItemId: 'item-r', fromPlaylistId: 'rock-a', toPlaylistId: null },
      { videoId: 'd', title: 'd', fromItemId: 'item-d', fromPlaylistId: 'rock-todo', toPlaylistId: null },
    ]);
  });

  it('transfers come after the board\'s own changes, aimed at the other board', () => {
    const plan = buildSyncPlan([move], [transfer], groups, 'Rock');
    expect(plan.payload[1]).toEqual({ videoId: 'x', title: 'x', fromItemId: 'item-x', fromPlaylistId: 'rock-s', toPlaylistId: 'pop-b' });
    expect(plan.transfers).toEqual([transfer]);
  });

  it('pushes transfers from any open board, even one not involved', () => {
    const plan = buildSyncPlan([], [transfer], groups, 'Jazz');
    expect(plan.payload).toHaveLength(1);
  });

  it('a transfer to a missing playlist is not sent', () => {
    const plan = buildSyncPlan([], [{ ...transfer, toTier: 'D' }], groups, 'Rock');
    expect(plan.payload).toEqual([]);
    expect(plan.transfers).toEqual([]);
  });

  it('nothing staged -> empty payload', () => {
    expect(buildSyncPlan([], [], groups, 'Rock').payload).toEqual([]);
  });
});

describe('succeeded', () => {
  const plan = buildSyncPlan([move, removal], [transfer], groups, 'Rock');

  it('splits the per-item results back into moves and transfers', () => {
    const done = succeeded(plan, [{ success: true }, { success: false }, { success: true }]);
    expect(done.moves).toEqual([move]);
    expect(done.transfers).toEqual([transfer]);
  });

  it('a failed transfer is not applied', () => {
    expect(succeeded(plan, [{ success: true }, { success: true }, { success: false }]).transfers).toEqual([]);
  });

  it('missing results count as failed', () => {
    expect(succeeded(plan, undefined)).toEqual({ moves: [], transfers: [] });
  });
});

describe('touchedPlaylists', () => {
  it('lists the open board\'s playlists plus both ends of each transfer', () => {
    const plan = buildSyncPlan([], [transfer], groups, 'Rock');
    expect(touchedPlaylists(plan, groups, 'Rock').sort()).toEqual(['pop-b', 'rock-a', 'rock-s', 'rock-todo']);
  });

  it('from an uninvolved board, just the transfer ends', () => {
    const plan = buildSyncPlan([], [transfer], groups, 'Jazz');
    expect(touchedPlaylists(plan, groups, 'Jazz').sort()).toEqual(['pop-b', 'rock-s']);
  });
});

describe('songMoves', () => {
  const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: videoId });
  const moves = [
    { kind: 'move', video: v('a'), from: 'S', to: 'A' },
    { kind: 'move', video: v('b'), from: 'A', to: 'B' },
    { kind: 'dedupe', video: v('a'), tier: 'B', keptTier: 'S' },
    { kind: 'remove', video: v('c'), from: 'B', to: 'REMOVED' },
  ];
  it('keeps just those songs\' tier moves - no other song, no removal or duplicate', () => {
    expect(songMoves(moves, ['a'])).toEqual([moves[0]]);
    expect(songMoves(moves, ['a', 'b']).map((m) => m.video.videoId)).toEqual(['a', 'b']);
    expect(songMoves(moves, ['c'])).toEqual([]);
  });
});

describe('syncOutcome (the backend\'s per-item results)', () => {
  const plan = buildSyncPlan([move, removal], [transfer], groups, 'Rock');
  const full = (newItemId) => ({ success: true, inserted: !!newItemId, removed: true, newItemId });

  it('every row names the playlist its item is in now (fromPlaylistId)', () => {
    expect(plan.payload.map((r) => r.fromPlaylistId)).toEqual(['rock-s', 'rock-a', 'rock-s']);
  });

  it('done rows give their new item ids', () => {
    const o = syncOutcome(plan, [full('new-m'), { success: true, inserted: false, removed: true }, full('new-x')]);
    expect(o.moves).toEqual([move, removal]);
    expect(o.transfers).toEqual([transfer]);
    expect(o.newIds).toEqual({ 'item-m': 'new-m', 'item-x': 'new-x' });
    expect(o.failures).toEqual({});
  });

  it('inserted but the delete failed: half done, with its step and reason', () => {
    const o = syncOutcome(plan, [
      { success: false, inserted: true, removed: false, newItemId: 'new-m', step: 'delete', error: 'YouTube is busy' },
      { success: true, removed: true },
      { success: false, inserted: true, removed: false, newItemId: 'new-x', step: 'delete', error: 'nope' },
    ]);
    expect(o.moves).toEqual([removal]);
    expect(o.insertedMoves).toEqual([move]);
    expect(o.insertedTransfers).toEqual([transfer]);
    expect(o.newIds).toEqual({ 'item-m': 'new-m', 'item-x': 'new-x' });
    expect(o.failures['item-m']).toEqual({ step: 'delete', error: 'YouTube is busy' });
  });

  it('an insert failure is a plain failure (nothing inserted, nothing half done)', () => {
    const o = syncOutcome(plan, [{ success: false, inserted: false, removed: false, step: 'insert', error: 'Quota used up' }]);
    expect(o.insertedMoves).toEqual([]);
    expect(o.failures['item-m']).toEqual({ step: 'insert', error: 'Quota used up' });
    expect(o.failures['item-x'].error).toMatch(/No answer/);
  });

  it('an insert-only row (no item to delete) with removed false is still done', () => {
    const p = buildSyncPlan([{ ...move, video: { videoId: 'n', title: 'n' } }], [], groups, 'Rock');
    expect(syncOutcome(p, [{ success: true, inserted: true, removed: false, newItemId: 'x' }]).moves).toHaveLength(1);
  });

  it('inserted with no id back: listed to look up in the target playlist', () => {
    const o = syncOutcome(plan, [{ success: true, inserted: true, removed: true, newItemId: null }]);
    expect(o.moves).toEqual([move]);
    expect(o.newIds).toEqual({});
    expect(o.unknownIds).toEqual([{ oldId: 'item-m', videoId: 'm', playlistId: 'rock-a' }]);
  });

  it('an old backend (success only) still works', () => {
    const o = syncOutcome(plan, [{ success: true }, { success: false, error: 'x' }, { success: true }]);
    expect(o.moves).toEqual([move]);
    expect(o.transfers).toEqual([transfer]);
    expect(o.failures['item-r']).toEqual({ step: 'delete', error: 'x' });
  });
});

describe('resolveItemIds', () => {
  it('finds the copy that is not the old item, the newest one', () => {
    const items = { 'rock-a': [{ videoId: 'm', id: 'item-m' }, { videoId: 'z', id: 'z1' }, { videoId: 'm', id: 'fresh' }] };
    expect(resolveItemIds([{ oldId: 'item-m', videoId: 'm', playlistId: 'rock-a' }], items)).toEqual({ 'item-m': 'fresh' });
  });

  it('not there yet -> nothing', () => {
    expect(resolveItemIds([{ oldId: 'item-m', videoId: 'm', playlistId: 'rock-a' }], {})).toEqual({});
  });
});
