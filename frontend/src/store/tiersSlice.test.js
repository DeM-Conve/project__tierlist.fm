import { describe, expect, it } from 'vitest';
import reducer, {
  addSyncedVideo,
  applySyncedMoves,
  applyTierOrder,
  discardTierChanges,
  moveVideoToTier,
  moveVideos,
  removeSyncedVideo,
  resetTierBoard,
  setDragOverTier,
  setDraggedVideoId,
  setLoadedCategory,
  setSyncStatus,
  setTierForCategory,
  setTierItems,
  undoLastEdit,
  redoLastEdit,
} from './tiersSlice';
import { REMOVED_TIER } from '../tiers';

const v = (id) => ({ videoId: id, title: `Song ${id}` });
const ids = (list) => (list || []).map((x) => x.videoId);
const init = () => reducer(undefined, { type: '@@init' });

// A board loaded the way useLoadTierBoard does it: reset, then one
// setTierForCategory per tier.
function loaded(tiers) {
  let s = reducer(init(), resetTierBoard({ presentTiers: Object.keys(tiers) }));
  for (const [tier, list] of Object.entries(tiers)) {
    s = reducer(s, setTierForCategory({ tier, videos: list.map(v) }));
  }
  return s;
}

describe('tiersSlice initial state', () => {
  it('starts empty and idle', () => {
    const s = init();
    expect(s.tierItems).toEqual({});
    expect(s.tierLoading).toEqual({});
    expect(s.originalTierItems).toEqual({});
    expect(s.originalTierOf).toEqual({});
    expect(s.syncStatus).toBe('idle');
    expect(s.draggedVideoId).toBeNull();
    expect(s.dragOverTier).toBeNull();
    expect(s.loadedCategory).toBeNull();
    expect(s.undoStack).toEqual([]);
  });
});

describe('resetTierBoard', () => {
  it('marks each present tier as loading', () => {
    const s = reducer(init(), resetTierBoard({ presentTiers: ['S', 'B', 'TODO'] }));
    expect(s.tierLoading).toEqual({ S: true, B: true, TODO: true });
  });

  it('clears items, baseline and undo stack', () => {
    let s = loaded({ S: ['a'], A: ['b'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    expect(s.undoStack).toHaveLength(1);
    s = reducer(s, resetTierBoard({ presentTiers: [] }));
    expect(s.tierItems).toEqual({});
    expect(s.originalTierItems).toEqual({});
    expect(s.originalTierOf).toEqual({});
    expect(s.undoStack).toEqual([]);
    expect(s.tierLoading).toEqual({});
  });

  it('does not touch loadedCategory (that is set separately once data has landed)', () => {
    let s = reducer(init(), setLoadedCategory('Rap'));
    s = reducer(s, resetTierBoard({ presentTiers: ['S'] }));
    expect(s.loadedCategory).toBe('Rap');
  });
});

describe('setLoadedCategory', () => {
  it('sets and clears the loaded category', () => {
    let s = reducer(init(), setLoadedCategory('Jazz'));
    expect(s.loadedCategory).toBe('Jazz');
    s = reducer(s, setLoadedCategory(null));
    expect(s.loadedCategory).toBeNull();
  });

  it('accepts unicode category names', () => {
    const s = reducer(init(), setLoadedCategory('Été · 夏'));
    expect(s.loadedCategory).toBe('Été · 夏');
  });
});

describe('setTierForCategory', () => {
  it('fills the draft and the baseline and clears the loading flag', () => {
    let s = reducer(init(), resetTierBoard({ presentTiers: ['S', 'A'] }));
    s = reducer(s, setTierForCategory({ tier: 'S', videos: [v('a'), v('b')] }));
    expect(ids(s.tierItems.S)).toEqual(['a', 'b']);
    expect(ids(s.originalTierItems.S)).toEqual(['a', 'b']);
    expect(s.tierLoading).toEqual({ S: false, A: true });
  });

  it('records which tiers each video originally lives in', () => {
    const s = loaded({ S: ['a', 'b'], A: ['c'] });
    expect(s.originalTierOf).toEqual({ a: ['S'], b: ['S'], c: ['A'] });
  });

  it('records a video in two tiers as both (a genuine duplicate)', () => {
    const s = loaded({ S: ['a'], B: ['a'] });
    expect(s.originalTierOf.a).toEqual(['S', 'B']);
  });

  it('records a video twice in one playlist only once for that tier', () => {
    const s = loaded({ S: ['a', 'a'] });
    expect(s.originalTierOf.a).toEqual(['S']);
    expect(ids(s.tierItems.S)).toEqual(['a', 'a']);
  });

  it('handles an empty tier', () => {
    const s = loaded({ D: [] });
    expect(s.tierItems.D).toEqual([]);
    expect(s.tierLoading.D).toBe(false);
    expect(s.originalTierOf).toEqual({});
  });

  it('loading the same tier again does not duplicate originalTierOf entries', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, setTierForCategory({ tier: 'S', videos: [v('a')] }));
    expect(s.originalTierOf.a).toEqual(['S']);
  });

  it('works for the TODO tier', () => {
    const s = loaded({ TODO: ['t'] });
    expect(s.originalTierOf.t).toEqual(['TODO']);
  });

  it('does not push an undo step', () => {
    expect(loaded({ S: ['a'] }).undoStack).toEqual([]);
  });
});

describe('setTierItems and simple setters', () => {
  it('setTierItems replaces the whole draft', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, setTierItems({ A: [v('z')] }));
    expect(s.tierItems).toEqual({ A: [v('z')] });
    // baseline untouched
    expect(ids(s.originalTierItems.S)).toEqual(['a']);
  });

  it('setSyncStatus / drag setters', () => {
    let s = reducer(init(), setSyncStatus('syncing'));
    expect(s.syncStatus).toBe('syncing');
    s = reducer(s, setDraggedVideoId('a'));
    expect(s.draggedVideoId).toBe('a');
    s = reducer(s, setDragOverTier('B'));
    expect(s.dragOverTier).toBe('B');
    s = reducer(s, setDraggedVideoId(null));
    s = reducer(s, setDragOverTier(null));
    expect(s.draggedVideoId).toBeNull();
    expect(s.dragOverTier).toBeNull();
  });
});

