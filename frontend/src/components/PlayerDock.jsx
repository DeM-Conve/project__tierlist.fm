import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Box, Group, Image, ScrollArea, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  ChevronDown,
  ChevronUp,
  PictureInPicture2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { TIER_COLORS, TODO_TIER } from '../tiers';
import { TierChip } from './TierBits';
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
  isTriage,
  onStop,
  onMinimize,
  onExpand,
  onFloat,
  onPrev,
  onNext,
  onChangeTier,
  queue = [],
  queueIndex = -1,
  onJump,
}) {
  const cardRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  // Remembers the level to restore when unmuting via the button/shortcut,
  // the way a hardware volume knob would - dragging the slider itself to 0
  // is just another way of reaching muted, not a separate state.
  const lastVolumeRef = useRef(100);
  // Like YouTube Music's repeat toggle, but just the one "repeat this song"
  // state (not the off/repeat-all/repeat-one three-way cycle) - repeat-all
  // would need to wrap the active sequence back to its own start, which is
  // App.jsx's queue data, not something this component has.
  const [repeatOne, setRepeatOne] = useState(false);
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
      } else if (e.shiftKey && e.code.startsWith('Digit')) {
        // Shift+digit, not a plain digit - plain 0-9 is the seek-to-percent
        // shortcut below, so tier-reassignment needs a modifier to stay
        // unambiguous. e.code (not e.key) is used because e.key turns into a
        // shifted symbol like "!" once Shift is held.
        e.preventDefault();
        const digit = Number(e.code.slice('Digit'.length));
        const tier = availableTiers[digit - 1];
        if (tier) onChangeTier(tier);
      } else if (!e.shiftKey && e.code.startsWith('Digit')) {
        // YouTube's own native "jump to N0% of the video" shortcut (0 = the
        // start, 9 = 90%) - reimplemented through the IFrame API instead of
        // relying on the embed's own listener, so it works globally (mini
        // bar, floating corner, anywhere on the page) rather than only when
        // the iframe itself happens to have DOM focus.
        e.preventDefault();
        const digit = Number(e.code.slice('Digit'.length));
        seekToPercent(digit * 10);
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
    if (isMuted) {
      const restored = lastVolumeRef.current || 100;
      player.unMute?.();
      player.setVolume?.(restored);
      setVolume(restored);
      setIsMuted(false);
    } else {
      lastVolumeRef.current = volume || 100;
      player.mute?.();
      setVolume(0);
      setIsMuted(true);
    }
  }

  function handleVolumeChange(next) {
    const player = playerRef.current;
    setVolume(next);
    if (next === 0) {
      player?.mute?.();
      setIsMuted(true);
    } else {
      lastVolumeRef.current = next;
      player?.unMute?.();
      player?.setVolume?.(next);
      setIsMuted(false);
    }
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

  function replayCurrent() {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(0, true);
    player.playVideo?.();
  }

  function seekToPercent(pct) {
    const player = playerRef.current;
    const duration = player?.getDuration?.();
    if (!duration) return;
    player.seekTo((pct / 100) * duration, true);
    setProgressPct(pct);
  }

  return (
    <div
      className={`player-dock ${expanded ? 'player-dock-expanded' : 'player-dock-mini'}${
        floating ? ' player-dock-floating' : ''
      }`}
    >
      <div
        className="player-dock-backdrop"
        onClick={onMinimize}
        style={
          currentTier
            ? { backgroundImage: `radial-gradient(900px 500px at 30% 40%, color-mix(in srgb, ${TIER_COLORS[currentTier]} 22%, transparent), transparent 70%)` }
            : undefined
        }
      />
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
          <ActionIcon
            variant={repeatOne ? 'filled' : 'default'}
            color="accent"
            radius="xl"
            size={mode === 'mini' ? 26 : 30}
            onClick={() => setRepeatOne((r) => !r)}
            aria-label={repeatOne ? 'Repeat this song: on' : 'Repeat this song: off'}
            aria-pressed={repeatOne}
            title={repeatOne ? 'Repeat: on' : 'Repeat: off'}
          >
            {repeatOne ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </ActionIcon>
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
                onEnded={repeatOne ? replayCurrent : hasNext ? onNext : undefined}
                onPlayerReady={(p) => {
                  playerRef.current = p;
                  // A new EmbeddedPlayer instance mounts per video (its own
                  // effect keys off videoId) - re-sync the slider/mute state
                  // to whatever that fresh player actually reports instead
                  // of assuming it kept the previous instance's volume.
                  if (p) {
                    const v = p.getVolume?.() ?? 100;
                    setVolume(v);
                    lastVolumeRef.current = v || lastVolumeRef.current;
                    setIsMuted(p.isMuted?.() ?? false);
                  }
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
              {(isShuffling || isTriage) && expanded && (
                <Badge ml="sm" variant="light" size="sm" style={{ verticalAlign: 'middle' }}>
                  {isTriage ? 'Triage' : 'Shuffle'}
                </Badge>
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
              {availableTiers.length > 0 && !floating && (
                <Group gap={3} wrap="nowrap" mr={6} visibleFrom="sm">
                  {availableTiers.map((t, i) => (
                    <TierChip
                      key={t}
                      tier={t}
                      size={24}
                      active={t === currentTier}
                      onClick={t === currentTier ? undefined : () => onChangeTier(t)}
                      title={`Rate → ${t} (Shift+${i + 1})`}
                    />
                  ))}
                </Group>
              )}
              <button
                className="player-dock-icon-btn"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <Slider
                value={volume}
                onChange={handleVolumeChange}
                min={0}
                max={100}
                step={5}
                w={80}
                size="xs"
                color="accent"
                label={null}
                aria-label="Volume"
              />
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
            {isTriage && currentTier === TODO_TIER && availableTiers.length > 0 && (
              <Text fz="xs" c="dimmed" mt="md">
                From your TODO list - pick its tier and the next one starts
              </Text>
            )}
            {availableTiers.length > 0 && (
              <Group gap={8} mt="md" wrap="wrap">
                <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mr={4} style={{ letterSpacing: 1 }}>
                  Rate
                </Text>

                {availableTiers.map((t, i) => (
                  <TierChip
                    key={t}
                    tier={t}
                    size={34}
                    active={t === currentTier}
                    kbd={`⇧${i + 1}`}
                    onClick={t === currentTier ? undefined : () => onChangeTier(t)}
                    title={`Move to ${t}`}
                  />
                ))}
              </Group>
            )}

            <p className="focus-hint">
              esc/j minimize · ← → seek 10s · h l navigate · space play/pause · m mute · 0-9 seek %
              {availableTiers.length > 0 && ` · shift+1-${availableTiers.length} set tier`}
            </p>
          </>
        )}

        {expanded && queue.length > 1 && (
          <aside className="player-queue">
            <Group justify="space-between" mb={8}>
              <Text fz={11} fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                Up next
              </Text>
              <Group gap={6}>
                {(isShuffling || isTriage) && (
                  <Badge size="xs" variant="light">
                    {isTriage ? 'Triage' : 'Shuffle'}
                  </Badge>
                )}
                <Text fz="xs" c="dimmed">
                  {queueIndex + 1} / {queue.length}
                </Text>
              </Group>
            </Group>
            <ScrollArea h="min(62vh, 560px)" type="auto" offsetScrollbars>
              <Stack gap={2}>
                {queue.slice(queueIndex, queueIndex + 60).map((entry, i) => {
                  const idx = queueIndex + i;
                  const isCurrent = i === 0;
                  return (
                    <UnstyledButton
                      key={entry.video.videoId}
                      onClick={() => onJump?.(idx)}
                      className="queue-row"
                      p={6}
                      style={{
                        borderRadius: 6,
                        background: isCurrent ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined,
                      }}
                    >
                      <Group gap={8} wrap="nowrap">
                        <Image src={entry.video.thumbnail} w={36} h={36} radius={4} fit="cover" alt="" />
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text fz="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'accent' : undefined} truncate="end">
                            {entry.video.title}
                          </Text>
                          <Text fz="xs" c="dimmed" truncate="end">
                            {entry.video.channelTitle}
                          </Text>
                        </Box>
                        {(isCurrent ? currentTier ?? entry.tier : entry.tier) && (
                          <TierChip tier={isCurrent ? currentTier ?? entry.tier : entry.tier} size={20} />
                        )}
                      </Group>
                    </UnstyledButton>
                  );
                })}
              </Stack>
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
}
