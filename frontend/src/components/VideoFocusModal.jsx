import { useEffect, useRef } from 'react';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

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
  isShuffling,
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
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        if (hasPrev) onPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        if (hasNext) onNext();
      } else if (e.shiftKey && e.code.startsWith('Digit')) {
        // Shift+digit, not a plain digit - plain 1-9 is YouTube's own native
        // "seek to N0%" shortcut, so tier-reassignment needs a modifier to
        // stay unambiguous. e.code (not e.key) is used because e.key turns
        // into a shifted symbol like "!" once Shift is held.
        e.preventDefault();
        const digit = Number(e.code.slice('Digit'.length));
        const tier = availableTiers[digit - 1];
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

        <div className="focus-media">
          <div className="focus-embed">
            <EmbeddedPlayer
              key={video.videoId}
              videoId={video.videoId}
              onEnded={hasNext ? onNext : undefined}
            />
          </div>

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
        </div>

        <div className="focus-info">
          <h2>
            {video.title}
            {isShuffling && <span className="shuffle-badge" title="Shuffle play is active">🔀 Shuffle</span>}
          </h2>
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
          esc close · ← → / h l navigate · shift+1-{availableTiers.length} set tier
        </p>
      </div>
    </div>
  );
}
