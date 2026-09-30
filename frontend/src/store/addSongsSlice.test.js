import { describe, expect, it } from 'vitest';
import reducer, { addVideos, chooseBoard, recordAction, revertAction, setCurrent } from './addSongsSlice';

const v = (id) => ({ videoId: id, title: `Song ${id}` });
const init = () => reducer(undefined, { type: '@@init' });
const ids = (list) => list.map((x) => x.videoId);

describe('addSongsSlice', () => {
  it('starts empty', () => {
    expect(init()).toEqual({
      queue: [],
      skipped: [],
      hidden: [],
      currentId: null,
      boardFor: {},
      lastBoard: null,
      history: [],
    });
  });

  describe('addVideos', () => {
    it('queues new songs and shows the first of them', () => {
      const s = reducer(init(), addVideos([v('a'), v('b')]));
      expect(ids(s.queue)).toEqual(['a', 'b']);
      expect(s.currentId).toBe('a');
    });

    it('an empty list changes nothing', () => {
      const before = reducer(init(), addVideos([v('a')]));
      expect(reducer(before, addVideos([]))).toBe(before);
    });

    it('does not queue a song twice', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      s = reducer(s, addVideos([v('b'), v('c')]));
      expect(ids(s.queue)).toEqual(['a', 'b', 'c']);
      expect(s.currentId).toBe('b');
    });

    it('a duplicate within one paste is queued once', () => {
      const s = reducer(init(), addVideos([v('a'), v('a')]));
      expect(ids(s.queue)).toEqual(['a']);
    });

    it('re-adding a skipped or removed song brings it back', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      s = reducer(s, recordAction({ entry: { kind: 'skip', video: v('a') }, nextId: 'b' }));
      s = reducer(s, recordAction({ entry: { kind: 'remove', video: v('b') }, nextId: null }));
      s = reducer(s, addVideos([v('a'), v('b')]));
      expect(s.skipped).toEqual([]);
      expect(s.hidden).toEqual([]);
      expect(s.history).toEqual([]);
    });

    it('re-adding a filed song keeps its "file" history entry', () => {
      let s = reducer(init(), addVideos([v('a')]));
      const entry = { kind: 'file', video: v('a'), category: 'Rap', tier: 'S', playlistId: 'p' };
      s = reducer(s, recordAction({ entry, nextId: null }));
      s = reducer(s, addVideos([v('a')]));
      expect(s.history).toEqual([entry]);
      expect(s.hidden).toEqual([]);
    });
  });

  it('setCurrent sets the card', () => {
    expect(reducer(init(), setCurrent('x')).currentId).toBe('x');
    expect(reducer(init(), setCurrent(null)).currentId).toBeNull();
  });

  it('chooseBoard records a hand-picked board per song', () => {
    let s = reducer(init(), chooseBoard({ videoId: 'a', category: 'Rap' }));
    s = reducer(s, chooseBoard({ videoId: 'a', category: 'Música' }));
    s = reducer(s, chooseBoard({ videoId: 'b', category: 'Jazz' }));
    expect(s.boardFor).toEqual({ a: 'Música', b: 'Jazz' });
  });

  describe('recordAction', () => {
    it('file: hides the song, remembers the board, moves the card on', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      s = reducer(s, recordAction({ entry: { kind: 'file', video: v('a'), category: 'Rap', tier: 'A' }, nextId: 'b' }));
      expect(s.hidden).toEqual(['a']);
      expect(s.lastBoard).toBe('Rap');
      expect(s.currentId).toBe('b');
      expect(s.history).toHaveLength(1);
    });

    it('skip: sends the song to the back of the skipped list', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      s = reducer(s, recordAction({ entry: { kind: 'skip', video: v('a') }, nextId: 'b' }));
      s = reducer(s, recordAction({ entry: { kind: 'skip', video: v('b') }, nextId: 'a' }));
      s = reducer(s, recordAction({ entry: { kind: 'skip', video: v('a') }, nextId: 'b' }));
      expect(s.skipped).toEqual(['b', 'a']);
      expect(s.hidden).toEqual([]);
      expect(s.lastBoard).toBeNull();
    });

    it('remove: hides without changing lastBoard', () => {
      let s = reducer(init(), addVideos([v('a')]));
      s = reducer(s, recordAction({ entry: { kind: 'remove', video: v('a') }, nextId: null }));
      expect(s.hidden).toEqual(['a']);
      expect(s.lastBoard).toBeNull();
      expect(s.currentId).toBeNull();
    });

    it('history keeps the newest 100 entries', () => {
      let s = init();
      for (let i = 0; i < 105; i++) s = reducer(s, recordAction({ entry: { kind: 'remove', video: v(`v${i}`) }, nextId: null }));
      expect(s.history).toHaveLength(100);
      expect(s.history[0].video.videoId).toBe('v5');
      expect(s.history[99].video.videoId).toBe('v104');
    });
  });

  describe('revertAction', () => {
    it('brings a filed song back as the current card', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      const entry = { kind: 'file', video: v('a'), category: 'Rap', tier: 'S' };
      s = reducer(s, recordAction({ entry, nextId: 'b' }));
      s = reducer(s, revertAction(entry));
      expect(s.hidden).toEqual([]);
      expect(s.history).toEqual([]);
      expect(s.currentId).toBe('a');
    });

    it('undoes a skip', () => {
      let s = reducer(init(), addVideos([v('a'), v('b')]));
      const entry = { kind: 'skip', video: v('a') };
      s = reducer(s, recordAction({ entry, nextId: 'b' }));
      s = reducer(s, revertAction(entry));
      expect(s.skipped).toEqual([]);
      expect(s.currentId).toBe('a');
    });

    it('only removes history entries of the same kind for that song', () => {
      let s = reducer(init(), addVideos([v('a')]));
      const skip = { kind: 'skip', video: v('a') };
      const file = { kind: 'file', video: v('a'), category: 'Rap', tier: 'S' };
      s = reducer(s, recordAction({ entry: skip, nextId: 'a' }));
      s = reducer(s, recordAction({ entry: file, nextId: null }));
      s = reducer(s, revertAction(file));
      expect(s.history).toEqual([skip]);
    });

    it('lastBoard is not rolled back', () => {
      let s = reducer(init(), addVideos([v('a')]));
      const entry = { kind: 'file', video: v('a'), category: 'Rap', tier: 'S' };
      s = reducer(s, recordAction({ entry, nextId: null }));
      s = reducer(s, revertAction(entry));
      expect(s.lastBoard).toBe('Rap');
    });
  });
});
