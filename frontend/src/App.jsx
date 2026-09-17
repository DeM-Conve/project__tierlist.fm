import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = 'http://localhost:8080';

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

export default function App() {
  const [loggedIn, setLoggedIn] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [items, setItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);

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

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setLoggedIn(false);
    setPlaylists(null);
    setSelectedPlaylist(null);
    setItems(null);
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

        {loggedIn && !selectedPlaylist && (
          <section id="playlists-view">
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

        {loggedIn && selectedPlaylist && (
          <section id="items-view">
            <button id="back-btn" onClick={() => { setSelectedPlaylist(null); setItems(null); }}>
              &larr; Back to playlists
            </button>
            <h2>{selectedPlaylist.title}</h2>
            <div className="grid">
              {loadingItems && <p>Loading videos...</p>}
              {items?.length === 0 && !loadingItems && <p>No videos in this playlist.</p>}
              {items?.map((v) => (
                <VideoCard key={v.videoId} video={v} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
