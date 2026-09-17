import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { TIER_ORDER, groupByTier } from './tiers';
import Sidebar from './components/Sidebar';
import PlaylistsView from './components/PlaylistsView';
import ItemsView from './components/ItemsView';
import TierBoardView from './components/TierBoardView';
import VideoFocusModal from './components/VideoFocusModal';
import CommandPalette from './components/CommandPalette';
import DuelView from './components/DuelView';
import SettingsView from './components/SettingsView';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [query, setQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // activeView: { type: 'playlists' } | { type: 'items', playlist }
  //           | { type: 'tierBoard', category } | { type: 'duel', category }
  //           | { type: 'settings' }
  const [activeView, setActiveView] = useState({ type: 'playlists' });

  const [items, setItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const [tierItems, setTierItems] = useState({});
  const [tierLoading, setTierLoading] = useState({});
  const [draggedVideoId, setDraggedVideoId] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | done | partial | error

  // { tier, videoId } for the video open in the focus/embed modal, or null.
  const [focusedVideo, setFocusedVideo] = useState(null);
  // The browsing order for the currently-open focus session (video ids only,
  // in either tier order or shuffled order), frozen the moment the modal is
  // opened. Without this, "next" was recomputed live from current tier
  // membership, so reassigning a video's tier mid-browse (which appends it
  // to the end of its new tier) would silently teleport your position and
  // make "next" jump into a different tier than you were actually browsing.
  const [focusQueue, setFocusQueue] = useState(null);
  const [isShuffling, setIsShuffling] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const originalTierOfRef = useRef({});
  const originalTierItemsRef = useRef({});
  const autoSelectedRef = useRef(false);
  const playlistsRef = useRef(null);
  const tierGroupsRef = useRef({});

  const tierGroups = useMemo(() => (playlists ? groupByTier(playlists) : {}), [playlists]);
  const tierCategories = Object.keys(tierGroups).sort();

  playlistsRef.current = playlists;
  tierGroupsRef.current = tierGroups;

  const pendingMoves = useMemo(() => {
    const moves = [];
    for (const tier of TIER_ORDER) {
      for (const video of tierItems[tier] || []) {
        const originalTiers = originalTierOfRef.current[video.videoId];
        if (!originalTiers) continue;

        if (originalTiers.size > 1) {
          // Genuinely exists in more than one of this board's real YouTube
          // tier playlists. Keep the highest (earliest in TIER_ORDER) copy
          // and auto-stage every other occurrence for removal - there's
          // nothing to ask the user, the lower copy is just clutter.
          const keepTier = TIER_ORDER.find((t) => originalTiers.has(t));
          if (tier !== keepTier) {
            moves.push({ kind: 'dedupe', video, tier });
          }
          continue;
        }

        if (!originalTiers.has(tier)) {
          moves.push({ kind: 'move', video, from: [...originalTiers][0], to: tier });
        }
      }
    }
    return moves;
  }, [tierItems]);

  const duelPool = useMemo(() => TIER_ORDER.flatMap((t) => tierItems[t] || []), [tierItems]);
  const duelRuns = useMemo(
    () => TIER_ORDER.filter((t) => tierItems[t]).map((t) => tierItems[t].map((v) => v.videoId)),
    [tierItems]
  );
  const duelTierSizes = useMemo(
    () => TIER_ORDER.filter((t) => tierItems[t]).map((t) => ({ tier: t, count: tierItems[t].length })),
    [tierItems]
  );

  // Flattened across every tier of the current board, in tier order, so
  // "next" can walk off the end of one tier straight into the start of the
  // next one instead of stopping dead at each tier's own boundary.
  const focusSequence = useMemo(
    () => TIER_ORDER.flatMap((t) => (tierItems[t] || []).map((video) => ({ tier: t, video }))),
    [tierItems]
  );
  // Looked up by videoId only (not tier) so a shuffle order stays valid even
  // if a video's tier changes mid-playthrough via a tier-reassign shortcut.
  const videoLookup = useMemo(
    () => new Map(focusSequence.map((e) => [e.video.videoId, e])),
    [focusSequence]
  );
  const activeSequence = focusQueue
    ? focusQueue.map((id) => videoLookup.get(id)).filter(Boolean)
    : focusSequence;
  const focusedSeqIndex = focusedVideo
    ? activeSequence.findIndex(
        (e) => e.tier === focusedVideo.tier && e.video.videoId === focusedVideo.videoId
      )
    : -1;
  const focusedVideoData = focusedSeqIndex >= 0 ? activeSequence[focusedSeqIndex].video : null;
  const focusedAvailableTiers = focusedVideo
    ? TIER_ORDER.filter((t) => tierGroups[activeView.category]?.[t])
    : [];

  const commandItems = useMemo(() => {
    const items = [];
    for (const category of tierCategories) {
      items.push({
        id: `board-${category}`,
        section: 'Boards',
        label: `Go to board ${category}`,
        action: () => openTierBoard(category),
      });
    }
    for (const p of playlists || []) {
      items.push({
        id: `playlist-${p.id}`,
        section: 'Playlists',
        label: `Open ${p.title}`,
        action: () => openItems(p),
      });
    }
    items.push({
      id: 'action-playlists',
      section: 'Actions',
      label: 'Go to Playlists',
      action: () => selectPlaylists(),
    });
    if (activeView.type === 'tierBoard') {
      items.push({
        id: 'action-duel',
        section: 'Actions',
        label: `Start a duel on ${activeView.category}`,
        action: () => enterDuel(activeView.category),
      });
      if (pendingMoves.length > 0) {
        items.push({
          id: 'action-sync',
          section: 'Actions',
          label: `Sync ${activeView.category} to YouTube (${pendingMoves.length} pending)`,
          action: () => syncChanges(),
        });
        items.push({
          id: 'action-discard',
          section: 'Actions',
          label: `Discard changes on ${activeView.category}`,
          action: () => discardChanges(),
        });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCategories, playlists, activeView, pendingMoves]);

  useEffect(() => {
    checkAuth();
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

  useEffect(() => {
    function onKeyDown(e) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      setLoggedIn(data.loggedIn);
      if (data.loggedIn) loadPlaylists();
    } catch {
      setLoggedIn(false);
    }
  }

  async function loadPlaylists() {
    setPlaylists(null);
    const res = await fetch(`${API_BASE}/api/playlists`, { credentials: 'include' });
    if (!res.ok) {
      setPlaylists([]);
      return;
    }
    setPlaylists(await res.json());
  }

  async function openItems(playlist, { push = true, replace = false } = {}) {
    setActiveView({ type: 'items', playlist });
    setMobileSidebarOpen(false);
    setFocusedVideo(null);
    updateUrl(`/playlist/${encodeURIComponent(playlist.id)}`, { push, replace });
    setItems(null);
    setLoadingItems(true);
    const res = await fetch(`${API_BASE}/api/playlists/${playlist.id}/items`, { credentials: 'include' });
    setLoadingItems(false);
    if (!res.ok) {
      setItems([]);
      return;
    }
    setItems(await res.json());
  }

  async function fetchPlaylistItems(playlistId) {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/items`, { credentials: 'include' });
    if (!res.ok) return [];
    return res.json();
  }

  async function loadTierBoardData(category) {
    const tiers = tierGroups[category];
    const presentTiers = TIER_ORDER.filter((t) => tiers[t]);

    originalTierOfRef.current = {};
    originalTierItemsRef.current = {};
    setTierItems({});
    setTierLoading(Object.fromEntries(presentTiers.map((t) => [t, true])));

    await Promise.all(
      presentTiers.map(async (t) => {
        const fetched = await fetchPlaylistItems(tiers[t].id);
        fetched.forEach((v) => {
          if (!originalTierOfRef.current[v.videoId]) originalTierOfRef.current[v.videoId] = new Set();
          originalTierOfRef.current[v.videoId].add(t);
        });
        originalTierItemsRef.current[t] = fetched;
        setTierItems((prev) => ({ ...prev, [t]: fetched }));
        setTierLoading((prev) => ({ ...prev, [t]: false }));
      })
    );
  }

  async function openTierBoard(category, { push = true, replace = false } = {}) {
    setActiveView({ type: 'tierBoard', category });
    setMobileSidebarOpen(false);
    setSyncStatus('idle');
    setFocusedVideo(null);
    updateUrl(`/tier/${encodeURIComponent(category)}`, { push, replace });
    await loadTierBoardData(category);
  }

  function enterDuel(category, { push = true, replace = false } = {}) {
    setActiveView({ type: 'duel', category });
    setMobileSidebarOpen(false);
    setFocusedVideo(null);
    updateUrl(`/tier/${encodeURIComponent(category)}/duel`, { push, replace });
  }

  function backToTierBoard(category, { push = true } = {}) {
    setActiveView({ type: 'tierBoard', category });
    setMobileSidebarOpen(false);
    updateUrl(`/tier/${encodeURIComponent(category)}`, { push, replace: false });
  }

  function applyDuelResult(category, newTierItems) {
    setTierItems(newTierItems);
    backToTierBoard(category);
  }

  function selectPlaylists({ push = true } = {}) {
    setActiveView({ type: 'playlists' });
    setMobileSidebarOpen(false);
    setFocusedVideo(null);
    updateUrl('/', { push, replace: false });
  }

  function selectSettings({ push = true } = {}) {
    setActiveView({ type: 'settings' });
    setMobileSidebarOpen(false);
    setFocusedVideo(null);
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
    setDraggedVideoId(video.videoId);
  }

  function handleThumbDragEnd() {
    setDraggedVideoId(null);
    setDragOverTier(null);
  }

  function handleRowDragOver(e, tier) {
    e.preventDefault();
    if (dragOverTier !== tier) setDragOverTier(tier);
  }

  function handleRowDragLeave(tier) {
    setDragOverTier((prev) => (prev === tier ? null : prev));
  }

  // dropIndex omitted (null/undefined) means "append to the end of the target tier".
  function moveVideoToTier(fromTier, toTier, videoId, dropIndex) {
    setTierItems((prev) => {
      const sourceArr = prev[fromTier] || [];
      const video = sourceArr.find((v) => v.videoId === videoId);
      if (!video) return prev;

      if (fromTier === toTier) {
        if (dropIndex == null) return prev;
        const originalIndex = sourceArr.findIndex((v) => v.videoId === videoId);
        const withoutVideo = sourceArr.filter((v) => v.videoId !== videoId);
        let index = originalIndex < dropIndex ? dropIndex - 1 : dropIndex;
        index = Math.max(0, Math.min(index, withoutVideo.length));
        withoutVideo.splice(index, 0, video);
        return { ...prev, [fromTier]: withoutVideo };
      }

      const targetArr = [...(prev[toTier] || [])];
      const index = dropIndex == null ? targetArr.length : Math.max(0, Math.min(dropIndex, targetArr.length));
      targetArr.splice(index, 0, video);
      return {
        ...prev,
        [fromTier]: sourceArr.filter((v) => v.videoId !== videoId),
        [toTier]: targetArr,
      };
    });
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
    setDragOverTier(null);
    setDraggedVideoId(null);
    if (!videoId) return;
    moveVideoToTier(fromTier, toTier, videoId, dropIndex);
  }

  function openFocus(tier, videoId) {
    // Freeze the current tier-order sequence as this session's browsing
    // order, so later tier reassignments can't reshuffle where "next" goes.
    setFocusQueue(focusSequence.map((e) => e.video.videoId));
    setIsShuffling(false);
    setFocusedVideo({ tier, videoId });
  }

  function closeFocus() {
    setFocusedVideo(null);
    setFocusQueue(null);
    setIsShuffling(false);
  }

  function startShufflePlay() {
    if (focusSequence.length === 0) return;
    const ids = focusSequence.map((e) => e.video.videoId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setFocusQueue(ids);
    setIsShuffling(true);
    const first = videoLookup.get(ids[0]);
    setFocusedVideo({ tier: first.tier, videoId: first.video.videoId });
  }

  function navigateFocus(delta) {
    if (focusedSeqIndex < 0) return;
    const nextIndex = focusedSeqIndex + delta;
    if (nextIndex < 0 || nextIndex >= activeSequence.length) return;
    const entry = activeSequence[nextIndex];
    setFocusedVideo({ tier: entry.tier, videoId: entry.video.videoId });
  }

  function changeFocusedTier(newTier) {
    if (!focusedVideo || newTier === focusedVideo.tier) return;
    moveVideoToTier(focusedVideo.tier, newTier, focusedVideo.videoId, null);
    setFocusedVideo({ tier: newTier, videoId: focusedVideo.videoId });
  }

  function discardChanges() {
    setTierItems(JSON.parse(JSON.stringify(originalTierItemsRef.current)));
    setSyncStatus('idle');
  }

  async function syncChanges() {
    setSyncStatus('syncing');
    const category = activeView.category;
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
      setSyncStatus(finishedStatus);
      setTimeout(() => setSyncStatus('idle'), 2500);
    } catch {
      setSyncStatus('error');
    }
  }

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setLoggedIn(false);
    setPlaylists(null);
    setActiveView({ type: 'playlists' });
    setItems(null);
    setTierItems({});
    setTierLoading({});
    setSyncStatus('idle');
    setFocusedVideo(null);
    setPaletteOpen(false);
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
      <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
        Menu
      </button>

      <Sidebar
        query={query}
        onQueryChange={setQuery}
        tierCategories={tierCategories}
        playlistCount={playlists?.length ?? 0}
        activeView={activeView}
        onSelectTierBoard={openTierBoard}
        onSelectPlaylists={selectPlaylists}
        onSelectSettings={selectSettings}
        onLogout={logout}
        onOpenPalette={() => setPaletteOpen(true)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
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
        <VideoFocusModal
          video={focusedVideoData}
          currentTier={focusedVideo.tier}
          availableTiers={focusedAvailableTiers}
          hasPrev={focusedSeqIndex > 0}
          hasNext={focusedSeqIndex < activeSequence.length - 1}
          isShuffling={isShuffling}
          onClose={closeFocus}
          onPrev={() => navigateFocus(-1)}
          onNext={() => navigateFocus(1)}
          onChangeTier={changeFocusedTier}
        />
      )}

      {paletteOpen && (
        <CommandPalette items={commandItems} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
}
