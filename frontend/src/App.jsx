import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
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
import { Button } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
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
import ShortcutsModal from './components/ShortcutsModal';
import { setLoggedIn, setPlaylists } from './store/authSlice';
import { setCurrentCategory, setQuery, setMobileSidebarOpen } from './store/viewSlice';
import {
  resetTierBoard,
  setLoadedCategory,
  setTierForCategory,
  setTierItems,
  applySyncedMoves,
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
  floatPlayer,
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
import { api, API_BASE } from './api/client';
import {
  useAuthStatusQuery,
  usePlaylistsQuery,
  usePlaylistItemsQuery,
  useTierBoardQueries,
  useTierSyncMutation,
  useInvalidatePlaylistItems,
} from './api/queries';

// Module-level (not component state) so it survives route component
// remounts but resets on an actual page reload - "redirect to the first
// tier board on the very first landing at '/', but not on every later
// visit to Playlists via the sidebar" only makes sense as a one-time,
// whole-session flag, not per-mount state.
let hasAutoRedirected = false;

// Fetches a board's tiers via TanStack Query (one query per tier's
// underlying playlist, cached by playlist id) and mirrors the result into
// Redux's tiersSlice - which owns the *local editable draft* (drag-and-drop,
// duel results) layered on top. loadedCategory guards the mirror so it only
// re-applies once per fresh dataset: re-entering an already-loaded board
// (e.g. returning from a duel) must not stomp an unsynced local edit just
// because the query cache still holds data for it.
function useLoadTierBoard(category, tiers) {
  const dispatch = useDispatch();
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const { data, isLoading } = useTierBoardQueries(category, tiers);

  useEffect(() => {
    if (!data || loadedCategory === category) return;
    const presentTiers = Object.keys(data);
    dispatch(resetTierBoard({ category, presentTiers }));
    presentTiers.forEach((tier) => dispatch(setTierForCategory({ tier, videos: data[tier] })));
    dispatch(setLoadedCategory(category));
  }, [data, category, loadedCategory, dispatch]);

  return { isLoading: isLoading || loadedCategory !== category };
}

export default function App() {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);

  const { data: authData, isError: authErrored } = useAuthStatusQuery();
  const { data: playlistsData } = usePlaylistsQuery(authData?.loggedIn === true);

  // Mirrors TanStack Query's cache into Redux so the many selectors built on
  // state.auth.playlists (tier groups, pending moves, duel pools, ...) don't
  // all need rewriting to read query state directly.
  useEffect(() => {
    if (authErrored) dispatch(setLoggedIn(false));
    else if (authData) dispatch(setLoggedIn(authData.loggedIn));
  }, [authData, authErrored, dispatch]);

  useEffect(() => {
    if (playlistsData) dispatch(setPlaylists(playlistsData));
  }, [playlistsData, dispatch]);

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  if (loggedIn === false) {
    return (
      <main className="login-screen">
        <section id="login-view">
          <h2 className="login-headline">Your playlists, ranked.</h2>
          <p>Sign in to load your playlists and start sorting them into tiers.</p>
          <Button onClick={login}>Continue with Google</Button>
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
  const queryClient = useQueryClient();

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

  const tierSyncMutation = useTierSyncMutation();
  const invalidatePlaylistItems = useInvalidatePlaylistItems();

  const [shortcutsOpened, shortcutsHandlers] = useDisclosure(false);
  // "?" is the one shortcut in the app with no state-machine/scoping needs
  // of its own (see shortcuts.js's header comment for why the others still
  // have bespoke handlers) - a flat, always-on binding is exactly what
  // useHotkeys is for, and it already ignores keydowns while typing.
  useHotkeys([['shift+?', () => shortcutsHandlers.open()]]);

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
      const result = await tierSyncMutation.mutateAsync(payload);
      const finishedStatus = result.applied < result.total ? 'partial' : 'done';

      // Apply whichever moves actually succeeded (per-item, from the
      // backend's own results) straight to the local draft, rather than
      // clearing it and waiting on a refetch of YouTube's playlist API to
      // reflect the change - that refetch can lag behind the write that
      // just happened, which used to leave the just-synced duplicate/moved
      // video sitting on screen looking unsynced. See the comment on
      // `tiersSlice.applySyncedMoves`.
      const succeededMoves = pendingMoves.filter((_, i) => result.results?.[i]?.success);
      dispatch(applySyncedMoves({ moves: succeededMoves }));

      // Still invalidate the underlying query cache in the background so a
      // stale copy isn't served if the user leaves and comes back later -
      // this no longer needs to be awaited before updating the UI.
      invalidatePlaylistItems(Object.values(tiers).map((t) => t.id));

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
    dispatch(
      openFocusAction({
        tier,
        videoId,
        queue: focusSequence.map((e) => e.video.videoId),
        entries: focusSequence,
        category: currentCategory,
      })
    );
  }

  // With no `tier` argument, shuffles the whole board; passed a tier (the
  // per-tier "shuffle" button on each row), scopes both the shuffle order
  // and hasPrev/hasNext bounds to just that tier's videos - `entries` stays
  // the full board's snapshot either way so tier-reassignment mid-playback
  // still resolves, only `queue` (what defines the browsing sequence) is
  // narrowed.
  function startShufflePlay(tier) {
    const pool = tier ? focusSequence.filter((e) => e.tier === tier) : focusSequence;
    if (pool.length === 0) return;
    const ids = pool.map((e) => e.video.videoId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const first = videoLookup.get(ids[0]);
    dispatch(
      startShuffle({
        queue: ids,
        tier: first.tier,
        videoId: first.video.videoId,
        entries: focusSequence,
        category: currentCategory,
      })
    );
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
    await api.post('/api/auth/logout');
    queryClient.clear();
    dispatch(setLoggedIn(false));
    dispatch(setPlaylists(null));
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
          onFloat={() => dispatch(floatPlayer())}
          onPrev={() => navigateFocus(-1)}
          onNext={() => navigateFocus(1)}
          onChangeTier={changeFocusedTier}
        />
      )}

      <CommandPalette items={commandItems} />
      <ShortcutsModal opened={shortcutsOpened} onClose={shortcutsHandlers.close} />
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
  const playlist = playlists?.find((p) => p.id === playlistId);
  const { data: items, isLoading } = usePlaylistItemsQuery(playlistId);

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  return <ItemsView playlist={playlist} items={items ?? null} loading={isLoading} />;
}

function TierBoardPage() {
  const { category: rawCategory } = useParams();
  const category = decodeURIComponent(rawCategory);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { syncChanges, discardChanges, openFocus, startShufflePlay } = useOutletContext();

  const playlists = useSelector((s) => s.auth.playlists);
  const tierGroups = useSelector(selectTierGroups);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const pendingMoves = useSelector(selectPendingMoves);

  useEffect(() => {
    dispatch(setCurrentCategory(category));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch, category]);

  useEffect(() => {
    if (!playlists) return; // wait for playlists to load before judging validity
    if (!tierGroups[category]) navigate('/', { replace: true });
  }, [category, playlists, tierGroups, navigate]);

  const { isLoading } = useLoadTierBoard(category, tierGroups[category]);
  const tierLoading = useMemo(() => {
    if (!isLoading) return {};
    const tiers = tierGroups[category];
    return Object.fromEntries(TIER_ORDER.filter((t) => tiers?.[t]).map((t) => [t, true]));
  }, [isLoading, tierGroups, category]);

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

  const playlists = useSelector((s) => s.auth.playlists);
  const tierGroups = useSelector(selectTierGroups);
  const duelPool = useSelector(selectDuelPool);
  const duelRuns = useSelector(selectDuelRuns);
  const duelTierSizes = useSelector(selectDuelTierSizes);

  useEffect(() => {
    dispatch(setCurrentCategory(category));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch, category]);

  useEffect(() => {
    if (!playlists) return;
    if (!tierGroups[category]) navigate('/', { replace: true });
  }, [category, playlists, tierGroups, navigate]);

  // Supports deep-linking straight to a duel: fetches (and caches) the
  // board's data the same way TierBoardPage does. Coming from "Start duel"
  // on an already-open board serves straight from the query cache.
  useLoadTierBoard(category, tierGroups[category]);

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
