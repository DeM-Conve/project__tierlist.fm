import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SettingsView from './SettingsView';
import { renderWithApp } from '../test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function draw(path = '/settings') {
  renderWithApp(
    <MemoryRouter initialEntries={[path]}>
      <SettingsView />
      <Where />
    </MemoryRouter>
  );
}

function phoneWidth(phone) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: phone && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

afterEach(() => vi.restoreAllMocks());

describe('Settings', () => {
  it('opens the tab named in the URL, and the tab you pick goes in the URL', () => {
    draw('/settings?tab=naming');
    expect(screen.getByRole('tab', { name: 'Playlist naming' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Keyboard shortcuts' }));
    expect(screen.getByTestId('search').textContent).toBe('?tab=keyboard');
  });

  it('an unknown tab falls back to Appearance', () => {
    draw('/settings?tab=nope');
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
  });

  it('side nav on a desktop', () => {
    phoneWidth(false);
    draw();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('tabs go across the top on a phone', () => {
    phoneWidth(true);
    draw();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
  });
});
