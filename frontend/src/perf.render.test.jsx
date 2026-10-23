// Render cost per user action in the real App on a 333-song board: which
// components re-render on a keystroke, a move, opening a board. Prints a
// line per action (run with --silent=false to see them) and guards the hot
// paths: an action re-renders what it changes, not the whole app.
import * as rtl from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderProfiler } from './test/renderProfiler';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, unmount } from './test/syncHarness';

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

const WATCH = ['Layout', 'Sidebar', 'TierBoardPage', 'TierBoardView', 'TierRow', 'TierRail', 'PendingChanges', 'CommandPalette'];
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
    // Was 1622 renders, the board page and all 12 tier rows included: the
    // outlet context and Add songs' cached-items map were new every render.
    expect(key.count('TierBoardPage')).toBe(0);
    expect(key.count('TierRow')).toBe(0);
    expect(key.renders).toBeLessThan(900);
  }, 60000);
});
