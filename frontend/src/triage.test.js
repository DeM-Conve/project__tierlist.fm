import { describe, expect, it, vi } from 'vitest';
import { loadBoard, moveWithFeedback } from './tierActions';
import { makeStore } from './test/render';
import { openFocus } from './store/focusSlice';
import { REMOVED_TIER, TODO_TIER } from './tiers';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: videoId });

// A triage session over Rock's to-do list (what the TODO row's play button,
// the TODO page's Triage and the palette start - App.startTriage).
function triage(todo = ['t1', 't2', 't3', 't4']) {
  const store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('s1')], A: [], TODO: todo.map(v) } }));
  const entries = store.getState().tiers.tierItems.TODO.map((video) => ({ tier: TODO_TIER, video }));
  store.dispatch(openFocus({ tier: TODO_TIER, videoId: todo[0], queue: todo, entries, category: 'Rock', triage: true }));
  return store;
}
const playing = (store) => store.getState().focus.focusedVideo;
const rate = (store, videoId, toTier, fromTier = TODO_TIER) =>
  store.dispatch(moveWithFeedback([{ fromTier, toTier, videoId }], { quiet: true }));

describe('Triage', () => {
  it('rating the playing to-do song moves it and plays the next one', () => {
    const store = triage();
    rate(store, 't1', 'S');
    expect(store.getState().tiers.tierItems.S.map((x) => x.videoId)).toEqual(['s1', 't1']);
    expect(playing(store)).toEqual({ tier: TODO_TIER, videoId: 't2' });
  });

  it('skips songs already given a tier some other way', () => {
    const store = triage();
    rate(store, 't2', 'A');
    rate(store, 't3', 'A');
    // Not the playing song: triage doesn't move on.
    expect(playing(store).videoId).toBe('t1');
    rate(store, 't1', 'B');
    expect(playing(store)).toEqual({ tier: TODO_TIER, videoId: 't4' });
  });

  it('removing the playing to-do song moves on too', () => {
    const store = triage();
    rate(store, 't1', REMOVED_TIER);
    expect(playing(store).videoId).toBe('t2');
  });

  it('a reorder inside TODO, or the last song rated, plays on where it is', () => {
    const store = triage(['t1']);
    store.dispatch(moveWithFeedback([{ fromTier: TODO_TIER, toTier: TODO_TIER, videoId: 't1', dropIndex: 0 }], { quiet: true }));
    expect(playing(store)).toEqual({ tier: TODO_TIER, videoId: 't1' });
    rate(store, 't1', 'S');
    expect(playing(store)).toEqual({ tier: 'S', videoId: 't1' });
  });
});
