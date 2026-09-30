import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { setPlaylists } from './authSlice';
import viewReducer, { setCurrentCategory } from './viewSlice';
import tiersReducer, {
  moveVideoToTier,
  resetTierBoard,
  setLoadedCategory,
  setTierForCategory,
  setTierItems,
} from './tiersSlice';
import focusReducer, { closeFocus, expandPlayer, minimizePlayer, openFocus, playNextInQueue } from './focusSlice';
import appearanceReducer from './appearanceSlice';
import namingReducer, { linkTodoList, setNaming, startMigration } from './namingSlice';
import prefsReducer from './prefsSlice';
import addSongsReducer from './addSongsSlice';
import {
  selectDuelPool,
  selectDuelRuns,
  selectDuelTierSizes,
  selectFocusSequence,
  selectFocusedAvailableTiers,
  selectFocusedVideoData,
  selectNaming,
  selectNamingSettings,
  selectNamings,
  selectPendingMoves,
  selectPlayerCoversPage,
  selectPlayingVideoIdOnBoard,
  selectRankedPlaylists,
  selectTierCategories,
  selectTierGroups,
  selectTierPlaylists,
  selectTodoRows,
  selectVideoLookup,
} from './selectors';
import { DEFAULT_TIER_LABELS, REMOVED_TIER } from '../tiers';
import { NO_DISPLAY_NAMES } from '../naming';

const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      view: viewReducer,
      tiers: tiersReducer,
      focus: focusReducer,
      appearance: appearanceReducer,
      naming: namingReducer,
      prefs: prefsReducer,
      addSongs: addSongsReducer,
    },
  });

const v = (id) => ({ videoId: id, title: `Song ${id}` });
const pl = (id, title, itemCount = 1) => ({ id, title, itemCount });

function withBoard(tiers, category = 'Rap') {
  const store = makeStore();
  store.dispatch(resetTierBoard({ presentTiers: Object.keys(tiers) }));
  for (const [tier, list] of Object.entries(tiers)) {
    store.dispatch(setTierForCategory({ tier, videos: list.map(v) }));
  }
  store.dispatch(setLoadedCategory(category));
  return store;
}

const move = (store, fromTier, toTier, videoId, dropIndex) =>
  store.dispatch(moveVideoToTier({ fromTier, toTier, videoId, dropIndex }));

const pending = (store) => selectPendingMoves(store.getState());
const summary = (store) =>
  pending(store).map((m) =>
    m.kind === 'dedupe' ? `dedupe ${m.video.videoId} ${m.tier}->${m.keptTier}` : `${m.kind} ${m.video.videoId} ${m.from}->${m.to}`
  );

