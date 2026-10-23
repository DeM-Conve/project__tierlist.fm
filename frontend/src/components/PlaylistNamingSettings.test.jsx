import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import PlaylistNamingSettings from './PlaylistNamingSettings';
import { makeStore, renderWithApp } from '../test/render';
import { settingsLoaded } from '../store/settingsActions';
import { toServer } from '../api/settingsMapping';
import { api } from '../api/client';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// Settings -> Playlist naming: decides which playlists are tier playlists.
// It never renames anything; the preview shows what the draft picks up.
const PLAYLISTS = [
  { id: 'p1', title: 'Rap S', itemCount: 1 },
  { id: 'p2', title: 'Rap A', itemCount: 1 },
  { id: 'p3', title: '[Chill] Rock S', itemCount: 1 },
  { id: 'p4', title: 'Holiday mix', itemCount: 1 },
];

function draw() {
  const store = makeStore({ playlists: PLAYLISTS });
  renderWithApp(<PlaylistNamingSettings />, { store });
  return store;
}
const template = () => screen.getByRole('textbox', { name: 'Template' });
const preview = () => screen.getByText('Matching playlists').closest('.mantine-Paper-root');
const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('Playlist naming', () => {
  it('previews only the playlists the template matches; the rest are a count, never a title', () => {
    draw();
    const table = within(preview());
    expect(table.getByText('Rap S')).toBeInTheDocument();
    expect(table.getByText('Rap A')).toBeInTheDocument();
    expect(table.queryByText('Holiday mix')).not.toBeInTheDocument();
    expect(table.getByText('3 playlists · 2 tier lists')).toBeInTheDocument();
    expect(table.getByText('1 other playlist doesn’t match and stays hidden')).toBeInTheDocument();
  });

  it('counts read right in the singular', () => {
    draw();
    fireEvent.change(template(), { target: { value: '[{mood}] {category} {tier}' } });
    const table = within(preview());
    expect(table.getByText('1 playlist · 1 tier list')).toBeInTheDocument();
    expect(table.getByText('3 other playlists don’t match and stay hidden')).toBeInTheDocument();
  });

  it('a template with your own token: the preview updates live, with a column for it', () => {
    draw();
    fireEvent.change(template(), { target: { value: '[{mood}] {category} {tier}' } });
    const table = within(preview());
    expect(table.getByText('[Chill] Rock S')).toBeInTheDocument();
    expect(table.getByText('{mood}')).toBeInTheDocument();
    expect(table.getByText('Chill')).toBeInTheDocument();
    expect(table.queryByText('Rap S')).not.toBeInTheDocument();
  });

  it('an invalid template says why and can’t be saved', () => {
    draw();
    fireEvent.change(template(), { target: { value: '{category} only' } });
    expect(saveButton()).toBeDisabled();
    expect(within(preview()).getByText('Fix the template / tier names above to see what matches.')).toBeInTheDocument();
  });

  it('Save applies the naming and renames nothing on YouTube', () => {
    const post = vi.spyOn(api, 'post');
    const put = vi.spyOn(api, 'put');
    const store = draw();
    fireEvent.change(template(), { target: { value: '[{mood}] {category} {tier}' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(store.getState().naming.template).toBe('[{mood}] {category} {tier}');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('an untouched page follows the account’s naming when it loads after the page opened', () => {
    const store = draw();
    const saved = toServer(store.getState());
    act(() => {
      store.dispatch(settingsLoaded({ ...saved, naming: { ...saved.naming, template: '{tier} {category}' } }));
    });
    expect(template()).toHaveValue('{tier} {category}');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('a draft being edited is kept when the naming changes under it', () => {
    const store = draw();
    fireEvent.change(template(), { target: { value: '[{mood}] {category} {tier}' } });
    const saved = toServer(store.getState());
    act(() => {
      store.dispatch(settingsLoaded({ ...saved, naming: { ...saved.naming, template: '{tier} {category}' } }));
    });
    expect(template()).toHaveValue('[{mood}] {category} {tier}');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});
