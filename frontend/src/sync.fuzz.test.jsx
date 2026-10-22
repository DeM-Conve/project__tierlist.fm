// Seeded random sessions over the real app and a fake YouTube (see
// src/test/syncFuzz.js): every push must leave YouTube exactly as the boards
// showed it. Fixed seeds, so a failure is reproducible - its message names
// the seed and the op log. Scale up locally with SYNC_FUZZ_RUNS /
// SYNC_FUZZ_OPS (e.g. SYNC_FUZZ_RUNS=50 npx vitest run src/sync.fuzz.test.jsx).
import { describe, expect, it, vi } from 'vitest';
import { fuzzRun } from './test/syncFuzz';

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));

const RUNS = Number(process.env.SYNC_FUZZ_RUNS || 8);
const OPS = Number(process.env.SYNC_FUZZ_OPS || 30);
const TIMEOUT = 60000 + RUNS * OPS * 400;

async function runSeeds(first, count, options) {
  for (let seed = first; seed < first + count; seed++) {
    const { problems, log } = await fuzzRun(seed, { ops: OPS, ...options });
    expect(problems, `seed ${seed}\nops: ${log.join('; ')}`).toEqual([]);
  }
}

describe('random editing sessions', () => {
  it(`moves, bin, undo/redo, discard, transfers, duels, Add songs, refused writes (${RUNS} seeds x ${OPS} ops)`, async () => {
    await runSeeds(1, RUNS, { faults: true });
  }, TIMEOUT);

  // Ctrl+Z reaching back past pushes (pushed removals, transfers, moves) -
  // fixed by fix/undo-after-push (rebaseHistory).
  it('undo across pushes', async () => {
    await runSeeds(101, RUNS, { undoAcrossPush: true });
  }, TIMEOUT);

  it('boards with duplicate songs, refused writes', async () => {
    await runSeeds(201, RUNS, { duplicates: true, faults: true });
  }, TIMEOUT);
});
