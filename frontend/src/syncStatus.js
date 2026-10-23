import { setSyncStatus } from './store/tiersSlice';

// The status a push ends on when, after its checks (syncCache.preparePush),
// nothing was left to send: changes held back with a reason -> 'partial';
// changes settled without sending -> 'done'; nothing at all -> 'idle'.
export const preparedStatus = ({ skipped, settled }) => (skipped ? 'partial' : settled ? 'done' : 'idle');

// One push's status setter. 'done' / 'partial' fall back to 'idle' after a
// moment - unless another push has started since: each push gets its own
// token, so an older push's timer never resets a newer one's status (even
// one that happens to be the same value). 'error' stays until the next push.
export function syncStatusRun(dispatch, counter, delay = 2500) {
  const run = ++counter.current;
  return (status) => {
    dispatch(setSyncStatus(status));
    if (status === 'idle' || status === 'error' || status === 'syncing') return;
    setTimeout(() => {
      if (counter.current === run) dispatch(setSyncStatus('idle'));
    }, delay);
  };
}

// Several boards pushed in one go end on the worst of their statuses.
const RANK = { idle: 0, done: 1, partial: 2, error: 3 };
export const worstStatus = (a, b) => (RANK[b] > RANK[a] ? b : a);