describe('moveVideoToTier', () => {
  it('appends to the end of the target tier when no dropIndex is given', () => {
    let s = loaded({ S: ['a', 'b'], A: ['c', 'd'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    expect(ids(s.tierItems.S)).toEqual(['b']);
    expect(ids(s.tierItems.A)).toEqual(['c', 'd', 'a']);
  });

  it('inserts at dropIndex in the target tier', () => {
    let s = loaded({ S: ['a'], A: ['c', 'd'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a', dropIndex: 1 }));
    expect(ids(s.tierItems.A)).toEqual(['c', 'a', 'd']);
  });

  it('inserts at the very start with dropIndex 0', () => {
    let s = loaded({ S: ['a'], A: ['c', 'd'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a', dropIndex: 0 }));
    expect(ids(s.tierItems.A)).toEqual(['a', 'c', 'd']);
  });

  it('clamps an out-of-range dropIndex', () => {
    let s = loaded({ S: ['a', 'b'], A: ['c'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a', dropIndex: 99 }));
    expect(ids(s.tierItems.A)).toEqual(['c', 'a']);
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'b', dropIndex: -5 }));
    expect(ids(s.tierItems.A)).toEqual(['b', 'c', 'a']);
  });

  it('creates a target tier that did not exist yet', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'D', videoId: 'a' }));
    expect(ids(s.tierItems.D)).toEqual(['a']);
    expect(s.tierItems.S).toEqual([]);
  });

  it('moves into the REMOVED bin like any tier', () => {
    let s = loaded({ S: ['a', 'b'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'a' }));
    expect(ids(s.tierItems[REMOVED_TIER])).toEqual(['a']);
    expect(ids(s.tierItems.S)).toEqual(['b']);
  });

  it('moves out of the REMOVED bin (putting a song back)', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'a' }));
    s = reducer(s, moveVideoToTier({ fromTier: REMOVED_TIER, toTier: 'S', videoId: 'a' }));
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(s.tierItems[REMOVED_TIER]).toEqual([]);
  });

  it('keeps the moved video object (same data)', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    expect(s.tierItems.A[0]).toEqual(v('a'));
  });

  it('is a no-op on the items when the video is not in fromTier', () => {
    const before = loaded({ S: ['a'], A: ['b'] });
    const s = reducer(before, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'zzz' }));
    expect(s.tierItems).toEqual(before.tierItems);
  });

  it('is a no-op on the items when fromTier does not exist', () => {
    const before = loaded({ S: ['a'] });
    const s = reducer(before, moveVideoToTier({ fromTier: 'C', toTier: 'S', videoId: 'a' }));
    expect(s.tierItems).toEqual(before.tierItems);
  });

  it('documents: a no-op move still pushes an undo step', () => {
    const s = reducer(loaded({ S: ['a'] }), moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'nope' }));
    expect(s.undoStack).toHaveLength(1);
  });

  it('does not change the baseline', () => {
    let s = loaded({ S: ['a'], A: [] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    expect(ids(s.originalTierItems.S)).toEqual(['a']);
    expect(s.originalTierOf.a).toEqual(['S']);
  });

  describe('reorder within a tier', () => {
    it('moves a video later (dropIndex counts slots before removal)', () => {
      let s = loaded({ S: ['a', 'b', 'c', 'd'] });
      // Drop "a" in the slot before "c" (index 2) -> b a c d
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'a', dropIndex: 2 }));
      expect(ids(s.tierItems.S)).toEqual(['b', 'a', 'c', 'd']);
    });

    it('moves a video to the end', () => {
      let s = loaded({ S: ['a', 'b', 'c'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'a', dropIndex: 3 }));
      expect(ids(s.tierItems.S)).toEqual(['b', 'c', 'a']);
    });

    it('moves a video earlier', () => {
      let s = loaded({ S: ['a', 'b', 'c', 'd'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'd', dropIndex: 1 }));
      expect(ids(s.tierItems.S)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('dropping a video onto its own slot leaves the order unchanged', () => {
      let s = loaded({ S: ['a', 'b', 'c'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'b', dropIndex: 1 }));
      expect(ids(s.tierItems.S)).toEqual(['a', 'b', 'c']);
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'b', dropIndex: 2 }));
      expect(ids(s.tierItems.S)).toEqual(['a', 'b', 'c']);
    });

    it('with no dropIndex does nothing', () => {
      let s = loaded({ S: ['a', 'b'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'a' }));
      expect(ids(s.tierItems.S)).toEqual(['a', 'b']);
    });

    it('clamps a huge dropIndex to the end', () => {
      let s = loaded({ S: ['a', 'b', 'c'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'a', dropIndex: 50 }));
      expect(ids(s.tierItems.S)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('same video twice in one playlist (ranks are positions)', () => {
    // BUG: applyMove removes *every* copy of the video from the source tier
    // (`filter(v => v.videoId !== videoId)`) but only inserts one copy in the
    // target, so moving one copy of a video a playlist holds twice silently
    // drops the other copy from the draft.
    it.fails('moving one copy to another tier keeps the other copy', () => {
      let s = loaded({ S: ['a', 'x', 'a'], A: [] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
      expect(ids(s.tierItems.S)).toEqual(['x', 'a']);
      expect(ids(s.tierItems.A)).toEqual(['a']);
    });

    // BUG: same cause - reordering one copy within the tier loses the other.
    it.fails('reordering one copy keeps both copies', () => {
      let s = loaded({ S: ['a', 'x', 'a'] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'a', dropIndex: 2 }));
      expect(s.tierItems.S).toHaveLength(3);
    });

    it('documents current behaviour: both copies leave the source tier, one arrives', () => {
      let s = loaded({ S: ['a', 'x', 'a'], A: [] });
      s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
      expect(ids(s.tierItems.S)).toEqual(['x']);
      expect(ids(s.tierItems.A)).toEqual(['a']);
    });
  });
});

describe('moveVideos (batch)', () => {
  it('applies every move in order', () => {
    let s = loaded({ S: ['a', 'b'], A: ['c'], B: [] });
    s = reducer(
      s,
      moveVideos({
        moves: [
          { fromTier: 'S', toTier: 'B', videoId: 'a' },
          { fromTier: 'A', toTier: 'B', videoId: 'c' },
          { fromTier: 'S', toTier: 'A', videoId: 'b', dropIndex: 0 },
        ],
      })
    );
    expect(s.tierItems.S).toEqual([]);
    expect(ids(s.tierItems.A)).toEqual(['b']);
    expect(ids(s.tierItems.B)).toEqual(['a', 'c']);
  });

  it('is one undo step for the whole batch', () => {
    let s = loaded({ S: ['a', 'b'], A: [] });
    s = reducer(
      s,
      moveVideos({
        moves: [
          { fromTier: 'S', toTier: 'A', videoId: 'a' },
          { fromTier: 'S', toTier: 'A', videoId: 'b' },
        ],
      })
    );
    expect(s.undoStack).toHaveLength(1);
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a', 'b']);
    expect(s.tierItems.A).toEqual([]);
  });

  it('chains moves of the same video', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(
      s,
      moveVideos({
        moves: [
          { fromTier: 'S', toTier: 'A', videoId: 'a' },
          { fromTier: 'A', toTier: 'D', videoId: 'a' },
        ],
      })
    );
    expect(ids(s.tierItems.D)).toEqual(['a']);
    expect(s.tierItems.A).toEqual([]);
  });

  it('skips moves whose video is missing, applying the rest', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(
      s,
      moveVideos({
        moves: [
          { fromTier: 'S', toTier: 'A', videoId: 'ghost' },
          { fromTier: 'S', toTier: 'A', videoId: 'a' },
        ],
      })
    );
    expect(ids(s.tierItems.A)).toEqual(['a']);
  });

  it('an empty batch changes nothing but still pushes an undo step', () => {
    const before = loaded({ S: ['a'] });
    const s = reducer(before, moveVideos({ moves: [] }));
    expect(s.tierItems).toEqual(before.tierItems);
    expect(s.undoStack).toHaveLength(1);
  });
});

describe('applyTierOrder', () => {
  it('replaces the ranked tiers given and keeps the others (TODO)', () => {
    let s = loaded({ S: ['a'], A: ['b'], TODO: ['t'] });
    s = reducer(s, applyTierOrder({ S: [v('b')], A: [v('a')] }));
    expect(ids(s.tierItems.S)).toEqual(['b']);
    expect(ids(s.tierItems.A)).toEqual(['a']);
    expect(ids(s.tierItems.TODO)).toEqual(['t']);
  });

  it('is undoable', () => {
    let s = loaded({ S: ['a'], A: ['b'] });
    s = reducer(s, applyTierOrder({ S: [v('b')], A: [v('a')] }));
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(ids(s.tierItems.A)).toEqual(['b']);
  });
});

describe('undo stack', () => {
  it('undo restores the exact previous state (positions included)', () => {
    let s = loaded({ S: ['a', 'b', 'c'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'S', videoId: 'c', dropIndex: 0 }));
    expect(ids(s.tierItems.S)).toEqual(['c', 'a', 'b']);
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a', 'b', 'c']);
  });

  it('undoes newest first, step by step', () => {
    let s = loaded({ S: ['a'], A: [], B: [] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    s = reducer(s, moveVideoToTier({ fromTier: 'A', toTier: 'B', videoId: 'a' }));
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.A)).toEqual(['a']);
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(s.undoStack).toEqual([]);
  });

  it('undo with an empty stack is a no-op', () => {
    const before = loaded({ S: ['a'] });
    const s = reducer(before, undoLastEdit());
    expect(s.tierItems).toEqual(before.tierItems);
    expect(s.undoStack).toEqual([]);
  });

  it('caps the stack at 50 steps, dropping the oldest', () => {
    let s = loaded({ S: ['a'], A: [] });
    for (let i = 0; i < 60; i++) {
      const [from, to] = i % 2 === 0 ? ['S', 'A'] : ['A', 'S'];
      s = reducer(s, moveVideoToTier({ fromTier: from, toTier: to, videoId: 'a' }));
    }
    expect(s.undoStack).toHaveLength(50);
    for (let i = 0; i < 50; i++) s = reducer(s, undoLastEdit());
    // 60 moves, the first 10 snapshots were dropped: we land at the state
    // after move #10, which (even count) has "a" back in S.
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(s.undoStack).toEqual([]);
    const again = reducer(s, undoLastEdit());
    expect(again.tierItems).toEqual(s.tierItems);
  });

  it('undo snapshots are not mutated by later edits', () => {
    let s = loaded({ S: ['a', 'b'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    const snap = s.undoStack[0];
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'b' }));
    expect(ids(snap.S)).toEqual(['a', 'b']);
  });

  it('undo can bring a song back out of the REMOVED bin', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'a' }));
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(s.tierItems[REMOVED_TIER]).toBeUndefined();
  });
});

