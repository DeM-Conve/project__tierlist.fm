import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import DuelView from './DuelView';
import { renderWithApp } from '../test/render';

// The YouTube embed can't load in jsdom.
vi.mock('./EmbeddedPlayer', () => ({ default: () => null }));

const v = (id) => ({ videoId: id, title: `Song ${id}`, channelTitle: 'Band', thumbnail: '' });
const tierItems = {
  S: [v('s1'), v('s2')],
  A: [v('a1'), v('a2'), v('a3')],
  TODO: [v('new')],
};

describe('DuelView', () => {
  it('places a to-do song: tier pick, duels, then applies the new board', () => {
    const onApply = vi.fn();
    renderWithApp(<DuelView tierItems={tierItems} isLoading={false} onApply={onApply} onExit={() => {}} />);

    fireEvent.click(screen.getByText('Place to-do songs'));
    expect(screen.getByText('Which tier is this song?')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '2', code: 'Digit2' }); // A
    expect(screen.getByText('Which is better?')).toBeInTheDocument();
    expect(screen.getByText('Song a2')).toBeInTheDocument();

    // The new song loses to a2, then beats a3: it lands between them.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('All done.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Apply 1 change/ })[0]);
    expect(onApply.mock.calls[0][0].A.map((x) => x.videoId)).toEqual(['a1', 'a2', 'new', 'a3']);
    expect(onApply.mock.calls[0][0].TODO).toEqual([]);
  });

  it('u undoes the last answer', () => {
    renderWithApp(<DuelView tierItems={tierItems} isLoading={false} onApply={() => {}} onExit={() => {}} />);
    fireEvent.click(screen.getByText('Place to-do songs'));
    fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
    fireEvent.keyDown(window, { key: 'u' });
    expect(screen.getByText('Which tier is this song?')).toBeInTheDocument();
  });
});
