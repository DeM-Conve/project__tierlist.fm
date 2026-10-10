import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import QueuePanel, { QUEUE_ROW_SIZE } from './QueuePanel';
import { renderWithApp } from '../test/render';

const entry = (key, source = 'context') => ({ key, source, tier: 'S', video: { videoId: key, title: `Song ${key}`, channelTitle: 'Band' } });
const history = Array.from({ length: 50 }, (_, i) => entry(`h${i}`));
const upcoming = Array.from({ length: 600 }, (_, i) => entry(`u${i}`, i < 2 ? 'user' : 'context'));
const current = entry('now');

// jsdom has no layout: the ScrollArea's viewport (the scroll container)
// reports 500px tall, and scrollTo just moves scrollTop.
let heightSpy;
beforeEach(() => {
  heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.hasAttribute('data-scrollarea-viewport') ? 500 : 0;
  });
  Element.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
    this.dispatchEvent(new Event('scroll'));
  };
});
afterEach(() => {
  heightSpy.mockRestore();
  delete Element.prototype.scrollTo;
});

function renderQueue(props = {}) {
  const handlers = { onJump: vi.fn(), onRemove: vi.fn(), onMove: vi.fn(), onShuffle: vi.fn() };
  renderWithApp(<QueuePanel queue={{ history, upcoming, contextLabel: 'Rock' }} current={current} {...handlers} {...props} />);
  return handlers;
}
const playButtons = () => screen.queryAllByRole('button', { name: /^Play Song / });

describe('QueuePanel - a long queue is virtualized', () => {
  it('renders a window around the playing song, not all 650 rows', async () => {
    renderQueue();
    await act(async () => {});
    expect(playButtons().length).toBeGreaterThan(3);
    expect(playButtons().length).toBeLessThan(40);
    expect(screen.getByRole('button', { name: 'Playing now' })).toBeInTheDocument();
    // Pinned near the top: the next song is on screen, the first played one isn't.
    expect(screen.getByRole('button', { name: 'Play Song u0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play Song h0' })).toBeNull();
    // Every song is in the list (no "+N more"): Up next counts them all.
    expect(screen.getByText('Up next · 600')).toBeInTheDocument();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('scrolling far down renders the end of Up next', async () => {
    renderQueue();
    const viewport = document.querySelector('[data-scrollarea-viewport]');
    await act(async () => viewport.scrollTo({ top: (50 + 600) * QUEUE_ROW_SIZE }));
    expect(screen.getByRole('button', { name: 'Play Song u599' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play Song u0' })).toBeNull();
  });

  it('a cover click plays that song, double-click on a row too, × removes it', async () => {
    const { onJump, onRemove } = renderQueue();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Play Song u1' }));
    expect(onJump).toHaveBeenLastCalledWith('upcoming', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Play Song h49' }));
    expect(onJump).toHaveBeenLastCalledWith('history', 49);
    fireEvent.doubleClick(screen.getByText('Song u2'));
    expect(onJump).toHaveBeenLastCalledWith('upcoming', 2);

    const row = screen.getByText('Song u3').closest('.queue-row');
    fireEvent.click(row.querySelector('[aria-label="Remove from queue"]'));
    expect(onRemove).toHaveBeenCalledWith('u3');
  });
});
