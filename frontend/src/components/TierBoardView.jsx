import { TIER_COLORS, TIER_ORDER } from '../tiers';

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
  draggedVideoId,
}) {
  return (
    <div
      className={`tier-row${isDragOver ? ' tier-row-dragover' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        <span>{tier}</span>
        {!loading && <span className="tier-count">{items?.length ?? 0}</span>}
      </div>
      <div className="tier-content">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-block tier-thumb-skeleton" />
          ))}
        {!loading && items?.length === 0 && <p className="tier-empty">Drop videos here</p>}
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
            onDrop={(e) => onRowDrop(e, t)}
            onThumbDragStart={onThumbDragStart}
            onThumbDragEnd={onThumbDragEnd}
          />
        ))}
      </div>
    </section>
  );
}
