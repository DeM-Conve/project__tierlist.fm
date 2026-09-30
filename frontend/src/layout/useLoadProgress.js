import { useEffect } from 'react';
import { useProgress } from '@bprogress/react';

// Drives the top-of-page progress bar (@bprogress/react) while `loading`.
// `key` names what's loading (the board): every new load restarts the bar
// from 0 - start() alone carries on from wherever the bar is, so switching
// boards mid-load, or before the last one's bar had faded out, left it
// stuck full.
export function useLoadProgress(loading, key) {
  const { start, stop, set } = useProgress();
  useEffect(() => {
    if (loading) {
      set(0);
      start();
    } else stop();
  }, [loading, key, start, stop, set]);
}
