import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TierRail from './TierRail';
import { makeStore, renderWithApp } from '../test/render';
import { loadBoard } from '../tierActions';
import { openFocus } from '../store/focusSlice';
import { REMOVED_TIER } from '../tiers';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const NAMING = { template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
const playlists = ['S', 'A', 'TODO'].map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 1 }));
const song = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Band - ${videoId}`, thumbnail: null });

// Rock is loaded and its to-do song "todosong01" is playing.
function renderRail() {
  const store = makeStore({ playlists, naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data: { S: [song('ssssssss001')], A: [], TODO: [song('todosong001')] } }));
  const video = store.getState().tiers.tierItems.TODO[0];
  store.dispatch(openFocus({ tier: 'TODO', videoId: video.videoId, queue: [video.videoId], entries: [{ tier: 'TODO', video }], category: 'Rock', mode: 'mini' }));
  renderWithApp(
    <MemoryRouter>
      <TierRail category="Rock" />
    </MemoryRouter>,
    { store }
  );
  return store;
}

function dataTransfer() {
  const data = {};
  return { setData: (k, v) => (data[k] = v), getData: (k) => data[k] ?? '', effectAllowed: '' };
}

// The playing song's art sits on its tier in the rail; it used to be a
// picture only - a playing to-do song folded behind the board's "+N" had no
// tile to drag to Remove or a tier.
describe('TierRail - the playing song can be dragged from it', () => {
  it('dragging the art onto Remove stages the playing song for removal', () => {
    const store = renderRail();
    const art = screen.getByLabelText(/^Drag "Band - todosong001"/);
    expect(art).toHaveAttribute('draggable', 'true');
    const dt = dataTransfer();
    fireEvent.dragStart(art, { dataTransfer: dt });
    expect(JSON.parse(dt.getData('application/json'))).toEqual({ videoId: 'todosong001', fromTier: 'TODO' });
    expect(store.getState().tiers.draggedVideoId).toBe('todosong001');

    fireEvent.drop(screen.getByRole('button', { name: 'Remove from playlist' }), { dataTransfer: dt });
    const items = store.getState().tiers.tierItems;
    expect(items.TODO.map((v) => v.videoId)).not.toContain('todosong001');
    expect(items[REMOVED_TIER].map((v) => v.videoId)).toContain('todosong001');
  });

  it('dragging the art onto another tier moves the song there', () => {
    const store = renderRail();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByLabelText(/^Drag "Band - todosong001"/), { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('button', { name: /→ S$/ }), { dataTransfer: dt });
    expect(store.getState().tiers.tierItems.S.map((v) => v.videoId)).toEqual(['ssssssss001', 'todosong001']);
  });
});
