import { describe, expect, it } from 'vitest';
import { effectiveTransfers, overlayTransfers, transferId, transferSyncRows } from './transfers';

const v = (videoId, id = `item-${videoId}`, extra = {}) => ({ videoId, id, title: `Song ${videoId}`, ...extra });
const t = (video, from, to, extra = {}) => ({
  id: video.id,
  video,
  fromCategory: from[0],
  fromTier: from[1],
  toCategory: to[0],
  toTier: to[1],
  ...extra,
});

describe('transferId', () => {
  it('is the playlist item id, falling back to the video id', () => {
    expect(transferId({ id: 'item1', videoId: 'v1' })).toBe('item1');
    expect(transferId({ videoId: 'v1' })).toBe('v1');
  });
});

describe('effectiveTransfers', () => {
  const song = v('a');
  const staged = t(song, ['Rock', 'A'], ['Pop', 'B']);

  it('keeps transfers to a board that is not open as stored', () => {
    expect(effectiveTransfers([staged], 'Jazz', {})).toEqual([staged]);
    expect(effectiveTransfers([staged], null, {})).toEqual([staged]);
  });

  it('on the target board, the card says where it goes', () => {
    const tierItems = { B: [], S: [{ ...song, transfer: song.id }] };
    expect(effectiveTransfers([staged], 'Pop', tierItems)).toEqual([{ ...staged, toTier: 'S' }]);
  });

  it('returns the same object when the card has not moved', () => {
    const tierItems = { B: [{ ...song, transfer: song.id }] };
    expect(effectiveTransfers([staged], 'Pop', tierItems)[0]).toBe(staged);
  });

  it('a card no longer on the target board (drop undone / discarded) cancels the transfer', () => {
    expect(effectiveTransfers([staged], 'Pop', { B: [] })).toEqual([]);
  });

  it('a card in the Remove bin cancels the transfer', () => {
    expect(effectiveTransfers([staged], 'Pop', { REMOVED: [{ ...song, transfer: song.id }] })).toEqual([]);
  });

  it('handles several transfers independently', () => {
    const other = t(v('b'), ['Rock', 'C'], ['Jazz', 'D']);
    const tierItems = { A: [{ ...song, transfer: song.id }] };
    expect(effectiveTransfers([staged, other], 'Pop', tierItems)).toEqual([{ ...staged, toTier: 'A' }, other]);
  });
});

describe('overlayTransfers', () => {
  const a = v('a');
  const b = v('b');

  it('removes a song that left from its tier on the source board', () => {
    const items = { A: [a, b], B: [] };
    const out = overlayTransfers(items, [t(a, ['Rock', 'A'], ['Pop', 'S'])], 'Rock');
    expect(out.A).toEqual([b]);
    expect(items.A).toEqual([a, b]); // not mutated
  });

  it('removes only the moved copy when a playlist holds the song twice', () => {
    const copy1 = v('a', 'item-1');
    const copy2 = v('a', 'item-2');
    const out = overlayTransfers({ A: [copy1, copy2] }, [t(copy1, ['Rock', 'A'], ['Pop', 'S'])], 'Rock');
    expect(out.A).toEqual([copy2]);
  });

  it('adds an arriving song to its tier on the target board, marked as a transfer', () => {
    const out = overlayTransfers({ S: [b] }, [t(a, ['Rock', 'A'], ['Pop', 'S'])], 'Pop');
    expect(out.S).toEqual([b, { ...a, transfer: a.id }]);
  });

  it('does not add the same arriving song twice', () => {
    const staged = t(a, ['Rock', 'A'], ['Pop', 'S']);
    const once = overlayTransfers({ S: [] }, [staged], 'Pop');
    expect(overlayTransfers(once, [staged], 'Pop').S).toHaveLength(1);
  });

  it('skips a target tier the board does not have', () => {
    const out = overlayTransfers({ S: [] }, [t(a, ['Rock', 'A'], ['Pop', 'D'])], 'Pop');
    expect(out).toEqual({ S: [] });
  });

  it('leaves unrelated boards alone', () => {
    const items = { A: [a] };
    expect(overlayTransfers(items, [t(a, ['Rock', 'A'], ['Pop', 'S'])], 'Jazz')).toEqual(items);
  });
});

describe('transferSyncRows', () => {
  const groups = { Pop: { S: { id: 'pl-pop-s' } }, Rock: { A: { id: 'pl-rock-a' } } };

  it('inserts into the target playlist and deletes the old item', () => {
    const a = v('a');
    const staged = t(a, ['Rock', 'A'], ['Pop', 'S']);
    expect(transferSyncRows([staged], groups)).toEqual([
      { transfer: staged, row: { videoId: 'a', title: 'Song a', fromItemId: 'item-a', toPlaylistId: 'pl-pop-s' } },
    ]);
  });

  it('leaves out a transfer whose target playlist is gone', () => {
    expect(transferSyncRows([t(v('a'), ['Rock', 'A'], ['Pop', 'D'])], groups)).toEqual([]);
    expect(transferSyncRows([t(v('a'), ['Rock', 'A'], ['Gone', 'S'])], groups)).toEqual([]);
  });
});
