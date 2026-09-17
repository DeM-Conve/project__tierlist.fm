import { useEffect, useRef, useState } from 'react';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

// Renders in both 'expanded' (full-screen modal) and 'mini' (YouTube-Music-
// style bottom bar) modes. Critically, the same EmbeddedPlayer stays mounted
// across that switch - only CSS classes change - so minimizing never stops
// or restarts playback, it just changes how much of the screen it occupies.
export default function PlayerDock({
  mode,
  video,
  currentTier,
  availableTiers,
  hasPrev,
  hasNext,
  isShuffling,
  onStop,
  onMinimize,
  onExpand,
  onPrev,
  onNext,
  onChangeTier,
}) {
  const cardRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const expanded = mode === 'expanded';

  useEffect(() => {
    if (expanded) cardRef.current?.focus();
  }, [expanded]);

  // Keyboard shortcuts only make sense while the dock owns the screen -
  // while minimized, the rest of the app is in normal use and shouldn't
  // have its typing/scrolling hijacked by leftover player shortcuts.
  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onMinimize();
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
  }, [expanded, onMinimize, onPrev, onNext, hasPrev, hasNext, availableTiers, onChangeTier]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo?.();
    else player.playVideo?.();
  }

  return (
    <div className={`player-dock ${expanded ? 'player-dock-expanded' : 'player-dock-mini'}`}>
      <div className="player-dock-backdrop" onClick={onMinimize} />
      <div
        className="player-dock-card"
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="player-dock-toolbar">
          {expanded ? (
            // Closing the expanded view minimizes it to the bottom bar
            // instead of stopping playback - matches how YouTube Music's
            // "✕" on the full player collapses to its mini bar rather than
            // ending the song.
            <button className="modal-close" onClick={onMinimize} aria-label="Minimize" title="Minimize">
              ✕
            </button>
          ) : (
            <>
              <button className="modal-close" onClick={onExpand} aria-label="Expand" title="Expand">
                ⌃
              </button>
              <button className="modal-close" onClick={onStop} aria-label="Stop" title="Stop playback">
                ✕
              </button>
            </>
          )}
        </div>

        <div className="focus-media" onClick={!expanded ? onExpand : undefined}>
          <div className="focus-embed">
            <EmbeddedPlayer
              key={video.videoId}
              videoId={video.videoId}
              onEnded={hasNext ? onNext : undefined}
              onPlayerReady={(p) => {
                playerRef.current = p;
              }}
              onPlayingChange={setIsPlaying}
            />
          </div>

          {expanded && hasPrev && (
            <button className="focus-nav focus-nav-prev" onClick={onPrev} aria-label="Previous video">
              ‹
            </button>
          )}
          {expanded && hasNext && (
            <button className="focus-nav focus-nav-next" onClick={onNext} aria-label="Next video">
              ›
            </button>
          )}
        </div>

        <div className="player-dock-body">
          <div className="focus-info" onClick={!expanded ? onExpand : undefined}>
            <h2>
              {video.title}
              {isShuffling && expanded && (
                <span className="shuffle-badge" title="Shuffle play is active">🔀 Shuffle</span>
              )}
            </h2>
            <p className="hint-text">{video.channelTitle}</p>
          </div>

          {!expanded && (
            <div className="player-dock-controls">
              <button className="btn btn-ghost" onClick={onPrev} disabled={!hasPrev} aria-label="Previous">
                ‹
              </button>
              <button className="btn btn-ghost" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="btn btn-ghost" onClick={onNext} disabled={!hasNext} aria-label="Next">
                ›
              </button>
            </div>
          )}
        </div>

        {expanded && (
          <>
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
              esc minimize · ← → / h l navigate · shift+1-{availableTiers.length} set tier
            </p>
          </>
        )}
      </div>
    </div>
  );
}
