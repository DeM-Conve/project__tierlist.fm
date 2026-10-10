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

const draw = (p) => renderWithApp(<MemoryRouter><Sidebar {...p} /></MemoryRouter>);

describe('Sidebar', () => {
  it('open: lists the boards and has a hide button', () => {
    const p = props();
    draw(p);
    expect(screen.getByText('Rap')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(p.onToggleCollapsed).toHaveBeenCalled();
  });

  it('folded: an icon strip - no board list, every shortcut still one click away', () => {
    const p = props({ collapsed: true });
    draw(p);
    expect(screen.queryByText('Rap')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Add songs' })).toHaveAttribute('href', '/add');
    expect(screen.getByText('2')).toBeInTheDocument(); // songs waiting for a tier
    fireEvent.click(screen.getByRole('button', { name: 'Jump to…' }));
    expect(p.onOpenPalette).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(p.onSelectSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(p.onToggleCollapsed).toHaveBeenCalled();
  });
});
