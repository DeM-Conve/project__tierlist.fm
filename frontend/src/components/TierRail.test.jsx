import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TierRail from './TierRail';
import { makeStore, renderWithApp } from '../test/render';
import { loadBoard, moveWithFeedback } from '../tierActions';
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

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
// Rock loaded, nothing playing (or `other` loaded instead of Rock).
function renderIdleRail({ other = false } = {}) {
  const store = makeStore({ playlists: [...playlists, { id: 'pl-pop', title: 'Pop S', itemCount: 4 }], naming: NAMING });
  if (other) store.dispatch(loadBoard({ category: 'Pop', data: { S: [song('popsong0001')] } }));
  else store.dispatch(loadBoard({ category: 'Rock', data: { S: [song('ssssssss001'), song('ssssssss002')], A: [], TODO: [song('todosong001')] } }));
  renderWithApp(
    <MemoryRouter initialEntries={['/tier/Rock']}>
      <Routes>
        <Route path="*" element={<><TierRail category="Rock" /><Where /></>} />
      </Routes>
    </MemoryRouter>,
    { store }
  );
  return store;
}
const railCount = (name) => screen.getByRole('button', { name }).textContent;

describe('TierRail - tiers, counts and clicks', () => {
  it('nothing playing: "Tiers", each tier with its live count; a click opens that tier', () => {
    const store = renderIdleRail();
    expect(screen.getByText('Tiers')).toBeInTheDocument();
    expect(railCount('Open S')).toBe('S2');
    expect(railCount('Open TODO')).toBe('TODO1');
    act(() => {
      store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'ssssssss001' }], { quiet: true }));
    });
    expect(railCount('Open S')).toBe('S1');
    expect(railCount('Open A')).toBe('A1');
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/tier/Rock/t/A');
  });

  it('a song from this board playing: "Rate", a click re-rates it, its own tier does nothing', () => {
    const store = renderRail();
    expect(screen.getByText('Rate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /is in TODO$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /→ A$/ }));
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual(['todosong001']);
    expect(store.getState().focus.focusedVideo.tier).toBe('A');
  });

  it('Remove: a click stages the playing song, and the slot counts what is staged', () => {
    const store = renderRail();
    const remove = screen.getByRole('button', { name: 'Remove from playlist' });
    expect(remove).toHaveTextContent('Del');
    fireEvent.click(remove);
    expect(store.getState().tiers.tierItems[REMOVED_TIER].map((v) => v.videoId)).toEqual(['todosong001']);
    expect(remove).toHaveTextContent('1 staged');
  });

  it('any dragged tile dropped on a rail tier lands at the end of it', () => {
    const store = renderIdleRail();
    const dt = dataTransfer();
    dt.setData('application/json', JSON.stringify({ videoId: 'todosong001', fromTier: 'TODO' }));
    fireEvent.dragOver(screen.getByRole('button', { name: 'Open S' }), { dataTransfer: dt });
    expect(store.getState().tiers.dragOverTier).toBe('rail:S');
    fireEvent.drop(screen.getByRole('button', { name: 'Open S' }), { dataTransfer: dt });
    expect(store.getState().tiers.tierItems.S.map((v) => v.videoId)).toEqual(['ssssssss001', 'ssssssss002', 'todosong001']);
    expect(store.getState().tiers.dragOverTier).toBeNull();
  });

  it('another board loaded: counts come from the playlists, and there is no Remove slot', () => {
    renderIdleRail({ other: true });
    expect(railCount('Open S')).toBe('S1');
    expect(screen.queryByRole('button', { name: 'Remove from playlist' })).toBeNull();
  });
});
