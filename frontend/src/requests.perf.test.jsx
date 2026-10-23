// Requests (and so YouTube quota) per user action, in the real App over the
// fake YouTube: boot, opening a board, a push, coming back to a board, Add
// songs. Each read of a playlist is >= 1 quota unit per 50 songs; a write
// (insert / delete) is 50. Prints a line per action (--silent=false).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, unmount } from './test/syncHarness';

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn(), update: vi.fn() }, Notifications: () => null }));

const TIERS = ['S', 'A', 'B', 'C', 'D'];
function account() {
  const a = {};
  let n = 0;
  const ids = (k) => Array.from({ length: k }, () => `v${String(n++).padStart(10, '0')}`);
  for (const t of TIERS) a[`Big ${t}`] = ids(60);
  a['Big TODO'] = ids(33);
  for (const t of TIERS) a[`Rap ${t}`] = ids(5);
  return a;
}

const lines = [];
async function requests(yt, label, fn) {
  const from = yt.log.length;
  await fn();
  const log = yt.log.slice(from).map((r) => `${r.method.toUpperCase()} ${r.url.replace(/\/pl-\d+\//, '/:id/')}`);
  const counts = {};
  log.forEach((l) => (counts[l] = (counts[l] ?? 0) + 1));
  lines.push(`REQ ${label}: ${log.length} | ${Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  return { total: log.length, count: (re) => log.filter((l) => re.test(l)).length };
}

afterEach(() => {
  lines.forEach((l) => console.log(l));
  lines.length = 0;
  unmount();
});

describe('requests per action', () => {
  it('boot, a board, a push, back again', async () => {
    const yt = new FakeYoutube(account());
    let h;
    const boot = await requests(yt, 'boot (home)', async () => {
      h = await mountApp(yt);
      await h.settle();
    });
    const open = await requests(yt, 'open the 333-song board', () => h.open('Big'));
    const push = await requests(yt, 'move 1 song + push', async () => {
      h.move(h.tierItems().S[0].videoId, 'A');
      await h.push();
    });
    const push2 = await requests(yt, 'move it again + push', async () => {
      h.move(h.tierItems().A.at(-1).videoId, 'B');
      await h.push();
    });
    const other = await requests(yt, 'open another board', () => h.open('Rap'));
    const back = await requests(yt, 'back to the big board', () => h.open('Big'));
    // No playlist's items on boot. (The list itself shows twice here only
    // because the harness's store starts logged in, so Home asks before the
    // login check claims the board cache; the app starts at loggedIn null.)
    expect(boot.count(/items$/)).toBe(0);
    expect(open.count(/items$/)).toBe(6);
    expect(push.count(/tier-sync/)).toBe(1);
    expect(push.count(/items$/)).toBe(0);
    expect(push2.count(/items$/)).toBe(0);
    expect(other.count(/items$/)).toBe(5);
    expect(back.total).toBe(0);
  }, 60000);

  it('Add songs: filing a song and its undo', async () => {
    const yt = new FakeYoutube(account());
    const h = await mountApp(yt);
    await h.settle();
    const file = await requests(yt, 'Add songs: file 1 song', () => h.fileSong('newsong0001', 'Rap', 'S'));
    expect(h.queryClient.getQueryData(['playlists']).find((p) => p.title === 'Rap S').itemCount).toBe(6);
    const undo = await requests(yt, 'Add songs: undo it', () => h.undoFileSong());
    expect(file.count(/^POST .*items$/)).toBe(1);
    expect(undo.count(/^DELETE/)).toBe(1);
    // The board's counts are patched in place: no re-read of every playlist
    // of the account (was one GET /api/playlists after each).
    expect(file.total + undo.total).toBe(2);
    const rapS = h.queryClient.getQueryData(['playlists']).find((p) => p.title === 'Rap S');
    expect(rapS.itemCount).toBe(5);
  }, 60000);
});
