import { useEffect } from 'react';
import { TIER_COLORS } from '../tiers';

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
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext) onNext();
      else if (e.key >= '1' && e.key <= '9') {
        const tier = availableTiers[Number(e.key) - 1];
        if (tier) onChangeTier(tier);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext, availableTiers, onChangeTier]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="focus-card" onClick={(e) => e.stopPropagation()}>
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
          <iframe
            key={video.videoId}
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
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
              <span className="tier-pill-key">{i + 1}</span>
            </button>
          ))}
        </div>

        <p className="focus-hint">esc close · ← → navigate · 1-{availableTiers.length} set tier</p>
      </div>
    </div>
  );
}
