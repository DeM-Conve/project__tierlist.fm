import { useEffect, useMemo, useState } from 'react';
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

function TierRow({ tier, items, loading }) {
  return (
    <div className="tier-row">
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        {tier}
      </div>
      <div className="tier-content">
        {loading && <p className="tier-loading">Loading...</p>}
        {!loading && items?.length === 0 && <p className="tier-loading">No videos</p>}
        {items?.map((v) => (
          <a
            key={v.videoId}
            className="tier-thumb"
            href={`https://www.youtube.com/watch?v=${v.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            title={v.title}
          >
            <img src={v.thumbnail || ''} alt={v.title} />
          </a>
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

  const tierGroups = useMemo(() => (playlists ? groupByTier(playlists) : {}), [playlists]);
  const tierCategories = Object.keys(tierGroups).sort();

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
    const tiers = tierGroups[category];
    const presentTiers = TIER_ORDER.filter((t) => tiers[t]);

    setTierItems({});
    setTierLoading(Object.fromEntries(presentTiers.map((t) => [t, true])));

    await Promise.all(
      presentTiers.map(async (t) => {
        const items = await fetchPlaylistItems(tiers[t].id);
        setTierItems((prev) => ({ ...prev, [t]: items }));
        setTierLoading((prev) => ({ ...prev, [t]: false }));
      })
    );
  }

  function backToPlaylists() {
    setView('playlists');
    setSelectedPlaylist(null);
    setItems(null);
    setSelectedCategory(null);
    setTierItems({});
    setTierLoading({});
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
        <h1>My YouTube Playlists</h1>
        <div id="auth-area">
          {loggedIn && <button onClick={logout}>Logout</button>}
        </div>
      </header>

      <main>
        {loggedIn === false && (
          <section id="login-view">
            <p>Sign in with your Google account to see your playlists.</p>
            <button onClick={login}>Login with Google</button>
          </section>
        )}

        {loggedIn && view === 'playlists' && (
          <section id="playlists-view">
            {tierCategories.length > 0 && (
              <>
                <div id="playlist-header">
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

            <div id="playlist-header">
              <h2>Your Playlists</h2>
            </div>
            <div className="grid">
              {playlists === null && <p>Loading playlists...</p>}
              {playlists?.length === 0 && <p>No playlists found.</p>}
              {playlists?.map((p) => (
                <PlaylistCard key={p.id} playlist={p} onClick={() => loadItems(p)} />
              ))}
            </div>
          </section>
        )}

        {loggedIn && view === 'items' && (
          <section id="items-view">
            <button id="back-btn" onClick={backToPlaylists}>
              &larr; Back to playlists
            </button>
            <h2>{selectedPlaylist?.title}</h2>
            <div className="grid">
              {loadingItems && <p>Loading videos...</p>}
              {items?.length === 0 && !loadingItems && <p>No videos in this playlist.</p>}
              {items?.map((v) => (
                <VideoCard key={v.videoId} video={v} />
              ))}
            </div>
          </section>
        )}

        {loggedIn && view === 'tierBoard' && (
          <section id="tier-board-view">
            <button id="back-btn" onClick={backToPlaylists}>
              &larr; Back to playlists
            </button>
            <h2>{selectedCategory}</h2>
            <div className="tier-board">
              {TIER_ORDER.filter((t) => tierGroups[selectedCategory]?.[t]).map((t) => (
                <TierRow key={t} tier={t} items={tierItems[t]} loading={tierLoading[t]} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
