import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import './App.css';
import { TIER_ORDER } from './tiers';
import Sidebar from './components/Sidebar';
import PlaylistsView from './components/PlaylistsView';
import ItemsView from './components/ItemsView';
import TierBoardView from './components/TierBoardView';
import PlayerDock from './components/PlayerDock';
import CommandPalette from './components/CommandPalette';
import { spotlight } from '@mantine/spotlight';
import DuelView from './components/DuelView';
import SettingsView from './components/SettingsView';
import { setLoggedIn, setPlaylists } from './store/authSlice';
import { setActiveView, setQuery, setMobileSidebarOpen } from './store/viewSlice';
import { setItems, setLoadingItems } from './store/itemsSlice';
import {
  resetTierBoard,
  setTierForCategory,
  setTierItems,
  discardTierChanges,
  setSyncStatus,
  setDraggedVideoId,
  setDragOverTier,
  moveVideoToTier as moveVideoToTierAction,
} from './store/tiersSlice';
import {
  openFocus as openFocusAction,
  closeFocus as closeFocusAction,
  minimizePlayer,
  expandPlayer,
  startShuffle,
  setFocusedVideo,
} from './store/focusSlice';
import {
  selectTierGroups,
  selectTierCategories,
  selectPendingMoves,
  selectDuelPool,
  selectDuelRuns,
  selectDuelTierSizes,
  selectFocusSequence,
  selectVideoLookup,
  selectActiveSequence,
  selectFocusedSeqIndex,
  selectFocusedVideoData,
  selectFocusedAvailableTiers,
} from './store/selectors';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export default function App() {
  const dispatch = useDispatch();
  const store = useStore();

  const loggedIn = useSelector((s) => s.auth.loggedIn);
  const playlists = useSelector((s) => s.auth.playlists);
  const query = useSelector((s) => s.view.query);
  const mobileSidebarOpen = useSelector((s) => s.view.mobileSidebarOpen);
  const activeView = useSelector((s) => s.view.activeView);
  const items = useSelector((s) => s.items.items);
  const loadingItems = useSelector((s) => s.items.loadingItems);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const tierLoading = useSelector((s) => s.tiers.tierLoading);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const isShuffling = useSelector((s) => s.focus.isShuffling);
  const playerMode = useSelector((s) => s.focus.playerMode);

  const tierGroups = useSelector(selectTierGroups);
  const tierCategories = useSelector(selectTierCategories);
  const pendingMoves = useSelector(selectPendingMoves);
  const duelPool = useSelector(selectDuelPool);
  const duelRuns = useSelector(selectDuelRuns);
  const duelTierSizes = useSelector(selectDuelTierSizes);
  const focusSequence = useSelector(selectFocusSequence);
  const videoLookup = useSelector(selectVideoLookup);
  const activeSequence = useSelector(selectActiveSequence);
  const focusedSeqIndex = useSelector(selectFocusedSeqIndex);
  const focusedVideoData = useSelector(selectFocusedVideoData);
  const focusedAvailableTiers = useSelector(selectFocusedAvailableTiers);

  // Kept as plain refs (not store state) - they only exist so
  // resolveFromLocation's popstate handler can read the latest playlists/
  // tierGroups without re-subscribing the listener on every change.
  const autoSelectedRef = useRef(false);
  const playlistsRef = useRef(null);
  const tierGroupsRef = useRef({});
  playlistsRef.current = playlists;
  tierGroupsRef.current = tierGroups;

  const commandItems = useMemo(() => {
    const list = [];
    for (const category of tierCategories) {
      list.push({
        id: `board-${category}`,
        section: 'Boards',
        label: `Go to board ${category}`,
        action: () => openTierBoard(category),
      });
    }
    for (const p of playlists || []) {
      list.push({
        id: `playlist-${p.id}`,
        section: 'Playlists',
        label: `Open ${p.title}`,
        action: () => openItems(p),
      });
    }
    list.push({
      id: 'action-playlists',
      section: 'Actions',
      label: 'Go to Playlists',
      action: () => selectPlaylists(),
    });
    if (activeView.type === 'tierBoard') {
      list.push({
        id: 'action-duel',
        section: 'Actions',
        label: `Start a duel on ${activeView.category}`,
        action: () => enterDuel(activeView.category),
      });
      if (pendingMoves.length > 0) {
        list.push({
          id: 'action-sync',
          section: 'Actions',
          label: `Sync ${activeView.category} to YouTube (${pendingMoves.length} pending)`,
          action: () => syncChanges(),
        });
        list.push({
          id: 'action-discard',
          section: 'Actions',
          label: `Discard changes on ${activeView.category}`,
          action: () => discardChanges(),
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCategories, playlists, activeView, pendingMoves]);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore whichever tier board / playlist the URL points at (so refresh and
  // back/forward don't just dump you back on the first tier board), falling
  // back to the first tier board only when the URL has nothing usable.
  useEffect(() => {
    if (playlists && !autoSelectedRef.current) {
      autoSelectedRef.current = true;
      resolveFromLocation({ push: false, fallbackToFirst: true });
    }

    function onPopState() {
      resolveFromLocation({ push: false, fallbackToFirst: false });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists]);


  function resolveFromLocation({ push, fallbackToFirst }) {
    const path = window.location.pathname;
    const duelMatch = path.match(/^\/tier\/([^/]+)\/duel/);
    const tierMatch = path.match(/^\/tier\/([^/]+)$/);
    const playlistMatch = path.match(/^\/playlist\/([^/]+)/);
    const groups = tierGroupsRef.current;
    const list = playlistsRef.current;

    if (duelMatch) {
      const category = decodeURIComponent(duelMatch[1]);
      if (groups[category]) {
        openTierBoard(category, { push: false }).then(() => enterDuel(category, { push }));
        return;
      }
    }
    if (tierMatch) {
      const category = decodeURIComponent(tierMatch[1]);
      if (groups[category]) {
        openTierBoard(category, { push });
        return;
      }
    }
    if (playlistMatch) {
      const id = decodeURIComponent(playlistMatch[1]);
      const playlist = list?.find((p) => p.id === id);
      if (playlist) {
        openItems(playlist, { push });
        return;
      }
    }
    if (path === '/settings') {
      selectSettings({ push });
      return;
    }
    if (fallbackToFirst) {
      const categories = Object.keys(groups).sort();
      if (categories.length > 0) {
        openTierBoard(categories[0], { push: false, replace: true });
        return;
      }
    }
    selectPlaylists({ push: false });
  }

  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      dispatch(setLoggedIn(data.loggedIn));
      if (data.loggedIn) loadPlaylists();
    } catch {
      dispatch(setLoggedIn(false));
    }
  }

  async function loadPlaylists() {
    dispatch(setPlaylists(null));
    const res = await fetch(`${API_BASE}/api/playlists`, { credentials: 'include' });
    if (!res.ok) {
      dispatch(setPlaylists([]));
      return;
    }
    dispatch(setPlaylists(await res.json()));
  }

  async function openItems(playlist, { push = true, replace = false } = {}) {
    dispatch(setActiveView({ type: 'items', playlist }));
    dispatch(setMobileSidebarOpen(false));
    dispatch(closeFocusAction());
    updateUrl(`/playlist/${encodeURIComponent(playlist.id)}`, { push, replace });
    dispatch(setItems(null));
    dispatch(setLoadingItems(true));
    const res = await fetch(`${API_BASE}/api/playlists/${playlist.id}/items`, { credentials: 'include' });
    dispatch(setLoadingItems(false));
    if (!res.ok) {
      dispatch(setItems([]));
      return;
    }
    dispatch(setItems(await res.json()));
  }

  async function fetchPlaylistItems(playlistId) {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/items`, { credentials: 'include' });
    if (!res.ok) return [];
    return res.json();
  }

  async function loadTierBoardData(category) {
    const tiers = tierGroupsRef.current[category];
    const presentTiers = TIER_ORDER.filter((t) => tiers[t]);
    dispatch(resetTierBoard(presentTiers));

    await Promise.all(
      presentTiers.map(async (t) => {
        const videos = await fetchPlaylistItems(tiers[t].id);
        dispatch(setTierForCategory({ tier: t, videos }));
      })
    );
  }

  async function openTierBoard(category, { push = true, replace = false } = {}) {
    dispatch(setActiveView({ type: 'tierBoard', category }));
    dispatch(setMobileSidebarOpen(false));
    dispatch(setSyncStatus('idle'));
    dispatch(closeFocusAction());
    updateUrl(`/tier/${encodeURIComponent(category)}`, { push, replace });
    await loadTierBoardData(category);
  }

  function enterDuel(category, { push = true, replace = false } = {}) {
    dispatch(setActiveView({ type: 'duel', category }));
    dispatch(setMobileSidebarOpen(false));
    dispatch(closeFocusAction());
    updateUrl(`/tier/${encodeURIComponent(category)}/duel`, { push, replace });
  }

  function backToTierBoard(category, { push = true } = {}) {
    dispatch(setActiveView({ type: 'tierBoard', category }));
    dispatch(setMobileSidebarOpen(false));
    updateUrl(`/tier/${encodeURIComponent(category)}`, { push, replace: false });
  }

  function applyDuelResult(category, newTierItems) {
    dispatch(setTierItems(newTierItems));
    backToTierBoard(category);
  }

  function selectPlaylists({ push = true } = {}) {
    dispatch(setActiveView({ type: 'playlists' }));
    dispatch(setMobileSidebarOpen(false));
    dispatch(closeFocusAction());
    updateUrl('/', { push, replace: false });
  }

  function selectSettings({ push = true } = {}) {
    dispatch(setActiveView({ type: 'settings' }));
    dispatch(setMobileSidebarOpen(false));
    dispatch(closeFocusAction());
    updateUrl('/settings', { push, replace: false });
  }

  function updateUrl(path, { push, replace }) {
    if (window.location.pathname === path) return;
    if (replace) window.history.replaceState(null, '', path);
    else if (push) window.history.pushState(null, '', path);
  }

  function handleThumbDragStart(e, video, fromTier) {
    e.dataTransfer.setData('application/json', JSON.stringify({ videoId: video.videoId, fromTier }));
    e.dataTransfer.effectAllowed = 'move';
    dispatch(setDraggedVideoId(video.videoId));
  }

  function handleThumbDragEnd() {
    dispatch(setDraggedVideoId(null));
    dispatch(setDragOverTier(null));
  }

  function handleRowDragOver(e, tier) {
    e.preventDefault();
    if (dragOverTier !== tier) dispatch(setDragOverTier(tier));
  }

  function handleRowDragLeave(tier) {
    if (dragOverTier === tier) dispatch(setDragOverTier(null));
  }

  function moveVideoToTier(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveVideoToTierAction({ fromTier, toTier, videoId, dropIndex }));
  }

  function handleRowDrop(e, toTier, dropIndex) {
    e.preventDefault();
    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    } catch {
      data = {};
    }
    const { videoId, fromTier } = data;
    dispatch(setDragOverTier(null));
    dispatch(setDraggedVideoId(null));
    if (!videoId) return;
    moveVideoToTier(fromTier, toTier, videoId, dropIndex);
  }

  function openFocus(tier, videoId) {
    // Freeze the current tier-order sequence as this session's browsing
    // order, so later tier reassignments can't reshuffle where "next" goes.
    dispatch(openFocusAction({ tier, videoId, queue: focusSequence.map((e) => e.video.videoId) }));
  }

  function closeFocus() {
    dispatch(closeFocusAction());
  }

  function startShufflePlay() {
    if (focusSequence.length === 0) return;
    const ids = focusSequence.map((e) => e.video.videoId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const first = videoLookup.get(ids[0]);
    dispatch(startShuffle({ queue: ids, tier: first.tier, videoId: first.video.videoId }));
  }

  function navigateFocus(delta) {
    if (focusedSeqIndex < 0) return;
    const nextIndex = focusedSeqIndex + delta;
    if (nextIndex < 0 || nextIndex >= activeSequence.length) return;
    const entry = activeSequence[nextIndex];
    dispatch(setFocusedVideo({ tier: entry.tier, videoId: entry.video.videoId }));
  }

  function changeFocusedTier(newTier) {
    if (!focusedVideo || newTier === focusedVideo.tier) return;
    moveVideoToTier(focusedVideo.tier, newTier, focusedVideo.videoId, null);
    dispatch(setFocusedVideo({ tier: newTier, videoId: focusedVideo.videoId }));
  }

  function discardChanges() {
    dispatch(discardTierChanges());
  }

  async function syncChanges() {
    dispatch(setSyncStatus('syncing'));
    const category = activeView.category;
    const tiers = tierGroups[category] || {};
    const currentPendingMoves = selectPendingMoves(store.getState());
    const payload = currentPendingMoves.map((m) => ({
      videoId: m.video.videoId,
      title: m.video.title,
      fromItemId: m.video.id,
      // A dedupe entry has nothing to insert - it's just removing the
      // redundant copy, so toPlaylistId is left out entirely.
      toPlaylistId: m.kind === 'dedupe' ? null : tiers[m.to]?.id,
    }));

    try {
      const res = await fetch(`${API_BASE}/api/tier-sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('sync failed');

      const result = await res.json();
      const finishedStatus = result.applied < result.total ? 'partial' : 'done';
      await loadTierBoardData(category);
      dispatch(setSyncStatus(finishedStatus));
      setTimeout(() => dispatch(setSyncStatus('idle')), 2500);
    } catch {
      dispatch(setSyncStatus('error'));
    }
  }

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    dispatch(setLoggedIn(false));
    dispatch(setPlaylists(null));
    dispatch(setActiveView({ type: 'playlists' }));
    dispatch(setItems(null));
    dispatch(setTierItems({}));
    dispatch(setSyncStatus('idle'));
    dispatch(closeFocusAction());
    spotlight.close();
    autoSelectedRef.current = false;
    window.history.replaceState(null, '', '/');
  }

  if (loggedIn === false) {
    return (
      <main className="login-screen">
        <section id="login-view">
          <h2 className="login-headline">Your playlists, ranked.</h2>
          <p>Sign in to load your playlists and start sorting them into tiers.</p>
          <button className="btn btn-primary" onClick={login}>
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  if (loggedIn === null) {
    return (
      <main className="login-screen">
        <p className="hint-text">Loading...</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <button className="mobile-menu-btn" onClick={() => dispatch(setMobileSidebarOpen(true))}>
        Menu
      </button>

      <Sidebar
        query={query}
        onQueryChange={(q) => dispatch(setQuery(q))}
        tierCategories={tierCategories}
        playlistCount={playlists?.length ?? 0}
        activeView={activeView}
        onSelectTierBoard={openTierBoard}
        onSelectPlaylists={selectPlaylists}
        onSelectSettings={selectSettings}
        onLogout={logout}
        onOpenPalette={() => spotlight.open()}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => dispatch(setMobileSidebarOpen(false))}
      />

      <main className="canvas">
        {activeView.type === 'playlists' && (
          <PlaylistsView playlists={playlists} query={query} onOpenPlaylist={openItems} />
        )}

        {activeView.type === 'items' && (
          <ItemsView playlist={activeView.playlist} items={items} loading={loadingItems} />
        )}

        {activeView.type === 'tierBoard' && (
          <TierBoardView
            category={activeView.category}
            tierGroups={tierGroups}
            tierItems={tierItems}
            tierLoading={tierLoading}
            dragOverTier={dragOverTier}
            draggedVideoId={draggedVideoId}
            onRowDragOver={handleRowDragOver}
            onRowDragLeave={handleRowDragLeave}
            onRowDrop={handleRowDrop}
            onThumbDragStart={handleThumbDragStart}
            onThumbDragEnd={handleThumbDragEnd}
            onThumbClick={openFocus}
            pendingMoves={pendingMoves}
            syncStatus={syncStatus}
            onDiscard={discardChanges}
            onSync={syncChanges}
            onStartDuel={() => enterDuel(activeView.category)}
            onShufflePlay={startShufflePlay}
          />
        )}

        {activeView.type === 'duel' && (
          <DuelView
            videos={duelPool}
            runs={duelRuns}
            tierSizes={duelTierSizes}
            onComplete={(result) => applyDuelResult(activeView.category, result)}
            onCancel={() => backToTierBoard(activeView.category)}
          />
        )}

        {activeView.type === 'settings' && <SettingsView />}
      </main>

      {focusedVideoData && (
        <PlayerDock
          mode={playerMode}
          video={focusedVideoData}
          currentTier={focusedVideo.tier}
          availableTiers={focusedAvailableTiers}
          hasPrev={focusedSeqIndex > 0}
          hasNext={focusedSeqIndex < activeSequence.length - 1}
          isShuffling={isShuffling}
          onStop={closeFocus}
          onMinimize={() => dispatch(minimizePlayer())}
          onExpand={() => dispatch(expandPlayer())}
          onPrev={() => navigateFocus(-1)}
          onNext={() => navigateFocus(1)}
          onChangeTier={changeFocusedTier}
        />
      )}

      <CommandPalette items={commandItems} />
    </div>
  );
}
