import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { renderWithApp } from '../test/render';

const props = (over) => ({
  query: '',
  onQueryChange: vi.fn(),
  tierCategories: ['Rap', 'Rock'],
  tierGroups: {},
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
  onToggleCollapsed: vi.fn(),
  ...over,
});

const draw = (p, path = '/') => renderWithApp(<MemoryRouter initialEntries={[path]}><Sidebar {...p} /></MemoryRouter>);

describe('Sidebar', () => {
  it('panel open: the activity bar plus the board list; Tier lists closes it', () => {
    const p = props();
    draw(p);
    expect(screen.getByText('Rap')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Tier lists' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(p.onToggleCollapsed).toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(p.onLogout).toHaveBeenCalled();
  });

  it('marks the page you are on and the open panel', () => {
    draw(props(), '/add');
    expect(screen.getByRole('link', { name: 'Add songs' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('data-active');
    expect(screen.getByRole('button', { name: 'Tier lists' })).toHaveAttribute('data-active', 'true');
  });

  it('filters the boards', () => {
    draw(props({ query: 'ro' }));
    expect(screen.queryByText('Rap')).not.toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
  });
});
