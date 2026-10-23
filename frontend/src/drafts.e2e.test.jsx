// Journeys across boards and pages (docs/qa-pass.md, cross-feature
// journeys): unpushed changes belong to their board and never vanish on
// navigation; one bar pushes every board's; auto-dedupes are shown apart;
// rating the playing song from any page stages it on its own board. The real
// App over the fake YouTube (src/test/syncHarness.jsx).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, unmount, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { memoryDraftStorage, setDraftStorage } from './api/draftStore';

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));

const ACCOUNT = {
  'Rap S': ['a', 'b'],
  'Rap A': ['c'],
  'Rap TODO': ['h', 'i'],
  // Pop holds a duplicate (p in S and A): auto-staged the moment it opens.
  'Pop S': ['p'],
  'Pop A': ['p', 'r'],
  'Pop TODO': ['s'],
};
const everySong = [...new Set(Object.values(ACCOUNT).flat())];

// The player dock's queue scrolls itself; jsdom has no scrollTo.
Element.prototype.scrollTo ??= function scrollTo() {};

afterEach(() => {
  setDraftStorage(null);
  vi.clearAllMocks();
});

// `duplicates: false` when a board left unopened still has its own (Pop).
function expectYoutube(yt, expected, sync = null, { duplicates = true } = {}) {
  expect(invariantViolations(yt, { expected, universe: everySong, sync, duplicates })).toEqual([]);
}

describe('the user’s journey: rate the playing song from Settings, open another board', () => {
  it('keeps the rating on its board, never counts the other board’s duplicate as a change, pushes both', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const h = await mountApp(yt);
    await h.open('Rap');
    h.play('h'); // a song from Rap's TODO
    await h.goTo('/settings');
    await h.rateFromRail('S'); // the rail on Settings rates the playing song
    expect(h.state.focus.focusedVideo.tier).toBe('S');
    expect(h.boards()).toEqual([{ category: 'Rap', changes: 1, dedupes: 0 }]);
    expect(h.barText()).toBe('1 change on Rap · review');

    await h.open('Pop');
    // Rap's rating is still staged - on Rap - and Pop's duplicate is not "a change".
    expect(h.keptBoard('Rap').S).toEqual(['a', 'b', 'h']);
    expect(h.boards()).toEqual([
      { category: 'Pop', changes: 0, dedupes: 1 },
      { category: 'Rap', changes: 1, dedupes: 0 },
    ]);
    expect(h.barText()).toBe('1 change on Rap · 1 duplicate to clean up · review');

    await h.open('Rap');
    expect(h.tierOf('h')).toBe('S');
    expect(h.shown().TODO).toEqual(['i']);

    const sync = await h.push();
    expectYoutube(yt, { Rap: { S: ['a', 'b', 'h'], A: ['c'], TODO: ['i'] }, Pop: { S: ['p'], A: ['r'], TODO: ['s'] } }, sync);
    expect(h.boards()).toEqual([]);
    unmount();
  });

  it('rating from Home while another board is open stages it on the playing song’s board', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const h = await mountApp(yt);
    await h.open('Rap');
    h.play('i');
    await h.open('Pop');
    await h.goHome();
    await h.rateFromRail('A'); // the rail follows the playing song: Rap
    expect(h.board).toBe('Pop');
    expect(h.keptBoard('Rap').A).toEqual(['c', 'i']);
    expect(h.shown().A).toEqual(['p', 'r']); // Pop untouched
    expect(h.state.focus.focusedVideo.tier).toBe('A');
    // Its rail counts follow it.
    expect(screen.getByRole('button', { name: /^Rate ".*" → S$/ })).toHaveTextContent('2');
    // One Push sends the kept board's rating and the open board's duplicate.
    const sync = await h.push();
    expectYoutube(yt, { Rap: { S: ['a', 'b'], A: ['c', 'i'], TODO: ['h'] }, Pop: { S: ['p'], A: ['r'], TODO: ['s'] } }, sync);
    expect(youtubeBoards(yt).Rap.A).toEqual(['c', 'i']);
    expect(h.boards()).toEqual([]);
    unmount();
  });
});

