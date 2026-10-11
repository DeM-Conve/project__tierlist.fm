import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { SongPickerButton, SongPickerModal } from './SongPicker';
import { makeStore, renderWithApp } from '../../test/render';

const s = (id, tier, title) => ({ id, tier, video: { videoId: id, title, channelTitle: `Chan ${id}`, thumbnail: '' } });
const SONGS = [
  s('s1', 'S', 'Top Song'),
  s('a1', 'A', 'Middle Song'),
  s('a2', 'A', 'Other Song'),
  // A big board: the list is virtualized, not 600 rows in the DOM.
  ...Array.from({ length: 600 }, (_, i) => s(`b${i}`, 'B', `Filler ${i}`)),
];
const NAMING = { tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5', TODO: 'Later' } };

// jsdom has no layout: the list's scroll viewport reports 360px tall.
let heightSpy;
beforeEach(() => {
  heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.hasAttribute('data-scrollarea-viewport') ? 360 : 0;
  });
  Element.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
  };
});
afterEach(() => {
  heightSpy.mockRestore();
  delete Element.prototype.scrollTo;
});

async function renderModal(props = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  renderWithApp(<SongPickerModal opened songs={SONGS} onPick={onPick} onClose={onClose} category="Rock" {...props} />,
    { store: makeStore({ naming: NAMING }) });
  await act(async () => {});
  return { onPick, onClose };
}
const options = () => screen.queryAllByRole('option');
const search = () => screen.getByPlaceholderText('Search Rock…');

describe('SongPickerModal', () => {
  it('lists the board virtualized, best tier first, with the tier names', async () => {
    await renderModal();
    expect(options()[0]).toHaveTextContent('Top Song');
    expect(options()[0]).toHaveTextContent('T1');
    expect(options().length).toBeGreaterThan(3);
    expect(options().length).toBeLessThan(40);
    expect(screen.getByText('603 songs')).toBeInTheDocument();
  });

  it('filters by title or channel as you type', async () => {
    await renderModal();
    fireEvent.change(search(), { target: { value: 'song other' } });
    await act(async () => {});
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Other Song')]);
    fireEvent.change(search(), { target: { value: 'chan a1' } });
    await act(async () => {});
    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveTextContent('Middle Song');
    fireEvent.change(search(), { target: { value: 'nothing like this' } });
    expect(screen.getByText('No song by that name')).toBeInTheDocument();
  });

  it('a tier chip narrows to that tier; clicking it again shows every tier', async () => {
    await renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Only T2' }));
    await act(async () => {});
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Middle Song'), expect.stringContaining('Other Song')]);
    fireEvent.click(screen.getByRole('button', { name: 'Every tier' }));
    await act(async () => {});
    expect(screen.getByText('603 songs')).toBeInTheDocument();
  });

  it('clicking a song picks it and closes', async () => {
    const { onPick, onClose } = await renderModal();
    fireEvent.click(screen.getByRole('option', { name: /Middle Song/ }));
    expect(onPick).toHaveBeenCalledWith('a1');
    expect(onClose).toHaveBeenCalled();
  });

  it('arrow keys move the highlight and Enter picks', async () => {
    const { onPick } = await renderModal();
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: /Middle Song/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('a1');
  });
});

describe('SongPickerButton', () => {
  function renderButton(props = {}) {
    const onChange = vi.fn();
    const utils = renderWithApp(<SongPickerButton songs={SONGS} category="Rock" onChange={onChange} {...props} />,
      { store: makeStore({ naming: NAMING }) });
    return { onChange, ...utils };
  }

  it('says "Choose a song…" and opens the picker', async () => {
    const { onChange } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a song' }));
    fireEvent.click(await screen.findByRole('option', { name: /Top Song/ }));
    expect(onChange).toHaveBeenCalledWith('s1');
  });

  it('shows the picked song with its tier and a change action', () => {
    renderButton({ value: 'a2' });
    const button = screen.getByRole('button', { name: /Change the pinned song \(Other Song\)/ });
    expect(button).toHaveTextContent('Other Song');
    expect(button).toHaveTextContent('T2');
    expect(button).toHaveTextContent('Change');
  });

  it('opens by itself when its card is chosen with no song yet', async () => {
    function Card() {
      const [active, setActive] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setActive(true)}>One song</button>
          <SongPickerButton songs={SONGS} category="Rock" onChange={vi.fn()} active={active} />
        </>
      );
    }
    renderWithApp(<Card />, { store: makeStore({ naming: NAMING }) });
    expect(screen.queryByPlaceholderText('Search Rock…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('One song'));
    expect(await screen.findByPlaceholderText('Search Rock…')).toBeInTheDocument();
  });

  it('does nothing while disabled', async () => {
    renderButton({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a song' }));
    await act(async () => {});
    expect(screen.queryByPlaceholderText('Search Rock…')).not.toBeInTheDocument();
  });
});
