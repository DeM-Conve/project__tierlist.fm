// Render cost per user action in the real App on a 333-song board: which
// components re-render on a keystroke, a move, opening a board. Prints a
// line per action (run with --silent=false to see them) and guards the hot
// paths: an action re-renders what it changes, not the whole app.
import * as rtl from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderProfiler } from './test/renderProfiler';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, unmount } from './test/syncHarness';
import { openFocus, playNextInQueue } from './store/focusSlice';
import { selectFocusSequence } from './store/selectors';

// The YouTube iframe: a stand-in that's ready at once.
vi.mock('./components/EmbeddedPlayer', () => ({ default: () => <div data-testid="embed" /> }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn(), update: vi.fn() }, Notifications: () => null }));

const TIERS = ['S', 'A', 'B', 'C', 'D'];
// Board "Big": 60 songs per ranked tier + 33 to-do = 333; four small boards.
function account() {
  const a = {};
  let n = 0;
  const ids = (k) => Array.from({ length: k }, () => `v${String(n++).padStart(10, '0')}`);
  for (const t of TIERS) a[`Big ${t}`] = ids(60);
  a['Big TODO'] = ids(33);
  for (const b of ['Rap', 'Pop', 'Jazz', 'Rock']) for (const t of TIERS) a[`${b} ${t}`] = ids(5);
  return a;
}

// jsdom has no scrolling; the queue scrolls its current song into view.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {};

const WATCH = ['Layout', 'PlayerDock', 'QueuePanel', 'Sidebar', 'TierBoardPage', 'TierBoardView', 'TierRow', 'TierFocusPage', 'TierFocusView', 'TierRail', 'PendingChanges', 'CommandPalette'];
const lines = [];
async function measure(label, fn) {
  renderProfiler.start();
  await fn();
  renderProfiler.stop();
  const r = renderProfiler.report();
  lines.push(`PERF ${label}: ${r.renders} renders, ${r.commits} commits, ${r.ms} ms | ${WATCH.map((k) => `${k}×${r.count(k)}`).join(' ')}`);
  return r;
}

afterEach(() => {
  lines.forEach((l) => console.log(l));
  lines.length = 0;
  unmount();
});

describe('render cost on a 333-song board', () => {
  it('a sidebar filter keystroke re-renders the sidebar, not the board', async () => {
    const h = await mountApp(new FakeYoutube(account()));
    await measure('open 333-song board', () => h.open('Big'));
    await measure('move one song S -> A', async () => h.move(h.tierItems().S[3].videoId, 'A'));
    const input = rtl.screen.getByPlaceholderText('Filter boards…');
    const key = await measure('sidebar filter keystroke', async () => {
      await rtl.act(async () => rtl.fireEvent.change(input, { target: { value: 'r' } }));
    });
    expect(key.count('Sidebar')).toBeGreaterThan(0);
    expect(key.count('TierRail')).toBe(0);
    expect(key.count('CommandPalette')).toBe(0);
    // Was 1622 renders, the board page and all 12 tier rows included: the
    // outlet context and Add songs' cached-items map were new every render.
    expect(key.count('TierBoardPage')).toBe(0);
    expect(key.count('TierRow')).toBe(0);
    expect(key.renders).toBeLessThan(600);
  }, 60000);

  it('with the player open: a move, the next song, a keystroke', async () => {
    const h = await mountApp(new FakeYoutube(account()));
    await h.open('Big');
    const seq = selectFocusSequence(h.state);
    h.dispatch(openFocus({ tier: 'S', videoId: seq[0].video.videoId, queue: seq.map((e) => e.video.videoId), entries: seq, category: 'Big', label: 'Big' }));
    const move = await measure('[playing] move one song S -> A', async () => h.move(h.tierItems().S[3].videoId, 'A'));
    await measure('[playing] next song', async () => h.dispatch(playNextInQueue()));
    const input = rtl.screen.getByPlaceholderText('Filter boards…');
    const key = await measure('[playing] sidebar filter keystroke', async () => {
      await rtl.act(async () => rtl.fireEvent.change(input, { target: { value: 'r' } }));
    });
    // The dock and its queue only redraw for the player's own changes (was
    // once per Layout render: 1065 -> 712 renders per keystroke here).
    expect(move.count('PlayerDock')).toBe(0);
    expect(key.count('PlayerDock')).toBe(0);
    expect(key.count('QueuePanel')).toBe(0);
  }, 60000);

  it('typing in Find (board)', async () => {
    const h = await mountApp(new FakeYoutube(account()));
    await h.open('Big');
    await rtl.act(async () => rtl.fireEvent.keyDown(document, { key: '/', code: 'Slash' }));
    const find = await rtl.screen.findByPlaceholderText('/search titles...');
    const k1 = await measure('Find keystroke (board)', async () => {
      await rtl.act(async () => rtl.fireEvent.change(find, { target: { value: 'v00000001' } }));
    });
    expect(k1.renders).toBeGreaterThan(0);
  }, 60000);

  it('typing in the tier page filter', async () => {
    const h = await mountApp(new FakeYoutube(account()));
    await h.open('Big');
    await rtl.act(async () => rtl.fireEvent.click(rtl.screen.getAllByLabelText('Open S')[0]));
    const filter = await rtl.waitFor(() => {
      const el = rtl.screen.getAllByPlaceholderText(/^Filter /).find((e) => !/boards/.test(e.placeholder));
      if (!el) throw new Error('no tier filter yet ');
      return el;
    }, { timeout: 5000 });
    const k2 = await measure('filter keystroke (tier page)', async () => {
      await rtl.act(async () => rtl.fireEvent.change(filter, { target: { value: 'v00000001' } }));
    });
    expect(k2.renders).toBeGreaterThan(0);
  }, 60000);
});
