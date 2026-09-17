function SkeletonCard() {
  return (
    <div className="card skeleton-card">
      <div className="skeleton-block" style={{ aspectRatio: '16/9' }} />
      <div className="card-body">
        <div className="skeleton-block skeleton-line" style={{ width: '80%' }} />
        <div className="skeleton-block skeleton-line" style={{ width: '40%' }} />
      </div>
    </div>
  );
}

export default function PlaylistsView({ playlists, query, onOpenPlaylist }) {
  const filtered = (playlists || []).filter((p) =>
    p.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <section>
      <div className="canvas-header">
        <h1>Playlists</h1>
      </div>

      <div className="grid">
        {playlists === null &&
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        {playlists?.length === 0 && <p className="hint-text">No playlists found.</p>}
        {playlists !== null && filtered.length === 0 && playlists.length > 0 && (
          <p className="hint-text">No playlists match "{query}".</p>
        )}
        {filtered.map((p) => (
          <div className="card" key={p.id} onClick={() => onOpenPlaylist(p)}>
            <img src={p.thumbnail || ''} alt={p.title} />
            <div className="card-body">
              <p className="card-title">{p.title}</p>
              <p className="card-meta">
                {p.itemCount} video{p.itemCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
