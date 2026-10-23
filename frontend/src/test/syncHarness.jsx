/* oxlint-disable react/immutability, react/only-export-components -- test plumbing: probes hand hook values to the test */
// End-to-end sync harness: the real App (router, Layout's push chain, the
// board pages, React Query, the store, tierActions, syncPlan) over the fake
// YouTube (fakeYoutube.js), wired in at the one axios instance. Edits go
// through the same tierActions thunks the drag handlers / menus dispatch;
// boards are opened through the router, and Push is the real Push button.
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/react';
import App from '../App';
import AppearanceRoot from '../components/AppearanceRoot';
import { api } from '../api/client';
import { resetPushLedger } from '../api/pushLedger';
import { createQueryClient } from '../api/queryClient';
import { makeStore } from './render';
import { moveWithFeedback, undoEdit, redoEdit, transferWithFeedback, cancelTransfer } from '../tierActions';
import { dragEnded, dragStarted } from '../store/transfersSlice';
import { selectStagedChanges, selectTransfers } from '../store/selectors';
import { BOARD_TIERS, REMOVED_TIER } from '../tiers';
import { parseTitle } from '../naming';
import { useAddSongsActions } from '../addSongs/useAddSongsActions';
import { boardProbe } from './boardProbe';

// Each mounted app (a browser tab) has its own router: `nav` is the one
// the Harness drives.
function NavGrab({ nav }) {
  nav.current = useNavigate();
  return null;
}

// Add songs' real filing code (the hook its page uses), reachable from tests.
const NO_LIST = { list: [], nextAfter: () => null };
function AddSongsProbe({ addSongs }) {
  addSongs.current = useAddSongsActions(NO_LIST);
  return null;
}

// Every tier playlist of the fake account, as { [board]: { [tier]: videoId[] } }.
export function youtubeBoards(yt) {
  const naming = [{ template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } }];
  const out = {};
  for (const p of yt.playlists.values()) {
    const parsed = parseTitle(p.title, naming);
    if (!parsed) continue;
    (out[parsed.category] ??= {})[parsed.tier] = p.items.map((i) => i.videoId);
  }
  return out;
}

// `secondTab`: mount another app beside the one(s) already mounted - a
// second browser tab on the same account (its own store, query cache and
// router; the fake YouTube and the axios instance are shared). The push
// ledger is module state, so tabs share it (a real tab's is its own).
export async function mountApp(yt, { path = '/', secondTab = false } = {}) {
  // A freshly mounted app is a new session (a page load): the push ledger is
  // module state, and each fake YouTube starts its item ids over.
  if (!secondTab) resetPushLedger();
  api.defaults.adapter = yt.adapter;
  const store = makeStore();
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  const nav = { current: null };
  const addSongs = { current: null };
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <NavGrab nav={nav} />
          <AppearanceRoot>
            <ProgressProvider>
              <App />
              <AddSongsProbe addSongs={addSongs} />
            </ProgressProvider>
          </AppearanceRoot>
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>
  );
  await waitFor(
    () => {
      if (!store.getState().auth.playlists?.length) throw new Error(`playlists not loaded: ${JSON.stringify(yt.log)}`);
    },
    { timeout: 8000 }
  );
  return new Harness(yt, store, queryClient, { nav, addSongs, container });
}

export class Harness {
  constructor(yt, store, queryClient, { nav, addSongs, container }) {
    this.yt = yt;
    this.store = store;
    this.queryClient = queryClient;
    this.nav = nav;
    this.addSongs = addSongs;
    this.container = container;
  }

  // Queries scoped to this app's own DOM (another tab may be mounted too).
  get screen() {
    return within(this.container);
  }

  // navigate() inside act, awaited.
  async go(path) {
    await act(async () => this.navigate(path));
  }

  get state() {
    return this.store.getState();
  }

  get board() {
    return this.state.tiers.loadedCategory;
  }

  tierItems() {
    return this.state.tiers.tierItems;
  }

  // The open board as it's shown: { [tier]: videoId[] } (BOARD_TIERS only).
  shown() {
    const t = this.tierItems();
    return Object.fromEntries(BOARD_TIERS.filter((k) => t[k]).map((k) => [k, t[k].map((v) => v.videoId)]));
  }

  tierOf(videoId) {
    const t = this.tierItems();
    return [...BOARD_TIERS, REMOVED_TIER].find((k) => (t[k] || []).some((v) => v.videoId === videoId));
  }

  async settle() {
    await waitFor(
      () => {
        if (this.queryClient.isFetching() || this.queryClient.isMutating()) throw new Error('busy');
        if (this.state.tiers.syncStatus === 'syncing') throw new Error('syncing');
      },
      { timeout: 4000, interval: 5 }
    );
  }

