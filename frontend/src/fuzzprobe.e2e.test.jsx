import { it, vi } from 'vitest';
import { fuzzRun } from './test/syncFuzz';
vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));
it('probe', async () => {
  const t = performance.now();
  for (let s = Number(process.env.FROM || 1); s <= Number(process.env.N || 6); s++) {
    const res = await fuzzRun(s, { ops: 30, avoidKnownBugs: process.env.AVOID !== '0' });
    if (res.problems.length) console.log(`SYNCS ${JSON.stringify(res.syncs.slice(-4).map(c=>[c.payload,c.response.results]))}`), console.log(`SEED ${s}\n  ${res.problems.join('\n  ')}\n  LOG ${res.log.join('; ')}`);
    else console.log(`SEED ${s} ok`);
  }
  console.log('TIME', Math.round(performance.now() - t));
}, 600000);
