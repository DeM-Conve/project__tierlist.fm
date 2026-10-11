import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { spotlight } from '@mantine/spotlight';
import CommandPalette from './CommandPalette';
import { renderWithApp } from '../test/render';

const items = [{ id: 'page-settings', section: 'Go to', label: 'Settings', action: () => {} }];
const searchBox = () => screen.queryByPlaceholderText('Jump to a board, playlist, or action...');

describe('CommandPalette shortcuts', () => {
  it.each([
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['Ctrl+P (VS Code Quick Open)', { key: 'p', ctrlKey: true }],
    ['Ctrl+Shift+P (VS Code Command Palette)', { key: 'P', ctrlKey: true, shiftKey: true }],
    ['F1', { key: 'F1' }],
  ])('%s opens the palette', async (_, event) => {
    renderWithApp(<CommandPalette items={items} />);
    expect(searchBox()).toBeNull();
    fireEvent.keyDown(document.documentElement, event);
    expect(await screen.findByPlaceholderText('Jump to a board, playlist, or action...')).toBeTruthy();
    act(() => spotlight.close());
  });

  it('shows Settings’ Ctrl+, hint', async () => {
    renderWithApp(<CommandPalette items={items} />);
    act(() => spotlight.open());
    await screen.findByPlaceholderText('Jump to a board, playlist, or action...');
    expect(screen.getByText(',')).toBeTruthy();
    act(() => spotlight.close());
  });
});
