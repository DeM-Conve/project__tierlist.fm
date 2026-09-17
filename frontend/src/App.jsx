import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { TIER_COLORS, TIER_ORDER, groupByTier } from './tiers';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

function PlaylistCard({ playlist, onClick }) {
  return (
    <div className="card" onClick={onClick}>
      <img src={playlist.thumbnail || ''} alt={playlist.title} />
      <div className="card-body">
        <p className="card-title">{playlist.title}</p>
        <p className="card-meta">
          {playlist.itemCount} video{playlist.itemCount === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  );
}

function VideoCard({ video }) {
  return (
    <div className="card video-card">
      <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">
        <img src={video.thumbnail || ''} alt={video.title} />
        <div className="card-body">
          <p className="card-title">{video.title}</p>
          <p className="card-meta">{video.channelTitle || ''}</p>
        </div>
      </a>
    </div>
  );
}

function TierBoardCard({ category, tiers, onClick }) {
  const presentTiers = TIER_ORDER.filter((t) => tiers[t]);
  return (
    <div className="card tier-board-card" onClick={onClick}>
      <div className="card-body">
        <p className="card-title">{category}</p>
        <div className="tier-badges">
          {presentTiers.map((t) => (
            <span key={t} className="tier-badge" style={{ background: TIER_COLORS[t] }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TierRow({ tier, items, loading, isDragOver, onDragOver, onDragLeave, onDrop, onThumbDragStart, onThumbDragEnd, draggedVideoId }) {
  return (
    <div
      className={`tier-row${isDragOver ? ' tier-row-dragover' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        {tier}
      </div>
      <div className="tier-content">
        {loading && <p className="tier-loading">Loading...</p>}
        {!loading && items?.length === 0 && <p className="tier-loading">Drop videos here</p>}
        {items?.map((v) => (
          <div
            key={v.videoId}
            className={`tier-thumb${draggedVideoId === v.videoId ? ' tier-thumb-dragging' : ''}`}
            draggable
            onDragStart={(e) => onThumbDragStart(e, v, tier)}
            onDragEnd={onThumbDragEnd}
            title={v.title}
          >
            <img src={v.thumbnail || ''} alt={v.title} draggable={false} />
            <a
              className="tier-thumb-link"
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              ▶
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(null);
  const [playlists, setPlaylists] = useState(null);

  // view: 'playlists' | 'items' | 'tierBoard'
  const [view, setView] = useState('playlists');

  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [items, setItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [tierItems, setTierItems] = useState({});
  const [tierLoading, setTierLoading] = useState({});
  const [draggedVideoId, setDraggedVideoId] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | done | error

  const originalTierOfRef = useRef({});
  const originalTierItemsRef = useRef({});

  const tierGroups = useMemo(() => (playlists ? groupByTier(playlists) : {}), [playlists]);
  const tierCategories = Object.keys(tierGroups).sort();

  const pendingMoves = useMemo(() => {
    const moves = [];
    for (const tier of TIER_ORDER) {
      for (const video of tierItems[tier] || []) {
        const original = originalTierOfRef.current[video.videoId];
        if (original && original !== tier) {
          moves.push({ video, from: original, to: tier });
        }
      }
    }
    return moves;
  }, [tierItems]);

  useEffect(() => {
    checkAuth();
  }, []);

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

  async function loadItems(playlist) {
    setSelectedPlaylist(playlist);
    setView('items');
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

  async function openTierBoard(category) {
    setSelectedCategory(category);
    setView('tierBoard');
    setSyncStatus('idle');
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
          originalTierOfRef.current[v.videoId] = t;
        });
        originalTierItemsRef.current[t] = fetched;
        setTierItems((prev) => ({ ...prev, [t]: fetched }));
        setTierLoading((prev) => ({ ...prev, [t]: false }));
      })
    );
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

  function handleRowDrop(e, toTier) {
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
    if (!videoId || fromTier === toTier) return;

    setTierItems((prev) => {
      const video = prev[fromTier]?.find((v) => v.videoId === videoId);
      if (!video) return prev;
      return {
        ...prev,
        [fromTier]: prev[fromTier].filter((v) => v.videoId !== videoId),
        [toTier]: [...(prev[toTier] || []), video],
      };
    });
  }

  function discardChanges() {
    setTierItems(JSON.parse(JSON.stringify(originalTierItemsRef.current)));
    setSyncStatus('idle');
  }

  async function syncChanges() {
    setSyncStatus('syncing');
    const tiers = tierGroups[selectedCategory] || {};
    const payload = pendingMoves.map((m) => ({
      videoId: m.video.videoId,
      title: m.video.title,
      fromTier: m.from,
      toTier: m.to,
      fromPlaylistId: tiers[m.from]?.id,
      toPlaylistId: tiers[m.to]?.id,
    }));

    try {
      const res = await fetch(`${API_BASE}/api/tier-sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('sync failed');

      pendingMoves.forEach((m) => {
        originalTierOfRef.current[m.video.videoId] = m.to;
      });
      originalTierItemsRef.current = JSON.parse(JSON.stringify(tierItems));
      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 2500);
    } catch {
      setSyncStatus('error');
    }
  }

  function backToPlaylists() {
    setView('playlists');
    setSelectedPlaylist(null);
    setItems(null);
    setSelectedCategory(null);
    setTierItems({});
    setTierLoading({});
    setSyncStatus('idle');
  }

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setLoggedIn(false);
    setPlaylists(null);
    backToPlaylists();
  }

  return (
    <>
      <header>
        <h1>
          <span className="logo-dot" />
          My YouTube Playlists
        </h1>
        <div id="auth-area">
          {loggedIn && (
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          )}
        </div>
      </header>

      <main>
        {loggedIn === false && (
          <section id="login-view">
            <p>Sign in with your Google account to see your playlists.</p>
            <button className="btn btn-primary" onClick={login}>
              Login with Google
            </button>
          </section>
        )}

        {loggedIn === null && (
          <section id="login-view">
            <p>Loading...</p>
          </section>
        )}

        {loggedIn && view === 'playlists' && (
          <section id="playlists-view">
            {tierCategories.length > 0 && (
              <>
                <div className="section-header">
                  <h2>Tier Boards</h2>
                </div>
                <div className="grid">
                  {tierCategories.map((category) => (
                    <TierBoardCard
                      key={category}
                      category={category}
                      tiers={tierGroups[category]}
                      onClick={() => openTierBoard(category)}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="section-header">
              <h2>Your Playlists</h2>
            </div>
            <div className="grid">
              {playlists === null && <p className="hint-text">Loading playlists...</p>}
              {playlists?.length === 0 && <p className="hint-text">No playlists found.</p>}
              {playlists?.map((p) => (
                <PlaylistCard key={p.id} playlist={p} onClick={() => loadItems(p)} />
              ))}
            </div>
          </section>
        )}

        {loggedIn && view === 'items' && (
          <section id="items-view">
            <button className="btn btn-ghost back-btn" onClick={backToPlaylists}>
              &larr; Back to playlists
            </button>
            <h2>{selectedPlaylist?.title}</h2>
            <div className="grid">
              {loadingItems && <p className="hint-text">Loading videos...</p>}
              {items?.length === 0 && !loadingItems && <p className="hint-text">No videos in this playlist.</p>}
              {items?.map((v) => (
                <VideoCard key={v.videoId} video={v} />
              ))}
            </div>
          </section>
        )}

        {loggedIn && view === 'tierBoard' && (
          <section id="tier-board-view">
            <button className="btn btn-ghost back-btn" onClick={backToPlaylists}>
              &larr; Back to playlists
            </button>
            <h2>{selectedCategory}</h2>
            <p className="hint-text tier-hint">Drag a video into another tier to move it, then sync when you're ready.</p>
            <div className="tier-board">
              {TIER_ORDER.filter((t) => tierGroups[selectedCategory]?.[t]).map((t) => (
                <TierRow
                  key={t}
                  tier={t}
                  items={tierItems[t]}
                  loading={tierLoading[t]}
                  isDragOver={dragOverTier === t}
                  draggedVideoId={draggedVideoId}
                  onDragOver={(e) => handleRowDragOver(e, t)}
                  onDragLeave={() => handleRowDragLeave(t)}
                  onDrop={(e) => handleRowDrop(e, t)}
                  onThumbDragStart={handleThumbDragStart}
                  onThumbDragEnd={handleThumbDragEnd}
                />
              ))}
            </div>

            {pendingMoves.length > 0 && (
              <div className="sync-bar">
                <span className="sync-count">
                  {pendingMoves.length} change{pendingMoves.length === 1 ? '' : 's'} pending
                </span>
                <div className="sync-actions">
                  <button className="btn btn-ghost" onClick={discardChanges} disabled={syncStatus === 'syncing'}>
                    Discard
                  </button>
                  <button className="btn btn-primary" onClick={syncChanges} disabled={syncStatus === 'syncing'}>
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Sync to YouTube'}
                  </button>
                </div>
                {syncStatus === 'done' && <span className="sync-status sync-status-done">✓ Synced</span>}
                {syncStatus === 'error' && <span className="sync-status sync-status-error">✕ Sync failed</span>}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