describe('selectPendingMoves', () => {
  it('is empty for a freshly loaded board', () => {
    expect(pending(withBoard({ S: ['a'], A: ['b'], TODO: ['t'] }))).toEqual([]);
  });

  it('is empty for an empty store', () => {
    expect(pending(makeStore())).toEqual([]);
  });

  it('reports a move between tiers', () => {
    const s = withBoard({ S: ['a'], A: ['b'] });
    move(s, 'S', 'A', 'a');
    expect(pending(s)).toEqual([{ kind: 'move', video: v('a'), from: 'S', to: 'A' }]);
  });

  it('reports a move into and out of TODO', () => {
    const s = withBoard({ S: ['a'], TODO: ['t'] });
    move(s, 'S', 'TODO', 'a');
    move(s, 'TODO', 'B', 't');
    expect(summary(s)).toEqual(['move t TODO->B', 'move a S->TODO']);
  });

  it('reorders within a tier are not pending changes', () => {
    const s = withBoard({ S: ['a', 'b', 'c'] });
    move(s, 'S', 'S', 'c', 0);
    expect(pending(s)).toEqual([]);
  });

  it('moving a video back to where it started clears the change', () => {
    const s = withBoard({ S: ['a'], A: [] });
    move(s, 'S', 'A', 'a');
    move(s, 'A', 'S', 'a');
    expect(pending(s)).toEqual([]);
  });

  it('lists moves in board tier order', () => {
    const s = withBoard({ S: ['a'], A: ['b'], D: ['d'] });
    move(s, 'S', 'D', 'a');
    move(s, 'D', 'S', 'd');
    move(s, 'A', 'C', 'b');
    expect(summary(s)).toEqual(['move d D->S', 'move b A->C', 'move a S->D']);
  });

  it('ignores videos without a baseline (not from this board)', () => {
    const s = withBoard({ S: ['a'] });
    s.dispatch(setTierItems({ ...s.getState().tiers.tierItems, A: [v('stranger')] }));
    expect(pending(s)).toEqual([]);
  });

  describe('duplicates across tiers (auto-dedupe, keep highest)', () => {
    it('stages every lower copy as a dedupe, keeping the highest tier', () => {
      const s = withBoard({ S: ['a'], B: ['a'], D: ['a'] });
      expect(summary(s)).toEqual(['dedupe a B->S', 'dedupe a D->S']);
    });

    it('keeps the ranked copy over the TODO copy', () => {
      const s = withBoard({ C: ['a'], TODO: ['a'] });
      expect(summary(s)).toEqual(['dedupe a TODO->C']);
    });

    it('reports no bogus move for either copy', () => {
      const s = withBoard({ A: ['a'], B: ['a'] });
      expect(pending(s).every((m) => m.kind === 'dedupe')).toBe(true);
    });

    it('if the top copy was removed by hand, the next still-present copy survives', () => {
      const s = withBoard({ S: ['a'], B: ['a'], D: ['a'] });
      move(s, 'S', REMOVED_TIER, 'a');
      expect(summary(s)).toEqual(['dedupe a D->B', 'remove a S->REMOVED']);
    });

    it('removing the lower copy by hand leaves only the removal', () => {
      const s = withBoard({ S: ['a'], B: ['a'] });
      move(s, 'B', REMOVED_TIER, 'a');
      expect(summary(s)).toEqual(['remove a B->REMOVED']);
    });

    it('a duplicate pair next to ordinary videos only touches the duplicate', () => {
      const s = withBoard({ S: ['a', 'x'], A: ['a', 'y'] });
      expect(summary(s)).toEqual(['dedupe a A->S']);
    });

    // BUG: moving the kept (top) copy of a duplicate to another tier is
    // lost. With "a" in S and A on YouTube, moving the S copy to C leaves
    // `originalTierOf.a = [S, A]`; the selector then keeps the A copy and
    // stages the *C* copy as a duplicate removal - but the C playlist doesn't
    // hold that video on YouTube, and nothing removes the S copy. After a
    // push the song is still in S and A, not C.
    it.fails('moving the top copy of a duplicate is reported as a real change', () => {
      const s = withBoard({ S: ['a'], A: ['a'], C: [] });
      move(s, 'S', 'C', 'a');
      const moves = pending(s);
      expect(moves.some((m) => m.kind === 'dedupe' && m.tier === 'C')).toBe(false);
    });

    it('documents current behaviour for moving the top copy of a duplicate', () => {
      const s = withBoard({ S: ['a'], A: ['a'], C: [] });
      move(s, 'S', 'C', 'a');
      expect(summary(s)).toEqual(['dedupe a C->A']);
    });
  });

  describe('same video twice in one playlist', () => {
    it('is not a duplicate across tiers and not a pending change', () => {
      const s = withBoard({ S: ['a', 'a'] });
      expect(pending(s)).toEqual([]);
    });
  });

  describe('the REMOVED bin', () => {
    it('a song dropped in the bin is a removal from its original tier', () => {
      const s = withBoard({ S: ['a', 'b'] });
      move(s, 'S', REMOVED_TIER, 'a');
      expect(pending(s)).toEqual([{ kind: 'remove', video: v('a'), from: 'S', to: REMOVED_TIER }]);
    });

    it('a TODO song can be removed', () => {
      const s = withBoard({ TODO: ['t'] });
      move(s, 'TODO', REMOVED_TIER, 't');
      expect(summary(s)).toEqual(['remove t TODO->REMOVED']);
    });

    it('a song moved then removed is removed from its original tier', () => {
      const s = withBoard({ S: ['a'], B: [] });
      move(s, 'S', 'B', 'a');
      move(s, 'B', REMOVED_TIER, 'a');
      expect(summary(s)).toEqual(['remove a S->REMOVED']);
    });

    it('putting a song back to its tier clears the removal', () => {
      const s = withBoard({ S: ['a'] });
      move(s, 'S', REMOVED_TIER, 'a');
      move(s, REMOVED_TIER, 'S', 'a');
      expect(pending(s)).toEqual([]);
    });

    it('putting a song back into a different tier is a move', () => {
      const s = withBoard({ S: ['a'] });
      move(s, 'S', REMOVED_TIER, 'a');
      move(s, REMOVED_TIER, 'A', 'a');
      expect(summary(s)).toEqual(['move a S->A']);
    });

    it('several removals are all listed, after the moves', () => {
      const s = withBoard({ S: ['a', 'b'], A: ['c'] });
      move(s, 'S', REMOVED_TIER, 'a');
      move(s, 'A', REMOVED_TIER, 'c');
      move(s, 'S', 'D', 'b');
      expect(summary(s)).toEqual(['move b S->D', 'remove a S->REMOVED', 'remove c A->REMOVED']);
    });

    it('a bin entry without a baseline is ignored', () => {
      const s = withBoard({ S: ['a'] });
      s.dispatch(setTierItems({ ...s.getState().tiers.tierItems, [REMOVED_TIER]: [v('ghost')] }));
      expect(pending(s)).toEqual([]);
    });
  });

  it('is memoized (same result object for the same state)', () => {
    const s = withBoard({ S: ['a'] });
    move(s, 'S', 'A', 'a');
    expect(pending(s)).toBe(pending(s));
  });
});

