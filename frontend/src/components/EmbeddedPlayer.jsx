import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi } from '../youtubePlayer';

// React owns the outer container div and never gives it JSX children, so
// it's never touched by React's own reconciliation. The YT.Player API
// *replaces* whatever element it's given with its own iframe - if that
// element were the one React manages directly, React would later try to
// clean up a node that's already gone. So the API is only ever handed a
// plain child we create and manage ourselves, one layer below React's div.
export default function EmbeddedPlayer({ videoId, autoplay = true, onEnded }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | blocked

  // Kept in a ref so the player isn't torn down and recreated just because a
  // parent re-render passed a new onEnded closure - only videoId should do that.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

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
          onReady: () => !cancelled && setStatus('ready'),
          onError: () => !cancelled && setStatus('blocked'),
          onStateChange: (e) => {
            if (!cancelled && e.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
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
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (status === 'blocked') {
    return (
      <div className="focus-embed-blocked">
        <p>This video can't be played here — the owner has disabled embedding.</p>
        <a
          className="btn btn-primary"
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on YouTube ↗
        </a>
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
