import { useEffect, useRef, useState } from 'react';
import { TIER_COLORS } from '../tiers';
import { loadYouTubeApi } from '../youtubePlayer';

function EmbeddedPlayer({ videoId }) {
  // React owns this div and never gives it JSX children, so it's never touched
  // by React's own reconciliation. The YT.Player API *replaces* whatever
  // element it's given with its own iframe - if that element were the one
  // React manages directly, React would later try to clean up a node that's
  // already gone. So the API is only ever handed a plain child we create and
  // manage ourselves, one layer below React's div.
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | blocked

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
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onReady: () => !cancelled && setStatus('ready'),
          onError: () => !cancelled && setStatus('blocked'),
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

export default function VideoFocusModal({
  video,
  currentTier,
  availableTiers,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
  onChangeTier,
}) {
  const cardRef = useRef(null);

  // Pull focus into the modal on open. Otherwise the thumbnail that was
  // clicked to open it keeps browser focus, and unmodified arrow-key presses
  // fall through to the browser's native "scroll the focused element's
  // scrollable ancestor" behavior - visibly scrolling the tier row sitting
  // behind the overlay.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (hasPrev) onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (hasNext) onNext();
      } else if (e.shiftKey && e.key >= '1' && e.key <= '9') {
        // Shift+number, not bare number: plain digits are YouTube's own
        // native "seek to N0%" shortcut once focus is inside the player.
        e.preventDefault();
        const tier = availableTiers[Number(e.key) - 1];
        if (tier) onChangeTier(tier);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext, availableTiers, onChangeTier]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="focus-card" tabIndex={-1} ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {hasPrev && (
          <button className="focus-nav focus-nav-prev" onClick={onPrev} aria-label="Previous video">
            ‹
          </button>
        )}
        {hasNext && (
          <button className="focus-nav focus-nav-next" onClick={onNext} aria-label="Next video">
            ›
          </button>
        )}

        <div className="focus-embed">
          <EmbeddedPlayer key={video.videoId} videoId={video.videoId} />
        </div>

        <div className="focus-info">
          <h2>{video.title}</h2>
          <p className="hint-text">{video.channelTitle}</p>
        </div>

        <div className="focus-tiers">
          {availableTiers.map((t, i) => (
            <button
              key={t}
              className={`tier-pill${t === currentTier ? ' tier-pill-active' : ''}`}
              style={{ background: TIER_COLORS[t] }}
              onClick={() => onChangeTier(t)}
            >
              {t}
              <span className="tier-pill-key">⇧{i + 1}</span>
            </button>
          ))}
        </div>

        <p className="focus-hint">
          esc close · ← → navigate · ⇧1-{availableTiers.length} set tier
        </p>
      </div>
    </div>
  );
}