describe('duel pool selectors', () => {
  it('selectDuelPool flattens the ranked tiers S..D, skipping TODO and the bin', () => {
    const s = withBoard({ B: ['b'], S: ['s1', 's2'], TODO: ['t'], D: ['d'] });
    move(s, 'B', REMOVED_TIER, 'b');
    expect(selectDuelPool(s.getState()).map((x) => x.videoId)).toEqual(['s1', 's2', 'd']);
  });

  it('selectDuelRuns groups ids per present ranked tier, in tier order', () => {
    const s = withBoard({ C: ['c'], S: ['s1', 's2'], TODO: ['t'] });
    expect(selectDuelRuns(s.getState())).toEqual([['s1', 's2'], ['c']]);
  });

  it('selectDuelRuns keeps a present-but-empty tier as an empty run', () => {
    const s = withBoard({ S: ['s'], A: [] });
    expect(selectDuelRuns(s.getState())).toEqual([['s'], []]);
  });

  it('selectDuelTierSizes lines up with selectDuelRuns', () => {
    const s = withBoard({ C: ['c'], S: ['s1', 's2'], A: [], TODO: ['t'] });
    expect(selectDuelTierSizes(s.getState())).toEqual([
      { tier: 'S', count: 2 },
      { tier: 'A', count: 0 },
      { tier: 'C', count: 1 },
    ]);
    expect(selectDuelRuns(s.getState()).map((r) => r.length)).toEqual([2, 0, 1]);
  });

  it('empty board -> empty pool/runs/sizes', () => {
    const st = makeStore().getState();
    expect(selectDuelPool(st)).toEqual([]);
    expect(selectDuelRuns(st)).toEqual([]);
    expect(selectDuelTierSizes(st)).toEqual([]);
  });

  it('a video in two tiers appears twice in the pool', () => {
    const s = withBoard({ S: ['a'], A: ['a'] });
    expect(selectDuelPool(s.getState()).map((x) => x.videoId)).toEqual(['a', 'a']);
  });
});

describe('focus sequence selectors', () => {
  it('selectFocusSequence walks every board tier in order, TODO last', () => {
    const s = withBoard({ TODO: ['t'], A: ['a1', 'a2'], S: ['s'] });
    expect(selectFocusSequence(s.getState()).map((e) => `${e.tier}:${e.video.videoId}`)).toEqual([
      'S:s',
      'A:a1',
      'A:a2',
      'TODO:t',
    ]);
  });

  it('selectFocusSequence excludes the REMOVED bin', () => {
    const s = withBoard({ S: ['a', 'b'] });
    move(s, 'S', REMOVED_TIER, 'a');
    expect(selectFocusSequence(s.getState()).map((e) => e.video.videoId)).toEqual(['b']);
  });

  it('selectFocusSequence keeps both copies of a video that is twice in a playlist', () => {
    const s = withBoard({ S: ['a', 'a'] });
    expect(selectFocusSequence(s.getState())).toHaveLength(2);
  });

  it('selectVideoLookup maps videoId -> the last entry for it', () => {
    const s = withBoard({ S: ['a'], TODO: ['a'], B: ['b'] });
    const map = selectVideoLookup(s.getState());
    expect(map.size).toBe(2);
    expect(map.get('a').tier).toBe('TODO');
    expect(map.get('b').tier).toBe('B');
  });
});

