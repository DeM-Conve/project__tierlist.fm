import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { tierName } from '../tierLabels';
import { ActionIcon, Badge, Group, HoverCard, Slider, Stack, Text } from '@mantine/core';
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
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { REMOVED_TIER, TIER_COLORS, TODO_TIER } from '../tiers';
import { RemoveChip, TierChip } from './TierBits';
import QueuePanel from './QueuePanel';
import EmbeddedPlayer from './EmbeddedPlayer';
import { usePlayerTime } from './usePlayerTime';
import { isSequenceKey } from '../keyboard/sequence';
import { useDevicePref } from '../settings';

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

// YouTube-style volume: the speaker icon mutes on click; hovering it pops
// a vertical slider above it (the wheel over the icon nudges it too).
function VolumeControl({ volume, muted, onToggleMute, onChange, size }) {
  const off = muted || volume === 0;
  return (
    <HoverCard position="top" withArrow openDelay={60} closeDelay={220} shadow="md" radius="xl" zIndex={400}>
      <HoverCard.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          radius="xl"
          size={size}
          onClick={onToggleMute}
          onWheel={(e) => onChange(Math.min(100, Math.max(0, volume + (e.deltaY < 0 ? 5 : -5))))}
          aria-label={off ? 'Unmute' : 'Mute'}
          title="Mute (m)"
        >
          {off ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </ActionIcon>
      </HoverCard.Target>
      <HoverCard.Dropdown px="3xs" py="xs">
        <Stack align="center" gap="2xs">
          <Text fz="xs" fw={700} c="dimmed" w={24} ta="center">
            {volume}
          </Text>
          <Slider
            orientation="vertical"
            h={110}
            size="sm"
            value={volume}
            onChange={onChange}
            min={0}
            max={100}
            step={1}
            color="accent"
            label={null}
            aria-label="Volume"
          />
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

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
  queue,
  onJump,
  onRemove,
  onMoveInQueue,
  onShuffleUpcoming,
  repeatMode = 'off',
  onCycleRepeat,
}) {
  const cardRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // A duel matchup holds the dock (focusSlice.holdPlayer): its clips are the
  // audio there, so the dock is hidden (CSS only - the player stays mounted)
  // and paused, and picks up again on release if it was playing.
  const held = useSelector((s) => s.focus.playerHeld);
  const resumeOnRelease = useRef(false);
  useEffect(() => {
    const player = playerRef.current;
    if (held) {
      resumeOnRelease.current = isPlayingRef.current;
      player?.pauseVideo?.();
    } else if (resumeOnRelease.current) {
      resumeOnRelease.current = false;
      player?.playVideo?.();
    }
  }, [held]);
  // Playback position, polled (see below) for the edge progress line.
  // The volume and mute survive a reload (per device, settings.js
  // DEVICE_UI): saved on every change, applied to each new player instance.
  const [savedVolume, setSavedVolume] = useDevicePref('playerVolume');
  const [isMuted, setIsMuted] = useState(savedVolume.muted);
  const [volume, setVolume] = useState(savedVolume.muted ? 0 : savedVolume.volume);
  // Remembers the level to restore when unmuting via the button/shortcut,
  // the way a hardware volume knob would - dragging the slider itself to 0
  // is just another way of reaching muted, not a separate state.
  const lastVolumeRef = useRef(savedVolume.volume || 100);
  const savedVolumeRef = useRef(savedVolume);
  savedVolumeRef.current = savedVolume;
  // Repeat lives in focusSlice (off -> all -> one, YouTube Music's cycle):
  // repeat-all has to wrap the queue itself, which is App's state.
  const repeatOne = repeatMode === 'one';
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


  // The mini bar's progress line, polled from the player.
  const [time, setTime] = usePlayerTime(playerRef, video.videoId);

  // Vim-style navigation for the dock, active globally (not just while
  // expanded) since the dock is meant to work like a background player:
  // h/l (and the arrow keys) skip prev/next track. j/k drive the mode
  // through PLAYER_MODE_TRANSITIONS - see the comment on that table for why
  // it's a state machine rather than a simple cycle. Skipped entirely while
  // the user is typing (filter box, command palette, ...) so it never
  // hijacks normal input. A page's own shortcut wins: a page key handler
  // (react-hotkeys-hook, on document - it runs first) that took the key
  // marks it defaultPrevented, e.g. Suggested moves' m = move, l = lock.
  // While a matchup holds the dock, it takes no keys at all.
  useEffect(() => {
    function onKeyDown(e) {
      if (held || e.defaultPrevented) return;
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
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Delete' && availableTiers.length > 0) {
        // Same as the Remove chip: stage the playing song's removal from its
        // playlist (only while its board is loaded, like Shift+digit).
        e.preventDefault();
        if (currentTier !== REMOVED_TIER) onChangeTier(REMOVED_TIER);
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (expanded && e.key === 'f') {
        // YouTube's own "f" - only while expanded (elsewhere `f` is link
        // hints). Fullscreens the embed's iframe itself, so YouTube's
        // controls come with it; the dock's DOM doesn't move.
        e.preventDefault();
        toggleFullscreen();
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
    currentTier,
    onChangeTier,
    // togglePlay/toggleMute close over isPlaying/isMuted state directly
    // (rather than reading it fresh off the player), so this effect must
    // re-subscribe whenever either changes or Space/m would act on a
    // stale play/mute state.
    isPlaying,
    isMuted,
    held,
  ]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo?.();
    else player.playVideo?.();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    playerRef.current?.getIframe?.()?.requestFullscreen?.();
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
      setSavedVolume({ volume: restored, muted: false });
    } else {
      lastVolumeRef.current = volume || 100;
      player.mute?.();
      setVolume(0);
      setIsMuted(true);
      setSavedVolume({ volume: lastVolumeRef.current, muted: true });
    }
  }

  function handleVolumeChange(next) {
    const player = playerRef.current;
    setVolume(next);
    if (next === 0) {
      player?.mute?.();
      setIsMuted(true);
      setSavedVolume({ volume: lastVolumeRef.current || 100, muted: true });
    } else {
      lastVolumeRef.current = next;
      player?.unMute?.();
      player?.setVolume?.(next);
      setIsMuted(false);
      setSavedVolume({ volume: next, muted: false });
    }
  }

  // Click anywhere on the edge progress line to jump there.
  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    seekToPercent(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * 100);
  }

  // The expanded view's ⟲ ⟳ buttons (and ←/→) scrub within the current
  // video - track skipping is h/l or the prev/next buttons.
  function seekBy(deltaSeconds) {
    const player = playerRef.current;
    const duration = player?.getDuration?.();
    if (!duration) return;
    const next = Math.min(duration, Math.max(0, player.getCurrentTime() + deltaSeconds));
    player.seekTo(next, true);
    setTime({ cur: next, dur: duration });
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
    setTime({ cur: (pct / 100) * duration, dur: duration });
  }

  const iconSize = expanded ? 20 : 18;
  const btnSize = expanded ? 38 : 30;

  // The expanded view is a fixed overlay, so it leaves the layout - which
  // would hand the mini bar's row back to the page and make the tier board
  // re-fit (visibly jump) behind the modal, then jump back on close. A
  // spacer the mini bar's last measured height holds that row instead.
  const rootRef = useRef(null);
  const miniHeightRef = useRef(57); // 6+6px padding + 44px art + 1px border
  useLayoutEffect(() => {
    if (mode === 'mini' && rootRef.current) miniHeightRef.current = rootRef.current.offsetHeight;
  }, [mode]);

  return (
    <>
    {expanded && !held && <div aria-hidden style={{ height: miniHeightRef.current, flexShrink: 0 }} />}
    <div
      ref={rootRef}
      style={held ? { display: 'none' } : undefined}
      data-held={held || undefined}
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
        // The bar carries a faint wash of the playing song's tier color -
        // the tier list is the product, so the dock wears it too.
        style={!expanded && currentTier ? { background: `color-mix(in srgb, ${TIER_COLORS[currentTier]} 7%, var(--chrome))` } : undefined}
      >
        {!expanded && (
          <div className="player-dock-progress-track" onClick={seek}>
            <div className="player-dock-progress" style={{ width: `${time.dur ? (time.cur / time.dur) * 100 : 0}%` }} />
          </div>
        )}

        {/* Floating/expanded only: the mini bar keeps these in its right
            cluster instead. */}
        {mode !== 'mini' && (
          <Group className="player-dock-toolbar" gap="3xs" wrap="nowrap">
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
        )}

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
                  onEnded={repeatOne ? replayCurrent : hasNext || repeatMode === 'all' ? onNext : undefined}
                  onPlayerReady={(p) => {
                    playerRef.current = p;
                    // A new EmbeddedPlayer instance mounts per video (its own
                    // effect keys off videoId) - give it the saved volume and
                    // mute, then sync the slider to what it reports (the
                    // browser may still have started it muted).
                    if (p) {
                      const { volume: v, muted } = savedVolumeRef.current;
                      p.setVolume?.(v);
                      if (muted) p.mute?.();
                      const isOff = muted || (p.isMuted?.() ?? false);
                      setVolume(isOff ? 0 : v);
                      lastVolumeRef.current = v || lastVolumeRef.current;
                      setIsMuted(isOff);
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
              <Group gap="2xs" wrap="nowrap" align="center" mt={expanded ? '4xs' : 0}>
                <Text className="dock-artist" c="dimmed" fz={expanded ? 'md' : 'sm'} lh={1.3} truncate="end" miw={0}>
                  {video.channelTitle}
                </Text>
                {(isShuffling || isTriage) && expanded && (
                  <Badge variant="light" size="sm" flex="none">
                    {isTriage ? 'Triage' : 'Shuffle'}
                  </Badge>
                )}
              </Group>
            </div>

            <div className="player-dock-center">
            <Group gap={expanded ? '3xs' : '4xs'} wrap="nowrap">
              {!expanded && (
                <ActionIcon
                  className="player-dock-extra"
                  variant="subtle"
                  color={isShuffling ? 'accent' : 'gray'}
                  radius="xl"
                  size={btnSize}
                  onClick={onShuffleUpcoming}
                  disabled={!queue?.upcoming?.length}
                  aria-label="Shuffle up next"
                  title="Shuffle up next"
                >
                  <Shuffle size={16} />
                </ActionIcon>
              )}
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
              <ActionIcon
                className="player-dock-extra"
                variant="subtle"
                color={repeatMode !== 'off' ? 'accent' : 'gray'}
                radius="xl"
                size={btnSize}
                onClick={onCycleRepeat}
                aria-label={`Repeat: ${repeatMode === 'one' ? 'this song' : repeatMode === 'all' ? 'the whole queue' : 'off'}`}
                aria-pressed={repeatMode !== 'off'}
                title={`Repeat: ${repeatMode === 'one' ? 'this song' : repeatMode === 'all' ? 'all' : 'off'}`}
              >
                {repeatOne ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </ActionIcon>
            </Group>
            </div>

            <Group className="player-dock-secondary" gap="5xs" wrap="nowrap">
              {availableTiers.length > 0 && mode === 'mini' && (
                <Group gap="4xs" wrap="nowrap" mr="3xs" visibleFrom="sm">
                  {availableTiers.map((t, i) => (
                    <TierChip
                      key={t}
                      tier={t}
                      size={24}
                      active={t === currentTier}
                      onClick={t === currentTier ? undefined : () => onChangeTier(t)}
                      title={`Rate → ${tierName(t)} (Shift+${i + 1})`}
                    />
                  ))}
                  {currentTier !== REMOVED_TIER && (
                    <RemoveChip size={24} onClick={() => onChangeTier(REMOVED_TIER)} title="Remove from its playlist (Del)" />
                  )}
                </Group>
              )}
              <VolumeControl volume={volume} muted={isMuted} onToggleMute={toggleMute} onChange={handleVolumeChange} size={30} />
              {!expanded && (
                <ActionIcon
                  className="player-dock-extra"
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
              {mode === 'mini' && (
                <>
                  <ActionIcon variant="subtle" color="gray" radius="xl" size={30} onClick={onExpand} aria-label="Expand" title="Expand (k)">
                    <ChevronUp size={18} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" radius="xl" size={30} onClick={onStop} aria-label="Stop" title="Stop playback">
                    <X size={17} />
                  </ActionIcon>
                </>
              )}
            </Group>
          </div>

          {expanded && (
            <Stack gap="xs" mt="lg">
              {isTriage && currentTier === TODO_TIER && availableTiers.length > 0 && (
                <Text fz="xs" c="dimmed">
                  From your TODO list - pick its tier and the next one starts
                </Text>
              )}
              {availableTiers.length > 0 && (
                <Group gap="2xs" wrap="wrap">
                  <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mr="4xs" style={{ letterSpacing: 1 }}>
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
                      title={`Move to ${tierName(t)}`}
                    />
                  ))}
                  {/* Staged like any move: nothing is deleted until you push,
                      and the review's "Put back" (or Ctrl+Z) undoes it. */}
                  <RemoveChip
                    size={34}
                    label={currentTier === REMOVED_TIER ? 'Removed on push' : 'Remove'}
                    kbd={currentTier === REMOVED_TIER ? undefined : 'Del'}
                    onClick={() => onChangeTier(REMOVED_TIER)}
                    disabled={currentTier === REMOVED_TIER}
                    title="Remove from its playlist - staged, deleted on push (Del)"
                  />
                </Group>
              )}
            </Stack>
          )}
        </div>

        {expanded && queue && (
          <aside className="player-queue">
            <QueuePanel
              queue={queue}
              current={{ ...queue.current, tier: currentTier ?? queue.current.tier }}
              onJump={onJump}
              onRemove={onRemove}
              onMove={onMoveInQueue}
              onShuffle={onShuffleUpcoming}
            />
          </aside>
        )}
      </div>
    </div>
    </>
  );
}