describe('discardTierChanges', () => {
  it('restores the baseline and resets sync status and undo', () => {
    let s = loaded({ S: ['a', 'b'], A: ['c'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'b' }));
    s = reducer(s, setSyncStatus('partial'));
    s = reducer(s, discardTierChanges());
    expect(ids(s.tierItems.S)).toEqual(['a', 'b']);
    expect(ids(s.tierItems.A)).toEqual(['c']);
    expect(s.tierItems[REMOVED_TIER]).toBeUndefined();
    expect(s.syncStatus).toBe('idle');
    expect(s.undoStack).toEqual([]);
  });

  it('gives a deep copy, not the baseline objects themselves', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, discardTierChanges());
    expect(s.tierItems).toEqual(s.originalTierItems);
    expect(s.tierItems.S).not.toBe(s.originalTierItems.S);
  });

  it('on a fresh board is harmless', () => {
    const s = reducer(init(), discardTierChanges());
    expect(s.tierItems).toEqual({});
  });
});

describe('addSyncedVideo / removeSyncedVideo', () => {
  it('addSyncedVideo appends to draft and baseline (not a pending change)', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, addSyncedVideo({ tier: 'S', video: v('n') }));
    expect(ids(s.tierItems.S)).toEqual(['a', 'n']);
    expect(ids(s.originalTierItems.S)).toEqual(['a', 'n']);
    expect(s.originalTierOf.n).toEqual(['S']);
  });

  it('addSyncedVideo creates a tier that was not loaded', () => {
    let s = loaded({ S: [] });
    s = reducer(s, addSyncedVideo({ tier: 'TODO', video: v('n') }));
    expect(ids(s.tierItems.TODO)).toEqual(['n']);
    expect(ids(s.originalTierItems.TODO)).toEqual(['n']);
  });

  it('addSyncedVideo of a song already in another tier records both', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, addSyncedVideo({ tier: 'B', video: v('a') }));
    expect(s.originalTierOf.a).toEqual(['S', 'B']);
  });

  it('addSyncedVideo does not push an undo step', () => {
    const s = reducer(loaded({ S: [] }), addSyncedVideo({ tier: 'S', video: v('n') }));
    expect(s.undoStack).toEqual([]);
  });

  it('removeSyncedVideo reverses addSyncedVideo exactly', () => {
    const before = loaded({ S: ['a'] });
    let s = reducer(before, addSyncedVideo({ tier: 'S', video: v('n') }));
    s = reducer(s, removeSyncedVideo({ tier: 'S', videoId: 'n' }));
    expect(s.tierItems).toEqual(before.tierItems);
    expect(s.originalTierItems).toEqual(before.originalTierItems);
    expect(s.originalTierOf).toEqual(before.originalTierOf);
    expect('n' in s.originalTierOf).toBe(false);
  });

  it('removeSyncedVideo keeps the other tier a video is in', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, addSyncedVideo({ tier: 'B', video: v('a') }));
    s = reducer(s, removeSyncedVideo({ tier: 'B', videoId: 'a' }));
    expect(s.originalTierOf.a).toEqual(['S']);
    expect(ids(s.tierItems.S)).toEqual(['a']);
    expect(s.tierItems.B).toEqual([]);
  });

  it('removeSyncedVideo of an unknown video/tier does not throw', () => {
    const s = reducer(init(), removeSyncedVideo({ tier: 'C', videoId: 'x' }));
    expect(s.tierItems.C).toEqual([]);
    expect(s.originalTierOf).toEqual({});
  });
});

