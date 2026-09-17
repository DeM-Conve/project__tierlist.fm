export default function ItemsView({ playlist, items, loading }) {
  return (
    <section>
      <div className="canvas-header">
        <h1>{playlist?.title}</h1>
      </div>
      <div className="grid">
        {loading && <p className="hint-text">Loading videos...</p>}
        {items?.length === 0 && !loading && <p className="hint-text">No videos in this playlist.</p>}
        {items?.map((v) => (
          <div className="card video-card" key={v.videoId}>
            <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer">
              <img src={v.thumbnail || ''} alt={v.title} />
              <div className="card-body">
                <p className="card-title">{v.title}</p>
                <p className="card-meta">{v.channelTitle || ''}</p>
              </div>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
