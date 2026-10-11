import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ShortcutsList } from './ShortcutsModal';
import { SHORTCUTS } from '../shortcuts';
import { renderWithApp } from '../test/render';

describe('ShortcutsList', () => {
  it('lists every shortcut once, under one heading per section', () => {
    renderWithApp(<ShortcutsList />);
    for (const s of SHORTCUTS) expect(screen.getByText(s.description)).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([...new Set(SHORTCUTS.map((s) => s.category))]);
  });

  it('shows the board header keys and no Triage entry', () => {
    renderWithApp(<ShortcutsList />);
    const row = (text) => screen.getByText(text).closest('tr');
    expect(within(row('Shuffle play the whole board')).getByText('s')).toBeInTheDocument();
    expect(within(row('Play the whole board from the top tier')).getByText('p')).toBeInTheDocument();
    expect(within(row(/^Duel on this board \(like/)).getByText('d')).toBeInTheDocument();
    expect(screen.queryByText(/triage/i)).toBeNull();
  });

  it('reads a combo as one key cap per key joined by +', () => {
    renderWithApp(<ShortcutsList />);
    const row = screen.getByText(/Show the Tier lists view/).closest('tr');
    expect(within(row).getAllByText('+')).toHaveLength(2);
    for (const k of ['Ctrl', 'Shift', 'E']) expect(within(row).getByText(k)).toBeInTheDocument();
  });
});
