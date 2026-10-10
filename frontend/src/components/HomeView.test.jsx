import { describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import HomeView from './HomeView';
import { renderWithApp } from '../test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const TIERS = ['S', 'A', 'B', 'C', 'D'];
const playlists = TIERS.map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 3, parsed: { category: 'Rock', tier: t } }));
const noop = () => {};

function renderHome(loaded) {
  renderWithApp(
    <HomeView
      playlists={loaded ? playlists : null}
      loadError={null}
      hiddenCount={0}
      tierGroups={loaded ? { Rock: Object.fromEntries(playlists.map((p) => [p.parsed.tier, p])) } : {}}
      tierCategories={loaded ? ['Rock'] : []}
      query=""
      onQueryChange={noop}
      onAddSongs={noop}
      onOpenBoard={noop}
      onDuel={noop}
      onOpenPlaylist={noop}
      onOpenNaming={noop}
    />
  );
}

// A board card's layout: how many tier lines, and the button row at the bottom (its last child) with two buttons.
const cardShape = (card) => ({
  tierLines: card.querySelectorAll('.mantine-Stack-root > .mantine-Group-root').length,
  buttons: card.lastElementChild.children.length,
});

describe('HomeView - loading placeholders mirror the loaded page', () => {
  it('board cards: same headings, and skeleton cards shaped like a board card (header, a line per tier, buttons)', () => {
    renderHome(true);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    const card = screen.getByRole('button', { name: 'Open Rock' }).closest('.board-card');
    const loadedShape = cardShape(card);
    cleanup();

    renderHome(false);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(headings);
    const skeletons = screen.getAllByTestId('board-card-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(cardShape(skeletons[0])).toEqual(loadedShape);
  });

  it('playlist cards: skeletons use the same Card with a 100px art section', () => {
    renderHome(true);
    const realSection = document.querySelector('.playlist-card .mantine-Card-section');
    expect(realSection).not.toBeNull();
    cleanup();

    renderHome(false);
    const skeletons = screen.getAllByTestId('playlist-card-skeleton');
    expect(skeletons).toHaveLength(6);
    skeletons.forEach((s) => {
      expect(s).toHaveClass('mantine-Card-root');
      expect(s.querySelector('.mantine-Card-section .mantine-Skeleton-root')).not.toBeNull();
    });
  });
});