describe('applySyncedMoves', () => {
  it('a move becomes the new baseline', () => {
    let s = loaded({ S: ['a'], A: ['b'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'move', video: v('a'), from: 'S', to: 'A' }] }));
    expect(s.originalTierOf.a).toEqual(['A']);
    expect(ids(s.originalTierItems.S)).toEqual([]);
    expect(ids(s.originalTierItems.A)).toEqual(['b', 'a']);
    // The draft is left as the user arranged it.
    expect(ids(s.tierItems.A)).toEqual(['b', 'a']);
  });

  it('a move does not add a second copy to the target baseline', () => {
    let s = loaded({ S: ['a'], A: ['a'] });
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'move', video: v('a'), from: 'S', to: 'A' }] }));
    expect(ids(s.originalTierItems.A)).toEqual(['a']);
  });

  it('a move into a tier with no baseline yet creates it', () => {
    let s = loaded({ S: ['a'] });
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'move', video: v('a'), from: 'S', to: 'C' }] }));
    expect(ids(s.originalTierItems.C)).toEqual(['a']);
  });

  it('a dedupe drops the duplicate from draft and baseline', () => {
    let s = loaded({ S: ['a'], B: ['a', 'b'] });
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'dedupe', video: v('a'), tier: 'B', keptTier: 'S' }] }));
    expect(ids(s.tierItems.B)).toEqual(['b']);
    expect(ids(s.originalTierItems.B)).toEqual(['b']);
    expect(s.originalTierOf.a).toEqual(['S']);
    expect(ids(s.tierItems.S)).toEqual(['a']);
  });

  it('a remove empties it from the bin and the baseline', () => {
    let s = loaded({ S: ['a', 'b'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'a' }));
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'remove', video: v('a'), from: 'S', to: REMOVED_TIER }] }));
    expect(s.tierItems[REMOVED_TIER]).toEqual([]);
    expect(ids(s.originalTierItems.S)).toEqual(['b']);
    expect('a' in s.originalTierOf).toBe(false);
  });

  it('a remove of one copy of a duplicate keeps the other tier', () => {
    let s = loaded({ S: ['a'], B: ['a'] });
    s = reducer(s, moveVideoToTier({ fromTier: 'S', toTier: REMOVED_TIER, videoId: 'a' }));
    s = reducer(s, applySyncedMoves({ moves: [{ kind: 'remove', video: v('a'), from: 'S', to: REMOVED_TIER }] }));
    expect(s.originalTierOf.a).toEqual(['B']);
  });

  it('an empty move list changes nothing', () => {
    const before = loaded({ S: ['a'] });
    const s = reducer(before, applySyncedMoves({ moves: [] }));
    expect(s).toEqual(before);
  });
});

