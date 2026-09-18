import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  PictureInPicture2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

// Renders in 'expanded' (full-screen modal), 'mini' (YouTube-Music-style
// bottom bar) or 'floating' (small bottom-right corner box) modes.
// Critically, the same EmbeddedPlayer stays mounted across every switch -
// only CSS classes change - so changing views never stops or restarts
// playback, it just changes how much of the screen it occupies.
//
// The vim-style j/k shortcuts drive this as an explicit state machine
// rather than a modulo-cycled list, because "down"/"up" aren't opposites of
// a single ring: j (down) only ever moves toward *more* minimized - from
// expanded to the mini bar, then oscillating between the mini bar and the
// floating corner (both already "down", so j between them just swaps which
// minimized view you're in) - it never wraps back up to expanded on its
// own. k (up) always jumps straight back to expanded, from any state.
const PLAYER_MODE_TRANSITIONS = {
  expanded: { down: 'mini', up: 'expanded' },
  mini: { down: 'floating', up: 'expanded' },
  floating: { down: 'mini', up: 'expanded' },
};

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
  onFloat,
  onPrev,
  onNext,
  onChangeTier,
}) {
  const cardRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const expanded = mode === 'expanded';
  // "Floating corner" mode: an in-page floating box pinned to the bottom-right
  // corner, the way YouTube Music's own in-app miniplayer works. This is
  // deliberately *not* the real Document Picture-in-Picture API - that moves
  // the iframe into a separate top-level browsing context, which makes
  // YouTube's embed treat it as an unauthorized origin and refuse to play
  // ("owner has disabled embedding"). It's just a CSS class toggle on the
  // same mini-bar DOM shape - the player never stops or reloads.
  const floating = mode === 'floating';

  function applyMode(nextMode) {
    if (nextMode === 'expanded') onExpand();
    else if (nextMode === 'mini') onMinimize();
    else onFloat();
  }

  useEffect(() => {
    if (expanded) cardRef.current?.focus();
  }, [expanded]);

  // The mini bar is fixed to the bottom of the viewport, so anything else
  // fixed/scrollable at the page's own bottom (the sidebar's footer, the
  // last row of a tier board, ...) would otherwise render underneath it.
  // Expose its real, measured height as a CSS variable so the rest of the
  // layout can reserve exactly that much space - only while it's actually
  // showing as a bar, and never a guessed/hardcoded pixel value.
  useEffect(() => {
    const root = document.documentElement;
    // Floating mode is a small corner box, not a full-width bar - it
    // shouldn't reserve any bottom padding on the rest of the layout.
    if (expanded || floating) {
      root.style.setProperty('--player-dock-height', '0px');
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty('--player-dock-height', `${entry.contentRect.height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, floating]);

  useEffect(() => {
    return () => document.documentElement.style.setProperty('--player-dock-height', '0px');
  }, []);

  // The IFrame API doesn't push time-update events, so the mini bar's
  // progress line has to be polled from the player instead.
  useEffect(() => {
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getDuration) return;
      const duration = player.getDuration();
      if (!duration) return;
      setProgressPct((player.getCurrentTime() / duration) * 100);
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setProgressPct(0);
  }, [video.videoId]);

  // Vim-style navigation for the dock, active globally (not just while
  // expanded) since the dock is meant to work like a background player:
  // h/l (and the arrow keys) skip prev/next track. j/k drive the mode
  // through PLAYER_MODE_TRANSITIONS - see the comment on that table for why
  // it's a state machine rather than a simple cycle. Skipped entirely while
  // the user is typing (filter box, command palette, ...) so it never
  // hijacks normal input, and h/l/arrow keys are skipped on the duel
  // screen, which already uses left/right arrow itself to pick a duel's
  // winner.
  useEffect(() => {
    function onKeyDown(e) {
      const active = document.activeElement;
      const isTyping =
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
      if (isTyping) return;
      // Ctrl/Cmd-K opens the command palette, Alt-anything is a browser/OS
      // shortcut - e.key is still just 'k' either way, so without this
      // check e.g. Cmd+K would open the palette *and* expand the dock at
      // the same time. Shift is allowed through (shift+digit reassigns a
      // tier below).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (expanded) onMinimize();
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        applyMode(PLAYER_MODE_TRANSITIONS[mode].down);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        applyMode(PLAYER_MODE_TRANSITIONS[mode].up);
        return;
      }

      const onDuelScreen = document.querySelector('.duel-view');
      if (onDuelScreen) return;

      if (expanded && e.key === 'ArrowLeft') {
        // While expanded, the arrow keys match the on-screen ‹ › buttons
        // (scrub within the current video) instead of skipping tracks -
        // h/l are the dedicated track-skip keys in every mode.
        e.preventDefault();
        seekBy(-10);
      } else if (expanded && e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(10);
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        if (hasPrev) onPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        if (hasNext) onNext();
      } else if (e.key === ' ' || e.code === 'Space') {
        // Duel owns Space for its own "skip" shortcut - the early return
        // above for onDuelScreen already keeps this from firing there.
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (expanded && e.shiftKey && e.code.startsWith('Digit')) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    expanded,
    onMinimize,
    onExpand,
    onFloat,
    onPrev,
    onNext,
    hasPrev,
    hasNext,
    availableTiers,
    onChangeTier,
    // togglePlay/toggleMute close over isPlaying/isMuted state directly
    // (rather than reading it fresh off the player), so this effect must
    // re-subscribe whenever either changes or Space/m would act on a
    // stale play/mute state.
    isPlaying,
    isMuted,
  ]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo?.();
    else player.playVideo?.();
  }

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) player.unMute?.();
    else player.mute?.();
    setIsMuted(!isMuted);
  }

  function seek(e) {
    const player = playerRef.current;
    const duration = player?.getDuration?.();
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    player.seekTo(ratio * duration, true);
    setProgressPct(ratio * 100);
  }

  // The on-screen ‹ › overlay buttons scrub within the current video, the
  // same way YouTube's own player does - track skipping is h/l or the
  // dedicated prev/next buttons in the mini bar's controls, not these.
  function seekBy(deltaSeconds) {
    const player = playerRef.current;
    const duration = player?.getDuration?.();
    if (!duration) return;
    const next = Math.min(duration, Math.max(0, player.getCurrentTime() + deltaSeconds));
    player.seekTo(next, true);
    setProgressPct((next / duration) * 100);
  }

  return (
    <div
      className={`player-dock ${expanded ? 'player-dock-expanded' : 'player-dock-mini'}${
        floating ? ' player-dock-floating' : ''
      }`}
    >
      <div className="player-dock-backdrop" onClick={onMinimize} />
      <div
        className="player-dock-card"
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
      >
        {!expanded && (
          <div className="player-dock-progress-track" onClick={seek}>
            <div className="player-dock-progress" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        <div className="player-dock-toolbar">
          {expanded ? (
            // Closing the expanded view minimizes it to the bottom bar
            // instead of stopping playback - matches how YouTube Music's
            // "✕" on the full player collapses to its mini bar rather than
            // ending the song.
            <button className="modal-close" onClick={onMinimize} aria-label="Minimize" title="Minimize">
              <ChevronDown size={16} />
            </button>
          ) : (
            <>
              <button className="modal-close" onClick={onExpand} aria-label="Expand" title="Expand">
                <ChevronUp size={16} />
              </button>
              <button className="modal-close" onClick={onStop} aria-label="Stop" title="Stop playback">
                <X size={16} />
              </button>
            </>
          )}
        </div>

        <div className="focus-media-slot">
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

            {expanded && (
              <button
                className="focus-nav focus-nav-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  seekBy(-10);
                }}
                aria-label="Back 10 seconds"
              >
                ‹
              </button>
            )}
            {expanded && (
              <button
                className="focus-nav focus-nav-next"
                onClick={(e) => {
                  e.stopPropagation();
                  seekBy(10);
                }}
                aria-label="Forward 10 seconds"
              >
                ›
              </button>
            )}
          </div>
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
              <button
                className="player-dock-icon-btn"
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label="Previous"
              >
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button
                className="player-dock-icon-btn player-dock-play-btn"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>
              <button
                className="player-dock-icon-btn"
                onClick={onNext}
                disabled={!hasNext}
                aria-label="Next"
              >
                <SkipForward size={18} fill="currentColor" />
              </button>
            </div>
          )}

          {!expanded && (
            <div className="player-dock-secondary">
              <button
                className="player-dock-icon-btn"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <button
                className={`player-dock-icon-btn${floating ? ' player-dock-icon-btn-active' : ''}`}
                onClick={() => applyMode(floating ? 'mini' : 'floating')}
                aria-label={floating ? 'Exit floating corner' : 'Floating corner'}
                title="Floating corner"
              >
                <PictureInPicture2 size={17} />
              </button>
            </div>
          )}
        </div>

        {expanded && (
          <>
            {availableTiers.length > 0 && (
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
            )}

            <p className="focus-hint">
              esc/j minimize · ← → seek 10s · h l navigate · space play/pause · m mute
              {availableTiers.length > 0 && ` · shift+1-${availableTiers.length} set tier`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
