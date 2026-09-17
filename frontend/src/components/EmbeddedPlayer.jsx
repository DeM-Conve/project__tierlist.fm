import { useEffect, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { loadYouTubeApi } from '../youtubePlayer';

// React owns the outer container div and never gives it JSX children, so
// it's never touched by React's own reconciliation. The YT.Player API
// *replaces* whatever element it's given with its own iframe - if that
// element were the one React manages directly, React would later try to
// clean up a node that's already gone. So the API is only ever handed a
// plain child we create and manage ourselves, one layer below React's div.
export default function EmbeddedPlayer({ videoId, autoplay = true, onEnded, onPlayerReady, onPlayingChange }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | blocked

  // Kept in refs so the player isn't torn down and recreated just because a
  // parent re-render passed new closures - only videoId should do that.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlayerReadyRef = useRef(onPlayerReady);
  onPlayerReadyRef.current = onPlayerReady;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const mountEl = document.createElement('div');
    mountEl.style.width = '100%';
    mountEl.style.height = '100%';
    containerRef.current?.appendChild(mountEl);

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mountEl, {
        videoId,
        playerVars: { autoplay: autoplay ? 1 : 0, rel: 0 },
        events: {
          onReady: () => {
            if (cancelled) return;
            setStatus('ready');
            onPlayerReadyRef.current?.(playerRef.current);
          },
          onError: () => !cancelled && setStatus('blocked'),
          onStateChange: (e) => {
            if (cancelled) return;
            if (e.data === window.YT.PlayerState.ENDED) onEndedRef.current?.();
            if (e.data === window.YT.PlayerState.PLAYING) onPlayingChangeRef.current?.(true);
            if (e.data === window.YT.PlayerState.PAUSED) onPlayingChangeRef.current?.(false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // already gone (e.g. API never finished loading before unmount)
      }
      playerRef.current = null;
      onPlayerReadyRef.current?.(null);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (status === 'blocked') {
    return (
      <div className="focus-embed-blocked">
        <p>This video can't be played here — the owner has disabled embedding.</p>
        <Button
          component="a"
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on YouTube ↗
        </Button>
      </div>
    );
  }

  return (
    <>
      {status === 'loading' && <div className="focus-embed-loading">Loading player...</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