describe('player selectors', () => {
  function playing(store, videoId, category = 'Rap') {
    const entries = selectFocusSequence(store.getState());
    store.dispatch(
      openFocus({
        tier: entries.find((e) => e.video.videoId === videoId).tier,
        videoId,
        queue: entries.map((e) => e.video.videoId),
        entries,
        category,
      })
    );
  }

  it('selectFocusedVideoData is null with nothing playing', () => {
    expect(selectFocusedVideoData(makeStore().getState())).toBeNull();
  });

  it('selectFocusedVideoData returns the playing video', () => {
    const s = withBoard({ S: ['a', 'b'] });
    playing(s, 'b');
    expect(selectFocusedVideoData(s.getState())).toEqual(v('b'));
  });

  // Regression (CLAUDE.md): opening a different board replaces tierItems;
  // the dock must keep its video (it reads the queue's own snapshot).
  it('keeps the playing video when another board replaces tierItems', () => {
    const s = withBoard({ S: ['a', 'b'] }, 'Rap');
    playing(s, 'a', 'Rap');
    s.dispatch(resetTierBoard({ presentTiers: ['S'] }));
    s.dispatch(setTierForCategory({ tier: 'S', videos: [v('other')] }));
    s.dispatch(setLoadedCategory('Jazz'));
    expect(selectFocusedVideoData(s.getState())).toEqual(v('a'));
    expect(s.getState().focus.focusedVideo).toEqual({ tier: 'S', videoId: 'a' });
    // ...and next track still comes from the snapshot, not the new board.
    s.dispatch(playNextInQueue());
    expect(selectFocusedVideoData(s.getState())).toEqual(v('b'));
  });

  it('keeps the playing video while tierItems is emptied by a reset', () => {
    const s = withBoard({ S: ['a'] });
    playing(s, 'a');
    s.dispatch(resetTierBoard({ presentTiers: [] }));
    expect(selectFocusedVideoData(s.getState())).toEqual(v('a'));
  });

  it('selectFocusedVideoData is null after closeFocus', () => {
    const s = withBoard({ S: ['a'] });
    playing(s, 'a');
    s.dispatch(closeFocus());
    expect(selectFocusedVideoData(s.getState())).toBeNull();
  });

  describe('selectFocusedAvailableTiers', () => {
    function boardWithPlaylists() {
      const s = withBoard({ S: ['a'], A: ['b'] }, 'Rap');
      s.dispatch(setPlaylists([pl('1', 'Rap S'), pl('2', 'Rap A'), pl('3', 'Rap C'), pl('4', 'Rap TODO')]));
      return s;
    }

    it('lists the board’s ranked tiers (no TODO) while its board is loaded', () => {
      const s = boardWithPlaylists();
      playing(s, 'a', 'Rap');
      expect(selectFocusedAvailableTiers(s.getState())).toEqual(['S', 'A', 'C']);
    });

    it('is empty once another board is loaded', () => {
      const s = boardWithPlaylists();
      playing(s, 'a', 'Rap');
      s.dispatch(setLoadedCategory('Jazz'));
      expect(selectFocusedAvailableTiers(s.getState())).toEqual([]);
    });

    it('is empty with nothing playing', () => {
      expect(selectFocusedAvailableTiers(boardWithPlaylists().getState())).toEqual([]);
    });
  });

  describe('selectPlayingVideoIdOnBoard', () => {
    it('is the playing id on the board it was opened from', () => {
      const s = withBoard({ S: ['a'] }, 'Rap');
      playing(s, 'a', 'Rap');
      s.dispatch(setCurrentCategory('Rap'));
      expect(selectPlayingVideoIdOnBoard(s.getState())).toBe('a');
    });

    it('is null on a different board', () => {
      const s = withBoard({ S: ['a'] }, 'Rap');
      playing(s, 'a', 'Rap');
      s.dispatch(setCurrentCategory('Jazz'));
      expect(selectPlayingVideoIdOnBoard(s.getState())).toBeNull();
    });

    it('is null with nothing playing', () => {
      expect(selectPlayingVideoIdOnBoard(makeStore().getState())).toBeNull();
    });
  });

  it('selectPlayerCoversPage is true only while playing and expanded', () => {
    const s = withBoard({ S: ['a'] });
    expect(selectPlayerCoversPage(s.getState())).toBe(false);
    playing(s, 'a');
    expect(selectPlayerCoversPage(s.getState())).toBe(true);
    s.dispatch(minimizePlayer());
    expect(selectPlayerCoversPage(s.getState())).toBe(false);
    s.dispatch(expandPlayer());
    expect(selectPlayerCoversPage(s.getState())).toBe(true);
    s.dispatch(closeFocus());
    expect(selectPlayerCoversPage(s.getState())).toBe(false);
  });
});

