import { describe, expect, it } from 'vitest';
import { buildSyncPlan, succeeded, touchedPlaylists } from './syncPlan';

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
      { videoId: 'm', title: 'm', fromItemId: 'item-m', toPlaylistId: 'rock-a' },
      { videoId: 'r', title: 'r', fromItemId: 'item-r', toPlaylistId: null },
      { videoId: 'd', title: 'd', fromItemId: 'item-d', toPlaylistId: null },
    ]);
  });

  it('transfers come after the board\'s own changes, aimed at the other board', () => {
    const plan = buildSyncPlan([move], [transfer], groups, 'Rock');
    expect(plan.payload[1]).toEqual({ videoId: 'x', title: 'x', fromItemId: 'item-x', toPlaylistId: 'pop-b' });
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
