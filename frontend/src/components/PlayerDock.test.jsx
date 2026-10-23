import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import PlayerDock from './PlayerDock';
import { POLL_MS } from './usePlayerTime';
import { holdPlayer, releasePlayer } from '../store/focusSlice';
import { makeStore, renderWithApp } from '../test/render';

const h = vi.hoisted(() => ({ player: null, renders: { queue: 0, chip: 0 } }));
// A stand-in YouTube player: ready (and playing) as soon as it mounts.
vi.mock('./EmbeddedPlayer', async () => {
  const { useEffect } = await import('react');
  return {
    default: function FakeEmbed({ onPlayerReady, onPlayingChange }) {
      useEffect(() => {
        onPlayerReady(h.player);
        onPlayingChange(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount, like a real player's ready event
      }, []);
      return <div data-testid="embed" />;
    },
  };
});
// Render counters: the progress poll must not re-render the queue or the
// dock's controls.
vi.mock('./QueuePanel', () => ({
  default: () => {
    h.renders.queue++;
    return null;
  },
}));
vi.mock('./TierBits', () => ({
  TierChip: () => {
    h.renders.chip++;
    return null;
  },
  RemoveChip: () => null,
}));

const noop = () => {};
const video = { videoId: 'vvvvvvvvvvv', title: 'Song - Band', channelTitle: 'Band', thumbnail: '' };

const entry = { key: 'k1', tier: 'A', video, source: 'context' };

function dock(props = {}) {
  const store = makeStore();
  const view = renderWithApp(
    <>
      {/* A duel page (Suggested moves, the hub) - the dock's keys work there too. */}
      <div className="duel-view" />
      <PlayerDock
        mode="mini" video={video} currentTier="A" availableTiers={[]} hasPrev={false} hasNext={false}
        onStop={noop} onMinimize={noop} onExpand={noop} onFloat={noop} onPrev={noop} onNext={noop} onChangeTier={noop}
        queue={{ history: [], current: null, upcoming: [], contextLabel: '' }}
        onJump={noop} onRemove={noop} onMoveInQueue={noop} onShuffleUpcoming={noop}
        {...props}
      />
    </>,
    { store }
  );
  return { store, root: view.container.querySelector('.player-dock') };
}

beforeEach(() => {
  h.renders.queue = 0;
  h.renders.chip = 0;
  h.player = {
    pauseVideo: vi.fn(), playVideo: vi.fn(), mute: vi.fn(), unMute: vi.fn(), setVolume: vi.fn(), seekTo: vi.fn(),
    isMuted: () => false, getVolume: () => 100, getCurrentTime: () => 0, getDuration: () => 100,
  };
});

describe('PlayerDock keys', () => {
  it('Space plays / pauses on a duel page too (only a matchup takes the keys)', () => {
    dock();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(h.player.pauseVideo).toHaveBeenCalledTimes(1);
  });

  it('leaves a key the page already took (defaultPrevented) to the page', () => {
    dock();
    const claimM = (e) => e.key === 'm' && e.preventDefault();
    document.addEventListener('keydown', claimM);
    fireEvent.keyDown(document, { key: 'm', code: 'KeyM' });
    document.removeEventListener('keydown', claimM);
    expect(h.player.mute).not.toHaveBeenCalled();
    expect(h.player.unMute).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'm', code: 'KeyM' });
    expect(h.player.mute).toHaveBeenCalled();
  });
});

describe('PlayerDock held by a matchup', () => {
  it('hides (still mounted) and pauses, takes no keys, and resumes on release', () => {
    const { store, root } = dock();
    act(() => store.dispatch(holdPlayer()));
    expect(root).toHaveStyle({ display: 'none' });
    expect(root.querySelector('[data-testid="embed"]')).toBeInTheDocument();
    expect(h.player.pauseVideo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(h.player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(h.player.playVideo).not.toHaveBeenCalled();
    act(() => store.dispatch(releasePlayer()));
    expect(root).not.toHaveStyle({ display: 'none' });
    expect(h.player.playVideo).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerDock progress poll (no per-second re-renders)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  let t = 0;
  const playing = () => {
    h.player.getCurrentTime = () => (t += 1);
  };

  it('expanded: polls nothing and never re-renders the queue', () => {
    playing();
    dock({ mode: 'expanded', queue: { history: [], current: entry, upcoming: [], contextLabel: 'Rap' } });
    const before = h.renders.queue;
    expect(before).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(POLL_MS * 6));
    expect(h.renders.queue).toBe(before);
  });

  it('mini: the line moves, but the dock\'s controls are not re-rendered', () => {
    playing();
    const { root } = dock({ availableTiers: ['S', 'A'] });
    const before = h.renders.chip;
    expect(before).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(POLL_MS));
    const line = root.querySelector('.player-dock-progress');
    const first = line.style.width;
    act(() => vi.advanceTimersByTime(POLL_MS * 4));
    expect(line.style.width).not.toBe(first);
    expect(h.renders.chip).toBe(before);
  });

  it('a seek key moves the line at once', () => {
    h.player.getCurrentTime = () => 0;
    const { root } = dock();
    fireEvent.keyDown(window, { key: '5', code: 'Digit5' });
    expect(h.player.seekTo).toHaveBeenCalledWith(50, true);
    expect(root.querySelector('.player-dock-progress').style.width).toBe('50%');
  });
});
