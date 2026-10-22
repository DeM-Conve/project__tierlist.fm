import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TodoListModal from './TodoListModal';
import { makeStore, renderWithApp } from '../test/render';
import { selectTierGroups } from '../store/selectors';

const NAMING = {
  template: '{category} {tier}',
  tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: '(**TODO**)' },
  tierDisplayNames: { S: null, A: null, B: null, C: null, D: null, TODO: 'Inbox' },
};
const playlists = [
  { id: 'rock-s', title: 'Rock S', itemCount: 3 },
  { id: 'pop-s', title: 'Pop S', itemCount: 3 },
  // Pop's to-do list (in use), and one named for a board that doesn't exist.
  { id: 'pop-todo', title: 'Pop (**TODO**)', itemCount: 5 },
  { id: 'jazz-todo', title: 'Jazz (**TODO**)', itemCount: 2 },
  // Not a to-do list by name: never offered.
  { id: 'misc', title: 'Misc', itemCount: 9 },
];

function renderModal(handlers = {}) {
  const store = makeStore({ playlists, naming: NAMING });
  const onClose = vi.fn();
  const onCreateNew = vi.fn();
  renderWithApp(
    <MemoryRouter>
      <TodoListModal category="Rock" onClose={onClose} onCreateNew={onCreateNew} {...handlers} />
    </MemoryRouter>,
    { store }
  );
  return { store, onClose, onCreateNew };
}

describe('TodoListModal - "Add a to-do list" on a board', () => {
  it('says what a to-do list is called, with the to-do tier\'s shown name in the title', () => {
    renderModal();
    expect(screen.getByText('Inbox list for Rock')).toBeInTheDocument();
    expect(screen.getByText('Rock (**TODO**)')).toBeInTheDocument();
  });

  it('offers only free to-do lists (not another board\'s), and linking one makes it this board\'s', () => {
    const { store, onClose } = renderModal();
    const select = screen.getAllByLabelText('Use an existing playlist').find((el) => el.tagName === 'INPUT');
    expect(select).toHaveValue('Jazz (**TODO**)');
    fireEvent.click(screen.getByRole('button', { name: 'Use this playlist' }));
    expect(store.getState().naming.todoLinks).toEqual({ 'jazz-todo': 'Rock' });
    expect(selectTierGroups(store.getState()).Rock.TODO.id).toBe('jazz-todo');
    expect(selectTierGroups(store.getState()).Pop.TODO.id).toBe('pop-todo');
    expect(onClose).toHaveBeenCalled();
  });

  it('"Create a new playlist" hands over to the create flow', () => {
    const { onCreateNew } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Create a new playlist' }));
    expect(onCreateNew).toHaveBeenCalled();
  });
});