describe('several boards', () => {
  it('stage on A, open B, stage on B, push once: both boards are right on YouTube', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const h = await mountApp(yt);
    await h.open('Rap');
    h.move('h', 'A');
    await h.open('Pop');
    h.move('s', 'S');
    expect(h.barText()).toBe('2 changes on 2 boards · 1 duplicate to clean up · review');
    await h.push();
    expectYoutube(yt, { Rap: { S: ['a', 'b'], A: ['c', 'h'], TODO: ['i'] }, Pop: { S: ['p', 's'], A: ['r'], TODO: [] } });
    expect(h.boards()).toEqual([]);
    await h.open('Rap');
    expect(h.shown()).toEqual({ S: ['a', 'b'], A: ['c', 'h'], TODO: ['i'] });
    // Moving the pushed song again deletes its new item (no duplicate).
    h.move('h', 'S');
    expectYoutube(yt, { Rap: { S: ['a', 'b', 'h'], A: ['c'] } }, await h.push());
    unmount();
  });
});

describe('across a reload', () => {
  it('staged drafts come back, on their boards, with their undo history', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const storage = memoryDraftStorage();
    let h = await mountApp(yt, { draftStorage: storage });
    await h.open('Rap');
    h.move('h', 'S');
    h.move('a', 'A');
    await h.open('Pop');
    h.move('s', 'A');
    await waitFor(() => expect(Object.keys(storage.peek()?.boards ?? {}).sort()).toEqual(['Pop', 'Rap']));
    unmount();

    h = await mountApp(yt, { draftStorage: storage });
    expect(h.boards().map((b) => [b.category, b.changes]).sort()).toEqual([['Pop', 1], ['Rap', 2]]);
    await h.open('Rap');
    expect(h.shown()).toEqual({ S: ['b', 'h'], A: ['c', 'a'], TODO: ['i'] });
    h.undo();
    expect(h.tierOf('a')).toBe('S');
    await h.push();
    expectYoutube(yt, { Rap: { S: ['a', 'b', 'h'], A: ['c'], TODO: ['i'] }, Pop: { S: ['p'], A: ['r', 's'], TODO: [] } });
    unmount();
  });

  it('a draft whose song was moved on YouTube meanwhile: a note on the board, no duplicate', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const storage = memoryDraftStorage();
    let h = await mountApp(yt, { draftStorage: storage });
    await h.open('Rap');
    h.move('h', 'S');
    await waitFor(() => expect(storage.peek()?.boards?.Rap).toBeDefined());
    unmount();

    // Meanwhile, on YouTube itself: h goes from Rap TODO to Rap A.
    const todo = yt.playlists.get(yt.idOf('Rap TODO'));
    const old = todo.items.find((x) => x.videoId === 'h');
    yt.insert(yt.idOf('Rap A'), 'h');
    yt.delete(old.id);

    h = await mountApp(yt, { draftStorage: storage });
    await h.open('Rap');
    expect(h.tierOf('h')).toBe('A');
    expect(h.staged()).toEqual([]);
    expect(await screen.findByText(/Song h.*changed on YouTube since you staged TODO → S.*dropped/)).toBeInTheDocument();
    expect(await h.push()).toBeNull();
    expectYoutube(yt, { Rap: { S: ['a', 'b'], A: ['c', 'h'], TODO: ['i'] } }, null, { duplicates: false });
    unmount();
  });

  it('logout clears the drafts on this device', async () => {
    const yt = new FakeYoutube(ACCOUNT);
    const storage = memoryDraftStorage();
    let h = await mountApp(yt, { draftStorage: storage });
    await h.open('Rap');
    h.move('h', 'S');
    await h.open('Pop');
    await waitFor(() => expect(storage.peek()?.boards?.Rap).toBeDefined());
    await h.logout();
    expect(h.state.drafts.boards).toEqual({});
    await waitFor(() => expect(storage.peek()).toBeUndefined());
    unmount();

    // Another account on this device never sees them either.
    storage.set({ owner: 'user-1', schema: 1, boards: { Rap: {} } });
    h = await mountApp(new FakeYoutube(ACCOUNT, { userId: 'user-2' }), { draftStorage: storage });
    await waitFor(() => expect(h.state.drafts.hydrated).toBe(true));
    expect(h.state.drafts.boards).toEqual({});
    unmount();
  });
});
