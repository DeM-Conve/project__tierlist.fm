import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ContextMenuProvider } from 'mantine-contextmenu';
import Sidebar from './Sidebar';
import { makeStore, renderWithApp } from '../test/render';
import { setActivityOrder } from '../store/appearanceSlice';

const props = (over) => ({
  query: '',
  onQueryChange: vi.fn(),
  tierCategories: ['Rap', 'Rock'],
  tierGroups: {
    Rap: { S: { id: 'p1', title: 'Rap S', itemCount: 12 }, A: { id: 'p2', title: 'Rap A', itemCount: 30 } },
    Rock: { S: { id: 'p3', title: 'Rock S', itemCount: 4 }, TODO: { id: 'p4', title: 'Rock TODO', itemCount: 3 } },
  },
  playlistCount: 10,
  waitingCount: 2,
  loading: false,
  onSelectSettings: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onLogout: vi.fn(),
  onOpenPalette: vi.fn(),
  mobileOpen: false,
  onCloseMobile: vi.fn(),
  collapsed: false,
  view: 'boards',
  onShowView: vi.fn(),
  withPanel: true,
  ...over,
});

// Where the router is now, to check where a click went.
function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}
const where = () => screen.getByTestId('where').textContent;

const draw = (p, path = '/') =>
  renderWithApp(
    <MemoryRouter initialEntries={[path]}>
      <ContextMenuProvider>
        <Sidebar {...p} />
        <Where />
      </ContextMenuProvider>
    </MemoryRouter>
  );

describe('Sidebar', () => {
  it('panel open: the activity bar plus the board list; Tier lists closes it', () => {
    const p = props();
    draw(p);
    expect(screen.getByText('Rap')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Tier lists' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(p.onShowView).toHaveBeenCalledWith('boards');
  });

  it('panel closed: only the activity bar - every shortcut still one click away', () => {
    const p = props({ collapsed: true });
    draw(p);
    expect(screen.queryByText('Rap')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tier lists' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Add songs' })).toHaveAttribute('href', '/add');
    expect(screen.getByText('2')).toBeInTheDocument(); // songs waiting for a tier
    fireEvent.click(screen.getByRole('button', { name: 'Jump to…' }));
    expect(p.onOpenPalette).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(p.onSelectSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(p.onOpenShortcuts).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(p.onShowView).toHaveBeenCalledWith('playlists');
    fireEvent.click(screen.getByRole('button', { name: 'Duels' }));
    expect(p.onShowView).toHaveBeenCalledWith('duels');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(p.onLogout).toHaveBeenCalled();
  });

  it('highlights only the open view, never a second icon for the page you are on', () => {
    const { container } = draw(props(), '/add');
    expect(screen.getByRole('button', { name: 'Tier lists' })).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('[data-active]')).toHaveLength(1);
  });

  it('the Playlists view lists every tier playlist, each opening its tier page', () => {
    draw(props({ view: 'playlists', query: 'rap' }), '/tier/Rap/t/A');
    expect(screen.getByRole('button', { name: 'Playlists' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tier lists' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /Rap S/ })).toHaveAttribute('href', '/tier/Rap/t/S');
    expect(screen.getByRole('link', { name: /Rap A/ })).toHaveAttribute('data-active', 'true');
    expect(screen.queryByText('Rock S')).not.toBeInTheDocument();
    // Grouped under its board, like a file tree.
    expect(screen.getByText('Rap', { selector: 'p' })).toBeInTheDocument();
  });

  it('activity bar order: Home, Jump to, Tier lists, Playlists, Add songs, Duels, then shortcuts, settings, log out', () => {
    draw(props());
    const bar = screen.getByRole('navigation', { name: 'Activity bar' });
    const names = Array.from(bar.querySelectorAll('a, button')).map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['Home', 'Jump to…', 'Tier lists', 'Playlists', 'Add songs', 'Duels', 'Keyboard shortcuts', 'Settings', 'Log out']);
  });

  it("the top icons follow the account's saved order; the bottom group stays fixed", () => {
    const store = makeStore();
    store.dispatch(setActivityOrder(['addSongs', 'duels', 'playlists', 'home', 'boards', 'jump']));
    renderWithApp(<MemoryRouter><Sidebar {...props()} /></MemoryRouter>, { store });
    const bar = screen.getByRole('navigation', { name: 'Activity bar' });
    const names = Array.from(bar.querySelectorAll('a, button')).map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['Add songs', 'Duels', 'Playlists', 'Home', 'Tier lists', 'Jump to…', 'Keyboard shortcuts', 'Settings', 'Log out']);
  });

  it('filters the boards', () => {
    draw(props({ query: 'ro' }));
    expect(screen.queryByText('Rap')).not.toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
  });

  // ---- duels, from the side panel ------------------------------------------

  it('each board row has an inline Duel action straight to its duel hub', () => {
    draw(props());
    const duel = screen.getByRole('link', { name: 'Duel Rap' });
    expect(duel).toHaveAttribute('href', '/tier/Rap/duel');
    // A sibling of the row's own link, never nested inside it.
    expect(screen.getByRole('link', { name: /^Rap/ }).contains(duel)).toBe(false);
    fireEvent.click(duel);
    expect(where()).toBe('/tier/Rap/duel');
  });

  it('right-clicking a board row: Open board, Duel and its tiers', async () => {
    draw(props());
    fireEvent.contextMenu(screen.getByRole('link', { name: /^Rock/ }));
    expect(await screen.findByText('Open board')).toBeInTheDocument();
    expect(screen.getByText('Open tier')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Duel'));
    expect(where()).toBe('/tier/Rock/duel');
  });

  it('right-click Open board opens the board', async () => {
    draw(props());
    fireEvent.contextMenu(screen.getByRole('link', { name: /^Rap/ }));
    fireEvent.click(await screen.findByText('Open board'));
    expect(where()).toBe('/tier/Rap');
  });

  it('the Duels view lists every board, each row one click from its duel hub', () => {
    draw(props({ view: 'duels' }), '/tier/Rock/duel/moves');
    expect(screen.getByRole('button', { name: 'Duels' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Duels', { selector: 'p' })).toBeInTheDocument();
    const rap = screen.getByRole('link', { name: /^Rap/ });
    expect(rap).toHaveAttribute('href', '/tier/Rap/duel');
    // Quiet meta from the playlists already loaded: to-do songs waiting, else the ranked total.
    expect(rap).toHaveTextContent('42');
    const rock = screen.getByRole('link', { name: /^Rock/ });
    expect(rock).toHaveTextContent('3 to do');
    expect(rock).toHaveAttribute('data-active', 'true');
    expect(rap).not.toHaveAttribute('data-active');
    fireEvent.click(rap);
    expect(where()).toBe('/tier/Rap/duel');
  });

  it('the Duels view filters, and its rows have the board menu too', async () => {
    draw(props({ view: 'duels', query: 'ra' }));
    expect(screen.queryByText('Rock')).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole('link', { name: /^Rap/ }));
    fireEvent.click(await screen.findByText('Open board'));
    expect(where()).toBe('/tier/Rap');
  });
});
