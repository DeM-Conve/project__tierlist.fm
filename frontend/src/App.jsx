import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useMatch,
  useOutletContext,
} from 'react-router-dom';
import { spotlight } from '@mantine/spotlight';
import './App.css';
import { TIER_ORDER } from './tiers';
import Sidebar from './components/Sidebar';
import PlaylistsView from './components/PlaylistsView';
import ItemsView from './components/ItemsView';
import TierBoardView from './components/TierBoardView';
import PlayerDock from './components/PlayerDock';
import CommandPalette from './components/CommandPalette';
import DuelView from './components/DuelView';
import SettingsView from './components/SettingsView';
import { setLoggedIn, setPlaylists } from './store/authSlice';
import { setCurrentCategory, setQuery, setMobileSidebarOpen } from './store/viewSlice';
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

// Module-level (not component state) so it survives route component
// remounts but resets on an actual page reload - "redirect to the first
// tier board on the very first landing at '/', but not on every later
// visit to Playlists via the sidebar" only makes sense as a one-time,
// whole-session flag, not per-mount state.
let hasAutoRedirected = false;

export default function App() {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      dispatch(setLoggedIn(data.loggedIn));
      if (data.loggedIn) {
        dispatch(setPlaylists(null));
        const plRes = await fetch(`${API_BASE}/api/playlists`, { credentials: 'include' });
        dispatch(setPlaylists(plRes.ok ? await plRes.json() : []));
      }
    } catch {
      dispatch(setLoggedIn(false));
    }
  }

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
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
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<PlaylistsPage />} />
        <Route path="playlist/:id" element={<ItemsPage />} />
        <Route path="tier/:category" element={<TierBoardPage />} />
        <Route path="tier/:category/duel" element={<DuelPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Sidebar + the persistent player dock + command palette, all of which stay
// mounted across every route change - the routed page renders into
// <Outlet/>. Navigation never touches the mini player: it's meant to keep
// playing in the background regardless of what page you're on, so only an
// explicit "stop" (the dock's own ✕, or logout) closes it.
function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const query = useSelector((s) => s.view.query);
  const mobileSidebarOpen = useSelector((s) => s.view.mobileSidebarOpen);
  const playlists = useSelector((s) => s.auth.playlists);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const isShuffling = useSelector((s) => s.focus.isShuffling);
  const playerMode = useSelector((s) => s.focus.playerMode);

  const tierGroups = useSelector(selectTierGroups);
  const tierCategories = useSelector(selectTierCategories);
  const pendingMoves = useSelector(selectPendingMoves);
  const focusSequence = useSelector(selectFocusSequence);
  const videoLookup = useSelector(selectVideoLookup);
  const activeSequence = useSelector(selectActiveSequence);
  const focusedSeqIndex = useSelector(selectFocusedSeqIndex);
  const focusedVideoData = useSelector(selectFocusedVideoData);
  const focusedAvailableTiers = useSelector(selectFocusedAvailableTiers);

  const tierMatch = useMatch('/tier/:category');
  const currentCategory = tierMatch ? decodeURIComponent(tierMatch.params.category) : null;

  async function fetchPlaylistItems(playlistId) {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/items`, { credentials: 'include' });
    if (!res.ok) return [];
    return res.json();
  }

  async function loadTierBoardData(category) {
    const tiers = tierGroups[category];
    if (!tiers) return;
    const presentTiers = TIER_ORDER.filter((t) => tiers[t]);
    dispatch(resetTierBoard({ category, presentTiers }));

    await Promise.all(
      presentTiers.map(async (t) => {
        const videos = await fetchPlaylistItems(tiers[t].id);
        dispatch(setTierForCategory({ tier: t, videos }));
      })
    );
  }

  async function syncChanges(category) {
    dispatch(setSyncStatus('syncing'));
    const tiers = tierGroups[category] || {};
    const payload = pendingMoves.map((m) => ({
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

  function discardChanges() {
    dispatch(discardTierChanges());
  }

  function moveVideoToTier(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveVideoToTierAction({ fromTier, toTier, videoId, dropIndex }));
  }

  function openFocus(tier, videoId) {
    // Freeze the current tier-order sequence as this session's browsing
    // order, so later tier reassignments can't reshuffle where "next" goes.
    dispatch(openFocusAction({ tier, videoId, queue: focusSequence.map((e) => e.video.videoId) }));
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

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    dispatch(setLoggedIn(false));
    dispatch(setPlaylists(null));
    dispatch(setItems(null));
    dispatch(setTierItems({}));
    dispatch(setSyncStatus('idle'));
    dispatch(closeFocusAction());
    spotlight.close();
    hasAutoRedirected = false;
    navigate('/', { replace: true });
  }

  const commandItems = useMemo(() => {
    const list = [];
    for (const category of tierCategories) {
      list.push({
        id: `board-${category}`,
        section: 'Boards',
        label: `Go to board ${category}`,
        action: () => navigate(`/tier/${encodeURIComponent(category)}`),
      });
    }
    for (const p of playlists || []) {
      list.push({
        id: `playlist-${p.id}`,
        section: 'Playlists',
        label: `Open ${p.title}`,
        action: () => navigate(`/playlist/${encodeURIComponent(p.id)}`),
      });
    }
    list.push({
      id: 'action-playlists',
      section: 'Actions',
      label: 'Go to Playlists',
      action: () => navigate('/'),
    });
    if (currentCategory) {
      list.push({
        id: 'action-duel',
        section: 'Actions',
        label: `Start a duel on ${currentCategory}`,
        action: () => navigate(`/tier/${encodeURIComponent(currentCategory)}/duel`),
      });
      if (pendingMoves.length > 0) {
        list.push({
          id: 'action-sync',
          section: 'Actions',
          label: `Sync ${currentCategory} to YouTube (${pendingMoves.length} pending)`,
          action: () => syncChanges(currentCategory),
        });
        list.push({
          id: 'action-discard',
          section: 'Actions',
          label: `Discard changes on ${currentCategory}`,
          action: () => discardChanges(),
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCategories, playlists, currentCategory, pendingMoves]);

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
        onSelectSettings={() => navigate('/settings')}
        onLogout={logout}
        onOpenPalette={() => spotlight.open()}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => dispatch(setMobileSidebarOpen(false))}
      />

      <main className="canvas">
        <Outlet
          context={{
            loadTierBoardData,
            syncChanges,
            discardChanges,
            moveVideoToTier,
            openFocus,
            startShufflePlay,
          }}
        />
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
          onStop={() => dispatch(closeFocusAction())}
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

function PlaylistsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const playlists = useSelector((s) => s.auth.playlists);
  const query = useSelector((s) => s.view.query);
  const tierCategories = useSelector(selectTierCategories);

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  // Land on the first tier board on the very first visit to "/" (so a fresh
  // login doesn't just show an empty playlists grid when boards exist), but
  // never again afterwards - clicking "Playlists" later should show
  // Playlists, not bounce back to a board.
  useEffect(() => {
    if (playlists && !hasAutoRedirected) {
      hasAutoRedirected = true;
      if (tierCategories.length > 0) {
        navigate(`/tier/${encodeURIComponent(tierCategories[0])}`, { replace: true });
      }
    }
  }, [playlists, tierCategories, navigate]);

  return (
    <PlaylistsView
      playlists={playlists}
      query={query}
      onOpenPlaylist={(p) => navigate(`/playlist/${encodeURIComponent(p.id)}`)}
    />
  );
}

function ItemsPage() {
  const { id } = useParams();
  const playlistId = decodeURIComponent(id);
  const dispatch = useDispatch();
  const playlists = useSelector((s) => s.auth.playlists);
  const items = useSelector((s) => s.items.items);
  const loadingItems = useSelector((s) => s.items.loadingItems);
  const playlist = playlists?.find((p) => p.id === playlistId);

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
    dispatch(setItems(null));
    dispatch(setLoadingItems(true));
    fetch(`${API_BASE}/api/playlists/${playlistId}/items`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        dispatch(setLoadingItems(false));
        dispatch(setItems(data));
      });
  }, [dispatch, playlistId]);

  return <ItemsView playlist={playlist} items={items} loading={loadingItems} />;
}

function TierBoardPage() {
  const { category: rawCategory } = useParams();
  const category = decodeURIComponent(rawCategory);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loadTierBoardData, syncChanges, discardChanges, openFocus, startShufflePlay } =
    useOutletContext();

  const playlists = useSelector((s) => s.auth.playlists);
  const tierGroups = useSelector(selectTierGroups);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const tierLoading = useSelector((s) => s.tiers.tierLoading);
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const pendingMoves = useSelector(selectPendingMoves);

  useEffect(() => {
    dispatch(setCurrentCategory(category));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch, category]);

  useEffect(() => {
    if (!playlists) return; // wait for playlists to load before judging validity
    if (!tierGroups[category]) {
      navigate('/', { replace: true });
      return;
    }
    // Re-entering this same board's page (e.g. returning from a duel) must
    // not refetch - that would silently discard an already-applied duel
    // result or drag that hasn't been synced to YouTube yet.
    if (loadedCategory !== category) loadTierBoardData(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, playlists, tierGroups, loadedCategory]);

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
    dispatch(moveVideoToTierAction({ fromTier, toTier, videoId, dropIndex }));
  }

  return (
    <TierBoardView
      category={category}
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
      onSync={() => syncChanges(category)}
      onStartDuel={() => navigate(`/tier/${encodeURIComponent(category)}/duel`)}
      onShufflePlay={startShufflePlay}
    />
  );
}

function DuelPage() {
  const { category: rawCategory } = useParams();
  const category = decodeURIComponent(rawCategory);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loadTierBoardData } = useOutletContext();

  const playlists = useSelector((s) => s.auth.playlists);
  const tierGroups = useSelector(selectTierGroups);
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const duelPool = useSelector(selectDuelPool);
  const duelRuns = useSelector(selectDuelRuns);
  const duelTierSizes = useSelector(selectDuelTierSizes);

  useEffect(() => {
    dispatch(setCurrentCategory(category));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch, category]);

  // Support deep-linking straight to a duel: load the board's data first if
  // it isn't already loaded. Coming from "Start duel" on an already-open
  // board has nothing left to fetch, and must not refetch - that would
  // discard any local edits (drags) not yet synced to YouTube.
  useEffect(() => {
    if (!playlists) return;
    if (!tierGroups[category]) {
      navigate('/', { replace: true });
      return;
    }
    if (loadedCategory !== category) loadTierBoardData(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, playlists, tierGroups, loadedCategory]);

  function applyDuelResult(result) {
    dispatch(setTierItems(result));
    navigate(`/tier/${encodeURIComponent(category)}`);
  }

  return (
    <DuelView
      videos={duelPool}
      runs={duelRuns}
      tierSizes={duelTierSizes}
      onComplete={applyDuelResult}
      onCancel={() => navigate(`/tier/${encodeURIComponent(category)}`)}
    />
  );
}

function SettingsPage() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  return <SettingsView />;
}
