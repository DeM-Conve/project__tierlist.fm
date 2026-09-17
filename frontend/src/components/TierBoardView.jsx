import { useState } from 'react';
import { TIER_COLORS, TIER_ORDER } from '../tiers';

// Where among the existing thumbnails does clientX fall? Used so a drop
// lands where the cursor actually is, not always appended at the end.
function indexForClientX(container, clientX) {
  const thumbs = Array.from(container.querySelectorAll('.tier-thumb'));
  for (let i = 0; i < thumbs.length; i++) {
    const rect = thumbs[i].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return i;
  }
  return thumbs.length;
}

function TierRow({
  tier,
  items,
  loading,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbClick,
  draggedVideoId,
}) {
  const [overIndex, setOverIndex] = useState(null);

  function handleContentDragOver(e) {
    e.preventDefault();
    onDragOver(e);
    setOverIndex(indexForClientX(e.currentTarget, e.clientX));
  }

  function handleContentDragLeave(e) {
    onDragLeave(e);
    setOverIndex(null);
  }

  function handleContentDrop(e) {
    e.preventDefault();
    const dropIndex = indexForClientX(e.currentTarget, e.clientX);
    setOverIndex(null);
    onDrop(e, dropIndex);
  }

  return (
    <div className={`tier-row${isDragOver ? ' tier-row-dragover' : ''}`}>
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        <span>{tier}</span>
        {!loading && <span className="tier-count">{items?.length ?? 0}</span>}
      </div>
      <div
        className="tier-content"
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-block tier-thumb-skeleton" />
          ))}
        {!loading && items?.length === 0 && <p className="tier-empty">Drop videos here</p>}
        {items?.map((v, i) => (
          <div key={v.videoId} className="tier-thumb-wrap">
            {isDragOver && overIndex === i && <span className="drop-indicator" />}
            <div
              className={`tier-thumb${draggedVideoId === v.videoId ? ' tier-thumb-dragging' : ''}`}
              draggable
              onDragStart={(e) => onThumbDragStart(e, v, tier)}
              onDragEnd={onThumbDragEnd}
              onClick={() => onThumbClick(tier, v.videoId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onThumbClick(tier, v.videoId);
                }
              }}
              role="button"
              tabIndex={0}
              title={v.title}
            >
              <img src={v.thumbnail || ''} alt={v.title} draggable={false} />
              <a
                className="tier-thumb-link"
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open on YouTube"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
            </div>
          </div>
        ))}
        {isDragOver && overIndex === items?.length && <span className="drop-indicator" />}
      </div>
    </div>
  );
}

export default function TierBoardView({
  category,
  tierGroups,
  tierItems,
  tierLoading,
  dragOverTier,
  draggedVideoId,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbClick,
  pendingMoves,
  syncStatus,
  onDiscard,
  onSync,
}) {
  return (
    <section>
      <div className="canvas-header tier-board-header">
        <div>
          <h1>{category}</h1>
          <p className="hint-text">Drag a video into another tier, then sync when you're ready.</p>
        </div>

        {pendingMoves.length > 0 && (
          <div className="sync-controls">
            <span className="sync-count">
              {pendingMoves.length} pending
            </span>
            {syncStatus === 'done' && <span className="sync-status sync-status-done">Synced</span>}
            {syncStatus === 'partial' && <span className="sync-status sync-status-error">Some failed</span>}
            {syncStatus === 'error' && <span className="sync-status sync-status-error">Sync failed</span>}
            <button className="btn btn-ghost" onClick={onDiscard} disabled={syncStatus === 'syncing'}>
              Discard
            </button>
            <button className="btn btn-primary" onClick={onSync} disabled={syncStatus === 'syncing'}>
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync to YouTube'}
            </button>
          </div>
        )}
      </div>

      <div className="tier-board">
        {TIER_ORDER.filter((t) => tierGroups[category]?.[t]).map((t) => (
          <TierRow
            key={t}
            tier={t}
            items={tierItems[t]}
            loading={tierLoading[t]}
            isDragOver={dragOverTier === t}
            draggedVideoId={draggedVideoId}
            onDragOver={(e) => onRowDragOver(e, t)}
            onDragLeave={() => onRowDragLeave(t)}
            onDrop={(e, dropIndex) => onRowDrop(e, t, dropIndex)}
            onThumbDragStart={onThumbDragStart}
            onThumbDragEnd={onThumbDragEnd}
            onThumbClick={onThumbClick}
          />
        ))}
      </div>
    </section>
  );
}
