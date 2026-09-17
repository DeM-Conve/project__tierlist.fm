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
  const focusMediaRef = useRef(null);
  const pipWindowRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const expanded = mode === 'expanded';
  const pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

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
    if (expanded) {
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
  }, [expanded]);

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

  // Real browser Picture-in-Picture, the same feature YouTube's own
  // "miniplayer" button uses - not something faked with a floating div.
  // The IFrame embed isn't a <video> element, so the classic
  // video.requestPictureInPicture() API doesn't apply; the Document
  // Picture-in-Picture API instead moves an actual DOM node (here, the
  // video area) into a real always-on-top OS window, then back when it's
  // closed. Chrome-only for now, so the button only appears when supported.
  async function togglePiP() {
    if (!pipSupported) return;
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      return;
    }
    const el = focusMediaRef.current;
    if (!el) return;

    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 320,
      height: 180,
    });
    [...document.styleSheets].forEach((sheet) => {
      try {
        const rules = [...sheet.cssRules].map((r) => r.cssText).join('\n');
        const style = pipWindow.document.createElement('style');
        style.textContent = rules;
        pipWindow.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = pipWindow.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });
    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.background = '#000';
    pipWindow.document.body.append(el);
    pipWindowRef.current = pipWindow;
    setIsPipActive(true);

    pipWindow.addEventListener(
      'pagehide',
      () => {
        cardRef.current?.querySelector('.focus-media-slot')?.append(el);
        pipWindowRef.current = null;
        setIsPipActive(false);
      },
      { once: true }
    );
  }

  // If the whole dock unmounts (playback fully stopped) while PiP is open,
  // close the floating window with it rather than leaving it orphaned.
  useEffect(() => {
    return () => pipWindowRef.current?.close();
  }, []);

  return (
    <div className={`player-dock ${expanded ? 'player-dock-expanded' : 'player-dock-mini'}`}>
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
          {isPipActive && (
            <div className="focus-media-pip-placeholder">Playing in Picture-in-Picture</div>
          )}
          <div className="focus-media" ref={focusMediaRef} onClick={!expanded ? onExpand : undefined}>
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
              {pipSupported && (
                <button
                  className={`player-dock-icon-btn${isPipActive ? ' player-dock-icon-btn-active' : ''}`}
                  onClick={togglePiP}
                  aria-label={isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                  title="Picture-in-Picture"
                >
                  <PictureInPicture2 size={17} />
                </button>
              )}
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
