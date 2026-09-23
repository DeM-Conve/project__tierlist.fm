import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Group, Image, ScrollArea, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  ChevronDown,
  ChevronUp,
  PictureInPicture2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { REMOVED_TIER, TIER_COLORS, TODO_TIER } from '../tiers';
import { EqualizerMark, TierChip } from './TierBits';
import EmbeddedPlayer from './EmbeddedPlayer';
import { isSequenceKey } from '../keyboard/sequence';

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
// How many upcoming / already-played queue entries the expanded view
// renders at once around the current song.
const QUEUE_PREVIEW = 80;
const QUEUE_HISTORY = 30;

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
  onRemove,
}) {
  const cardRef = useRef(null);
  // Keeps the current song pinned near the top of the queue panel as the
  // queue advances - played songs stay one scroll up, like YouTube Music.
  const queueViewportRef = useRef(null);
  const currentRowRef = useRef(null);
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

  // Scroll the queue so the current song sits just below the top edge,
  // with a sliver of the last played song showing above it.
  useEffect(() => {
    const viewport = queueViewportRef.current;
    const row = currentRowRef.current;
    if (!expanded || !viewport || !row) return;
    const top = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTo({ top: Math.max(0, top - 28), behavior: 'smooth' });
  }, [expanded, queueIndex, queue.length]);

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
      if (isSequenceKey(e)) return;
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

  // The expanded view's ⟲ ⟳ buttons (and ←/→) scrub within the current
  // video - track skipping is h/l or the prev/next buttons.
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

  const iconSize = expanded ? 20 : 18;
  const btnSize = expanded ? 38 : 30;
  // One continuous list, YouTube-Music style: what's been played sits above
  // the current song (dimmed), what's next below it.
  const windowStart = Math.max(0, queueIndex - QUEUE_HISTORY);
  const queueWindow = queue.slice(windowStart, queueIndex + 1 + QUEUE_PREVIEW);
  const earlierCount = windowStart;
  const moreCount = Math.max(0, queue.length - windowStart - queueWindow.length);
  const nowTier = currentTier ?? queue[queueIndex]?.tier;

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

        <Group className="player-dock-toolbar" gap={6} wrap="nowrap">
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
            <ActionIcon variant="default" radius="xl" size={30} onClick={onMinimize} aria-label="Minimize" title="Minimize (Esc)">
              <ChevronDown size={16} />
            </ActionIcon>
          ) : (
            <>
              <ActionIcon variant="default" radius="xl" size={26} onClick={onExpand} aria-label="Expand" title="Expand (k)">
                <ChevronUp size={16} />
              </ActionIcon>
              <ActionIcon variant="default" radius="xl" size={26} onClick={onStop} aria-label="Stop" title="Stop playback">
                <X size={16} />
              </ActionIcon>
            </>
          )}
        </Group>

        {/* Main column. `display: contents` in the mini/floating layouts, so
            it only groups children for the expanded grid - the player
            subtree inside keeps the same DOM position in every mode. */}
        <div className="player-dock-main">
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
            </div>
          </div>

          <div className="player-dock-body">
            <div className="focus-info" onClick={!expanded ? onExpand : undefined}>
              <h2>{video.title}</h2>
              <Group gap={8} wrap="nowrap">
                <p className="hint-text" style={{ minWidth: 0 }}>{video.channelTitle}</p>
                {(isShuffling || isTriage) && expanded && (
                  <Badge variant="light" size="sm">
                    {isTriage ? 'Triage' : 'Shuffle'}
                  </Badge>
                )}
              </Group>
            </div>

            <Group className="player-dock-controls" gap={expanded ? 6 : 2} wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" radius="xl" size={btnSize} onClick={onPrev} disabled={!hasPrev} aria-label="Previous" title="Previous (h)">
                <SkipBack size={iconSize} fill="currentColor" />
              </ActionIcon>
              {expanded && (
                <ActionIcon variant="subtle" color="gray" radius="xl" size={btnSize} onClick={() => seekBy(-10)} aria-label="Back 10 seconds" title="Back 10s (←)">
                  <RotateCcw size={iconSize} />
                </ActionIcon>
              )}
              <ActionIcon
                variant="filled"
                color="accent"
                radius="xl"
                size={expanded ? 48 : 34}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPlaying ? 'Pause (space)' : 'Play (space)'}
              >
                {isPlaying ? <Pause size={iconSize} fill="currentColor" /> : <Play size={iconSize} fill="currentColor" />}
              </ActionIcon>
              {expanded && (
                <ActionIcon variant="subtle" color="gray" radius="xl" size={btnSize} onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="Forward 10s (→)">
                  <RotateCw size={iconSize} />
                </ActionIcon>
              )}
              <ActionIcon variant="subtle" color="gray" radius="xl" size={btnSize} onClick={onNext} disabled={!hasNext} aria-label="Next" title="Next (l)">
                <SkipForward size={iconSize} fill="currentColor" />
              </ActionIcon>
            </Group>

            <Group className="player-dock-secondary" gap={2} wrap="nowrap">
              {availableTiers.length > 0 && mode === 'mini' && (
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
                  {currentTier !== REMOVED_TIER && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={24}
                      onClick={() => onChangeTier(REMOVED_TIER)}
                      aria-label="Remove from playlist"
                      title="Remove from its playlist (on push)"
                    >
                      <Trash2 size={14} />
                    </ActionIcon>
                  )}
                </Group>
              )}
              <ActionIcon variant="subtle" color="gray" radius="xl" size={30} onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} title="Mute (m)">
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </ActionIcon>
              <Slider
                value={volume}
                onChange={handleVolumeChange}
                min={0}
                max={100}
                step={5}
                w={expanded ? 110 : 80}
                size="xs"
                color="accent"
                label={null}
                aria-label="Volume"
              />
              {!expanded && (
                <ActionIcon
                  variant={floating ? 'light' : 'subtle'}
                  color={floating ? 'accent' : 'gray'}
                  radius="xl"
                  size={30}
                  onClick={() => applyMode(floating ? 'mini' : 'floating')}
                  aria-label={floating ? 'Exit floating corner' : 'Floating corner'}
                  title="Floating corner (j)"
                >
                  <PictureInPicture2 size={17} />
                </ActionIcon>
              )}
            </Group>
          </div>

          {expanded && (
            <Stack gap={10} mt="lg">
              {isTriage && currentTier === TODO_TIER && availableTiers.length > 0 && (
                <Text fz="xs" c="dimmed">
                  From your TODO list - pick its tier and the next one starts
                </Text>
              )}
              {availableTiers.length > 0 && (
                <Group gap={8} wrap="wrap">
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
                  {/* Staged like any move: nothing is deleted until you push,
                      and the review's "Put back" (or Ctrl+Z) undoes it. */}
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    ml="xs"
                    leftSection={<Trash2 size={14} />}
                    onClick={() => onChangeTier(REMOVED_TIER)}
                    disabled={currentTier === REMOVED_TIER}
                  >
                    {currentTier === REMOVED_TIER ? 'Removed on push' : 'Remove from playlist'}
                  </Button>
                </Group>
              )}
              <Text fz={11} c="dimmed" opacity={0.75}>
                esc/j minimize · ← → seek 10s · h l navigate · space play/pause · m mute · 0-9 seek %
                {availableTiers.length > 0 && ` · shift+1-${availableTiers.length} set tier`}
              </Text>
            </Stack>
          )}
        </div>

        {expanded && queue.length > 1 && (
          <aside className="player-queue">
            <Group h={30} gap={8} wrap="nowrap" className="player-queue-head">
              <Text fz={11} fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                Queue
              </Text>
              <Text fz="xs" c="dimmed">
                {queueIndex + 1} / {queue.length}
              </Text>
            </Group>

            <ScrollArea
              viewportRef={queueViewportRef}
              mt={12}
              style={{ flex: 1, minHeight: 0 }}
              type="hover"
              scrollbarSize={6}
              offsetScrollbars
            >
              <Stack gap={2}>
                {earlierCount > 0 && (
                  <Text fz="xs" c="dimmed" ta="center" py={6}>
                    {earlierCount} earlier
                  </Text>
                )}
                {queueWindow.map((entry, i) => {
                  const idx = windowStart + i;
                  const isCurrent = idx === queueIndex;
                  const played = idx < queueIndex;
                  const tier = isCurrent ? nowTier : entry.tier;
                  return (
                    <Group
                      key={entry.video.videoId}
                      ref={isCurrent ? currentRowRef : undefined}
                      className="queue-row"
                      gap={4}
                      wrap="nowrap"
                      pr={4}
                      bg={isCurrent ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined}
                      opacity={played ? 0.55 : 1}
                      aria-current={isCurrent ? 'true' : undefined}
                      style={{ borderRadius: 8 }}
                    >
                      <UnstyledButton
                        onClick={isCurrent ? undefined : () => onJump?.(idx)}
                        px={6}
                        py={6}
                        style={{ flex: 1, minWidth: 0, cursor: isCurrent ? 'default' : undefined }}
                      >
                        <Group gap={10} wrap="nowrap">
                          <Box w={22} style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                            {isCurrent ? (
                              <EqualizerMark color="var(--accent)" height={11} />
                            ) : (
                              <Text fz={11} c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {idx + 1}
                              </Text>
                            )}
                          </Box>
                          <Image src={entry.video.thumbnail} w={40} h={40} radius={6} fit="cover" alt="" />
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text fz="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'accent' : undefined} truncate="end">
                              {entry.video.title}
                            </Text>
                            <Text fz="xs" c="dimmed" truncate="end">
                              {entry.video.channelTitle}
                            </Text>
                          </Box>
                          {tier && <TierChip tier={tier} size={20} />}
                        </Group>
                      </UnstyledButton>
                      {onRemove && !isCurrent ? (
                        <ActionIcon
                          className="queue-row-remove"
                          variant="subtle"
                          color="gray"
                          radius="xl"
                          size={26}
                          onClick={() => onRemove(entry.video.videoId)}
                          aria-label="Remove from queue"
                          title="Remove from queue"
                        >
                          <X size={14} />
                        </ActionIcon>
                      ) : (
                        <Box w={26} style={{ flexShrink: 0 }} />
                      )}
                    </Group>
                  );
                })}
                {moreCount > 0 ? (
                  <Text fz="xs" c="dimmed" ta="center" py={8}>
                    + {moreCount} more
                  </Text>
                ) : (
                  queueIndex === queue.length - 1 && (
                    <Text fz="xs" c="dimmed" ta="center" py={8}>
                      End of the queue
                    </Text>
                  )
                )}
              </Stack>
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
}
