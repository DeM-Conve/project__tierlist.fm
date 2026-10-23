import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import AppearanceSettings from './AppearanceSettings';
import { makeStore, renderWithApp } from '../test/render';
import { setAccent, setTheme } from '../store/appearanceSlice';
import { ACCENTS } from '../themes';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const fillOf = (accentKey, scheme = 'dark') => {
  const a = ACCENTS[accentKey];
  return a.scale[scheme === 'dark' ? a.onDark : a.onLight];
};
const card = (label) => screen.getByText(label).closest('[role="radio"]');
const cardFill = (label) => card(label).querySelector('[data-accent-fill]').dataset.accentFill;

describe('Settings → Appearance', () => {
  it('picking a theme applies it and its signature accent; a tier palette applies at once', () => {
    const store = makeStore();
    renderWithApp(<AppearanceSettings />, { store });
    fireEvent.click(card('Dracula'));
    expect(store.getState().appearance).toMatchObject({ theme: 'dracula', accent: 'violet' });
    fireEvent.click(card('Heat'));
    expect(store.getState().appearance.tierPalette).toBe('heat');
  });

  it('a theme with a signature accent previews with that accent; one without, with yours', () => {
    const store = makeStore();
    store.dispatch(setTheme('paper'));
    store.dispatch(setAccent('teal'));
    renderWithApp(<AppearanceSettings />, { store });
    expect(cardFill('Dracula')).toBe(fillOf('violet'));
    expect(cardFill('Warm charcoal')).toBe(fillOf('amber'));
    expect(cardFill('Sand')).toBe(fillOf('teal', 'light'));
  });
});
