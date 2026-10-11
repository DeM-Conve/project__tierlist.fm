import { useCallback, useMemo, useState } from 'react';
import { useInterval } from '@mantine/hooks';

// How often the dock's progress line re-reads the player.
export const POLL_MS = 500;

// The playing video's { cur, dur } in seconds, for the dock's progress line.
// The IFrame API doesn't push time-update events, so it's polled (Mantine
// useInterval) from the player in `playerRef`; it reads 0/0 until the player
// knows the duration, and starts again from 0/0 when `videoId` changes (each
// reading is tagged with its video, so no reset effect). -> [time, setTime]
// (setTime lets a seek show its new position before the next poll).
export function usePlayerTime(playerRef, videoId) {
  const [reading, setReading] = useState({ videoId, cur: 0, dur: 0 });
  const setTime = useCallback(({ cur, dur }) => setReading({ videoId, cur, dur }), [videoId]);
  useInterval(
    () => {
      const player = playerRef.current;
      if (!player?.getDuration) return;
      const duration = player.getDuration();
      if (!duration) return;
      setTime({ cur: player.getCurrentTime(), dur: duration });
    },
    POLL_MS,
    { autoInvoke: true }
  );
  const fresh = reading.videoId === videoId;
  const time = useMemo(() => (fresh ? { cur: reading.cur, dur: reading.dur } : { cur: 0, dur: 0 }), [fresh, reading]);
  return [time, setTime];
}