describe('redoLastEdit', () => {
  const move = (s, videoId, toTier) => reducer(s, moveVideoToTier({ fromTier: 'S', toTier, videoId }));

  it('re-applies what undo took back, and can be undone again', () => {
    let s = move(loaded({ S: ['a', 'b'], A: [] }), 'a', 'A');
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.A)).toEqual([]);
    s = reducer(s, redoLastEdit());
    expect(ids(s.tierItems.A)).toEqual(['a']);
    expect(ids(s.tierItems.S)).toEqual(['b']);
    expect(s.redoStack).toEqual([]);
    s = reducer(s, undoLastEdit());
    expect(ids(s.tierItems.S)).toEqual(['a', 'b']);
  });

  it('redoes several undone steps in order', () => {
    let s = move(move(loaded({ S: ['a', 'b'], A: [] }), 'a', 'A'), 'b', 'A');
    s = reducer(reducer(s, undoLastEdit()), undoLastEdit());
    s = reducer(s, redoLastEdit());
    expect(ids(s.tierItems.A)).toEqual(['a']);
    s = reducer(s, redoLastEdit());
    expect(ids(s.tierItems.A)).toEqual(['a', 'b']);
  });

  it('does nothing with nothing undone', () => {
    const s = move(loaded({ S: ['a'], A: [] }), 'a', 'A');
    expect(reducer(s, redoLastEdit())).toBe(s);
  });

  it('a new edit after an undo drops the redo history', () => {
    let s = move(loaded({ S: ['a', 'b'], A: [], B: [] }), 'a', 'A');
    s = reducer(s, undoLastEdit());
    s = move(s, 'b', 'B');
    expect(s.redoStack).toEqual([]);
    s = reducer(s, redoLastEdit());
    expect(ids(s.tierItems.A)).toEqual([]);
  });

  it('discarding or reloading the board drops the redo history', () => {
    let s = reducer(move(loaded({ S: ['a'], A: [] }), 'a', 'A'), undoLastEdit());
    expect(reducer(s, discardTierChanges()).redoStack).toEqual([]);
    expect(reducer(s, resetTierBoard({ presentTiers: ['S'] })).redoStack).toEqual([]);
    expect(reducer(s, setTierItems({ S: [] })).redoStack).toEqual([]);
  });
});