describe('naming selectors', () => {
  it('default naming', () => {
    const st = makeStore().getState();
    expect(selectNaming(st)).toEqual({ template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS });
    expect(selectNamings(st)).toHaveLength(1);
  });

  it('a half-finished migration adds the old naming second', () => {
    const s = makeStore();
    const labels = { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5', TODO: 'Later' };
    s.dispatch(
      startMigration({
        from: { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS },
        to: { template: '{category} - {tier}', tierLabels: labels },
      })
    );
    expect(selectNamings(s.getState())).toEqual([
      { template: '{category} - {tier}', tierLabels: labels },
      { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS },
    ]);
  });

  it('selectNamingSettings adds display names', () => {
    const st = makeStore().getState();
    expect(selectNamingSettings(st)).toEqual({
      template: '{category} {tier}',
      tierLabels: DEFAULT_TIER_LABELS,
      tierDisplayNames: NO_DISPLAY_NAMES,
    });
  });
});

describe('playlist selectors (real store state)', () => {
  const withPlaylists = (playlists) => {
    const s = makeStore();
    s.dispatch(setPlaylists(playlists));
    return s;
  };

  it('are null / empty before playlists load', () => {
    const st = makeStore().getState();
    expect(selectRankedPlaylists(st)).toBeNull();
    expect(selectTierPlaylists(st)).toBeNull();
    expect(selectTierGroups(st)).toEqual({});
    expect(selectTierCategories(st)).toEqual([]);
    expect(selectTodoRows(st)).toEqual([]);
  });

  it('handle an empty playlist list', () => {
    const st = withPlaylists([]).getState();
    expect(selectRankedPlaylists(st)).toEqual([]);
    expect(selectTierPlaylists(st)).toEqual([]);
    expect(selectTierCategories(st)).toEqual([]);
  });

  it('pick up only template-matching playlists, each with .parsed', () => {
    const st = withPlaylists([
      pl('1', 'Rap S'),
      pl('2', 'Holiday photos'),
      pl('3', 'Rap A'),
      pl('4', 'Jazz D'),
      pl('5', 'Liked'),
    ]).getState();
    const ranked = selectRankedPlaylists(st);
    expect(ranked.map((p) => p.id)).toEqual(['1', '3', '4']);
    expect(ranked[0].parsed).toMatchObject({ category: 'Rap', tier: 'S', fields: {} });
  });

  it('non-matching playlists stay invisible in every selector', () => {
    const st = withPlaylists([pl('1', 'Rap S'), pl('secret', 'My private mix'), pl('x', 'Rap Z')]).getState();
    const everywhere = JSON.stringify([
      selectRankedPlaylists(st),
      selectTierPlaylists(st),
      selectTierGroups(st),
      selectTierCategories(st),
      selectTodoRows(st),
    ]);
    expect(everywhere).not.toContain('secret');
    expect(everywhere).not.toContain('private');
    expect(everywhere).not.toContain('Rap Z');
  });

  it('matching is case-sensitive for tier names', () => {
    const st = withPlaylists([pl('1', 'Rap s')]).getState();
    expect(selectRankedPlaylists(st)).toEqual([]);
  });

  it('multi-word and unicode categories', () => {
    const st = withPlaylists([pl('1', 'Lo-fi Beats S'), pl('2', 'Música Latina A'), pl('3', '日本のポップ B')]).getState();
    expect(selectTierCategories(st)).toEqual(['Lo-fi Beats', 'Música Latina', '日本のポップ'].sort());
  });

  it('groups by category and tier', () => {
    const st = withPlaylists([pl('1', 'Rap S'), pl('2', 'Rap A'), pl('3', 'Jazz S')]).getState();
    const groups = selectTierGroups(st);
    expect(Object.keys(groups).sort()).toEqual(['Jazz', 'Rap']);
    expect(groups.Rap.S.id).toBe('1');
    expect(groups.Rap.A.id).toBe('2');
    expect(groups.Jazz.S.id).toBe('3');
  });

  it('categories are sorted', () => {
    const st = withPlaylists([pl('1', 'Zydeco S'), pl('2', 'Ambient S'), pl('3', 'Metal S')]).getState();
    expect(selectTierCategories(st)).toEqual(['Ambient', 'Metal', 'Zydeco']);
  });

  it('documents: two ranked playlists with the same name both count as tier playlists, the last one wins the board slot', () => {
    const st = withPlaylists([pl('first', 'Rap S'), pl('second', 'Rap S')]).getState();
    expect(selectTierPlaylists(st).map((p) => p.id)).toEqual(['first', 'second']);
    expect(selectTierGroups(st).Rap.S.id).toBe('second');
  });

  describe('to-do lists', () => {
    it('a playlist named with the to-do name joins its board as TODO', () => {
      const st = withPlaylists([pl('1', 'Rap S'), pl('t', 'Rap TODO')]).getState();
      expect(selectRankedPlaylists(st).map((p) => p.id)).toEqual(['1']);
      const todo = selectTierPlaylists(st).find((p) => p.id === 't');
      expect(todo.parsed).toMatchObject({ category: 'Rap', tier: 'TODO', via: 'name' });
      expect(selectTierGroups(st).Rap.TODO.id).toBe('t');
    });

    it('a to-do list with no board does not create a board', () => {
      const st = withPlaylists([pl('1', 'Rap S'), pl('t', 'Jazz TODO')]).getState();
      expect(selectTierCategories(st)).toEqual(['Rap']);
      expect(selectTodoRows(st)).toEqual([expect.objectContaining({ category: 'Jazz', status: 'missingBoard' })]);
    });

    it('a hand-linked playlist becomes that board’s to-do list', () => {
      const s = withPlaylists([pl('1', 'Rap S'), pl('odd', 'Stuff to check')]);
      s.dispatch(linkTodoList({ playlistId: 'odd', category: 'Rap' }));
      const st = s.getState();
      expect(selectTierGroups(st).Rap.TODO.id).toBe('odd');
      expect(selectTierPlaylists(st).find((p) => p.id === 'odd').parsed.via).toBe('link');
    });

    it('unlinking hides the playlist again', () => {
      const s = withPlaylists([pl('1', 'Rap S'), pl('odd', 'Stuff to check')]);
      s.dispatch(linkTodoList({ playlistId: 'odd', category: 'Rap' }));
      s.dispatch(linkTodoList({ playlistId: 'odd', category: null }));
      const st = s.getState();
      expect(selectTierPlaylists(st).map((p) => p.id)).toEqual(['1']);
      expect(selectTierGroups(st).Rap.TODO).toBeUndefined();
    });

    it('a same-named empty to-do list does not hide the real one', () => {
      const st = withPlaylists([pl('1', 'Rap S'), pl('empty', 'Rap TODO', 0), pl('real', 'Rap TODO', 12)]).getState();
      expect(selectTierGroups(st).Rap.TODO.id).toBe('real');
    });
  });

  it('follows a custom naming with custom tier labels', () => {
    const s = withPlaylists([pl('1', 'Rap - T1'), pl('2', 'Rap - T5'), pl('3', 'Rap S'), pl('4', 'Rap - (**TODO**)')]);
    s.dispatch(
      setNaming({
        template: '{category} - {tier}',
        tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5', TODO: '(**TODO**)' },
        tierDisplayNames: NO_DISPLAY_NAMES,
      })
    );
    const groups = selectTierGroups(s.getState());
    expect(groups.Rap.S.id).toBe('1');
    expect(groups.Rap.D.id).toBe('2');
    expect(groups.Rap.TODO.id).toBe('4');
    expect(Object.keys(groups.Rap).sort()).toEqual(['D', 'S', 'TODO']);
  });

  it('during a migration both old and new names are recognised', () => {
    const s = withPlaylists([pl('old', 'Rap S'), pl('new', 'Rap - T2')]);
    s.dispatch(
      startMigration({
        from: { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS },
        to: { template: '{category} - {tier}', tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5', TODO: 'TODO' } },
      })
    );
    const groups = selectTierGroups(s.getState());
    expect(groups.Rap.S.id).toBe('old');
    expect(groups.Rap.A.id).toBe('new');
  });

  it('selectors are memoized', () => {
    const st = withPlaylists([pl('1', 'Rap S')]).getState();
    expect(selectTierPlaylists(st)).toBe(selectTierPlaylists(st));
    expect(selectTierGroups(st)).toBe(selectTierGroups(st));
  });
});
