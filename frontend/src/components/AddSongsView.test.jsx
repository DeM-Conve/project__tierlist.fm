import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddSongsView from './AddSongsView';
import { makeStore, renderWithApp } from '../test/render';

// Add songs' card: the keys and the layout of the tier targets.
const SONG = { videoId: 'addsong0001', title: 'Artist - Song', channelTitle: 'Artist', thumbnail: null };
const PLAYLISTS = ['S', 'A', 'B', 'C', 'D', 'TODO'].map((t) => ({ id: `rap-${t}`, title: `Rap ${t}`, itemCount: 1 }));

function draw() {
  const actions = { file: vi.fn(), skip: vi.fn(), remove: vi.fn(), undo: vi.fn(), listen: vi.fn() };
  const addSongs = {
    list: [SONG],
    current: SONG,
    placed: new Map(),
    guessBoard: () => ({ category: 'Rap', reason: null }),
    nextAfter: () => null,
    history: [],
  };
  renderWithApp(
    <MemoryRouter>
      <AddSongsView addSongs={addSongs} actions={actions} onAddLinks={() => true} />
    </MemoryRouter>,
    { store: makeStore({ playlists: PLAYLISTS }) }
  );
  return actions;
}

describe('AddSongsView', () => {
  it('Shift+1 puts the song in the first tier, s skips it', () => {
    const actions = draw();
    fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });
    expect(actions.file).toHaveBeenCalledWith(SONG, 'Rap', 'S');
    fireEvent.keyDown(window, { key: 's', code: 'KeyS' });
    expect(actions.skip).toHaveBeenCalledWith(SONG);
  });

  it('a modal or menu over the page keeps its keys - "s" there never skips the song behind it', () => {
    const actions = draw();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    button.focus();
    fireEvent.keyDown(window, { key: 's', code: 'KeyS' });
    fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    expect(actions.skip).not.toHaveBeenCalled();
    expect(actions.file).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
    dialog.remove();
  });

  it('the tier targets shrink with the card (no sideways scroll on a phone)', () => {
    draw();
    const targets = screen.getByTestId('tier-targets').children;
    expect(targets).toHaveLength(6);
    for (const t of targets) expect(t.style.minWidth).toBe('0px');
  });
});