  async open(board) {
    await act(async () => this.nav.current(`/tier/${encodeURIComponent(board)}`));
    await waitFor(
      () => {
        const t = this.state.tiers;
        if (t.loadedCategory !== board) throw new Error(`board ${board} not loaded (${t.loadedCategory})`);
        if (Object.values(t.tierLoading).some(Boolean)) throw new Error('tiers loading');
      },
      { timeout: 4000, interval: 5 }
    );
    await this.settle();
  }

  async goHome() {
    await act(async () => this.nav.current('/'));
  }

  // Any route (Settings, a duel page...), the way a link would go there.
  navigate(path) {
    this.nav.current(path);
  }

  dispatch(action) {
    let r;
    act(() => {
      r = this.store.dispatch(action);
    });
    return r;
  }

  // A drag on the open board (or a menu move): song -> tier, optional position.
  move(videoId, toTier, dropIndex = null) {
    const fromTier = this.tierOf(videoId);
    if (!fromTier) throw new Error(`${videoId} is not on board ${this.board}`);
    this.dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }], { quiet: true }));
  }

  remove(videoId) {
    this.move(videoId, REMOVED_TIER);
  }

  undo() {
    this.dispatch(undoEdit({ silent: true }));
  }

  redo() {
    this.dispatch(redoEdit({ silent: true }));
  }

  // A duel page's "Move" on a suggested move (useDuelBoard.accept): the move
  // is staged and that song alone is pushed at once. Needs the boardProbe
  // mock (see boardProbe.jsx).
  async duelMove(videoId, to) {
    const duel = this.probe().duel;
    const s = { song: videoId, from: this.tierOf(videoId), to, confidence: 0.9 };
    await act(async () => duel.accept(s, () => 0));
    await this.settle();
    return s;
  }

  // Its Undo ("Moved to S · Undo"): moved back, pushed at once.
  async duelUndo(s) {
    const duel = this.probe().duel;
    await act(async () => duel.undo(s, true));
    await this.settle();
  }

  // "Sort by score" on a tier (useDuelBoard.applyTierOrder).
  sortTier(tier, ids) {
    act(() => this.probe().duel.applyTierOrder(tier, ids));
  }

  probe() {
    if (!boardProbe.current) throw new Error("mock './components/PendingChanges' with './test/boardProbe'");
    return boardProbe.current;
  }

  // Drag a song off this board, hold it over `toBoard` in the sidebar until
  // it opens, drop it on `toTier` there.
  async transfer(videoId, toBoard, toTier, dropIndex = null) {
    const fromTier = this.tierOf(videoId);
    const video = this.tierItems()[fromTier].find((v) => v.videoId === videoId);
    this.dispatch(dragStarted({ video, fromCategory: this.board, fromTier }));
    await this.open(toBoard);
    const drag = this.state.transfers.drag;
    this.dispatch(transferWithFeedback(drag, toTier, dropIndex));
    this.dispatch(dragEnded());
  }

  // Add songs: file a new video straight into board/tier (writes to YouTube at once).
  async fileSong(videoId, board, tier) {
    const video = { videoId, title: this.yt.title(videoId), channelTitle: `Artist ${videoId}`, thumbnail: null };
    await act(async () => this.addSongs.current.file(video, board, tier));
    await this.settle();
  }

  // Add songs' Undo (its toast button / `u`) of the newest filed song.
  async undoFileSong() {
    await act(async () => this.addSongs.current.undo());
    await this.settle();
  }

  putBackTransfer(videoId) {
    const t = selectTransfers(this.state).find((x) => x.video.videoId === videoId);
    this.dispatch(cancelTransfer(t));
  }

  staged() {
    return selectStagedChanges(this.state);
  }

  // The real Push button of the staged-changes bar.
  async push() {
    const before = this.yt.syncCalls.length;
    const button = this.screen.queryByRole('button', { name: /Push to YouTube|^Push$/ });
    if (!button) return null;
    await act(async () => fireEvent.click(button));
    await waitFor(() => {
      if (this.yt.syncCalls.length === before && this.state.tiers.syncStatus === 'syncing') throw new Error('pushing');
    });
    await this.settle();
    return this.yt.syncCalls.length > before ? this.yt.syncCalls.at(-1) : null;
  }

  async discard() {
    const button = this.screen.queryByRole('button', { name: 'Discard' });
    if (button) await act(async () => fireEvent.click(button));
  }
}

export function unmount() {
  cleanup();
}
