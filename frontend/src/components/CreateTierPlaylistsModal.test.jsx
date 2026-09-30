import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import CreateTierPlaylistsModal from './CreateTierPlaylistsModal';
import { makeStore, renderWithApp } from '../test/render';
import { api } from '../api/client';

const NAMING = {
  template: '[{tag}] {category} {tier}',
  tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: '(**TODO**)' },
};
const pl = (id, title, itemCount = 0) => ({ id, title, itemCount });

function open(props, playlists) {
  const store = makeStore({ playlists, naming: NAMING });
  return renderWithApp(<CreateTierPlaylistsModal opened onClose={() => {}} {...props} />, { store });
}
// The "Will create" preview lists each title that would be created.
const previewTitles = () =>
  [...document.querySelectorAll('.mantine-Alert-root .mantine-Text-root')].map((n) => n.textContent).filter((t) => t.startsWith('['));
// The own-token field (its label also names the suggestions list).
const tagInput = () => screen.getAllByLabelText('{tag}').find((n) => n.tagName === 'INPUT');

describe('CreateTierPlaylistsModal', () => {
  it('a new board creates all five tiers and its to-do list', async () => {
    open({}, [pl('x', '[G] Rap T1', 3)]);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Rock' } });
    fireEvent.change(tagInput(), { target: { value: 'G' } });
    await waitFor(() => expect(previewTitles()).toHaveLength(6));
    expect(previewTitles()).toEqual([
      '[G] Rock T1',
      '[G] Rock T2',
      '[G] Rock T3',
      '[G] Rock TE',
      '[G] Rock TZ',
      '[G] Rock (**TODO**)',
    ]);
  });

  it('does not create a second to-do list when one already exists for a board with no tiers yet', async () => {
    // The 200-song "[G] Rock (**TODO**)" exists; Rock has no ranked tiers.
    open({}, [pl('x', '[G] Rap T1', 3), pl('todo', '[G] Rock (**TODO**)', 200)]);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Rock' } });
    fireEvent.change(tagInput(), { target: { value: 'G' } });
    await waitFor(() => expect(previewTitles()).toHaveLength(5));
    expect(previewTitles()).not.toContain('[G] Rock (**TODO**)');
    expect(screen.getByText(/\(exists\)/)).toBeInTheDocument();
  });

  it('from a board, offers only its missing tiers', async () => {
    open({ category: 'Rock' }, [pl('s', '[G] Rock T1', 1), pl('a', '[G] Rock T2', 1), pl('todo', '[G] Rock (**TODO**)', 9)]);
    await waitFor(() => expect(previewTitles()).toEqual(['[G] Rock T3', '[G] Rock TE', '[G] Rock TZ']));
    expect(screen.getAllByText(/\(exists\)/)).toHaveLength(3);
  });

  it('refuses a board name that already exists', async () => {
    open({}, [pl('s', '[G] Rock T1', 1)]);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Rock' } });
    expect(await screen.findByText(/Rock already exists/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/ })).toBeDisabled();
  });

  it('needs a value for the own token', async () => {
    open({}, []);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Rock' } });
    fireEvent.change(tagInput(), { target: { value: '' } });
    expect(await screen.findByText('Your naming template needs a value here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/ })).toBeDisabled();
  });

  it('sends the previewed titles as private playlists', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { applied: 2, total: 2, results: [{ success: true }, { success: true }] } });
    const onCreated = vi.fn();
    open({ category: 'Rock', onCreated }, [
      pl('s', '[G] Rock T1'),
      pl('a', '[G] Rock T2'),
      pl('b', '[G] Rock T3'),
      pl('todo', '[G] Rock (**TODO**)'),
    ]);
    const button = await screen.findByRole('button', { name: 'Create 2 playlists' });
    fireEvent.click(button);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Rock'));
    expect(post).toHaveBeenCalledWith('/api/playlists/create', [
      { title: '[G] Rock TE', privacyStatus: 'private' },
      { title: '[G] Rock TZ', privacyStatus: 'private' },
    ]);
    post.mockRestore();
  });
});
