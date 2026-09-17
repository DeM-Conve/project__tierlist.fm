import { useState } from 'react';
import { Button } from '@mantine/core';
import { Shuffle } from 'lucide-react';
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
  pendingRemovalKeys,
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
              {pendingRemovalKeys?.has(`${tier}:${v.videoId}`) && (
                <span
                  className="tier-thumb-duplicate-tag"
                  title="Also in a higher tier's playlist - this copy will be removed on sync"
                >
                  Removing (duplicate)
                </span>
              )}
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

function PendingChangesModal({ moves, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pending-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pending-panel-header">
          <h2>
            {moves.length} change{moves.length === 1 ? '' : 's'} staged
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <ul className="pending-list">
          {moves.map((m) => (
            <li key={`${m.kind}-${m.video.videoId}-${m.tier ?? m.to}`} className="pending-row">
              <span className="pending-title" title={m.video.title}>
                {m.video.title}
              </span>
              <span className="pending-tiers">
                {m.kind === 'dedupe' ? (
                  <>
                    <span className="tier-chip" style={{ background: TIER_COLORS[m.tier] }}>
                      {m.tier}
                    </span>
                    <span className="pending-arrow">→</span>
                    <span className="pending-remove-label">removed (duplicate)</span>
                  </>
                ) : (
                  <>
                    <span className="tier-chip" style={{ background: TIER_COLORS[m.from] }}>
                      {m.from}
                    </span>
                    <span className="pending-arrow">→</span>
                    <span className="tier-chip" style={{ background: TIER_COLORS[m.to] }}>
                      {m.to}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
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
  onStartDuel,
  onShufflePlay,
}) {
  const [showPending, setShowPending] = useState(false);
  const hasVideos = Object.values(tierItems).some((arr) => arr?.length > 0);
  const pendingRemovalKeys = new Set(
    pendingMoves.filter((m) => m.kind === 'dedupe').map((m) => `${m.tier}:${m.video.videoId}`)
  );

  return (
    <section>
      <div className="canvas-header tier-board-header">
        <div>
          <h1>{category}</h1>
          <p className="hint-text">Drag a video into another tier, then sync when you're ready.</p>
        </div>

        <div className="tier-board-actions">
          {pendingMoves.length > 0 && (
            <div className="sync-bar">
              <Button variant="subtle" onClick={() => setShowPending(true)}>
                {pendingMoves.length} pending
              </Button>
              {syncStatus === 'done' && <span className="sync-status sync-status-done">Synced</span>}
              {syncStatus === 'partial' && <span className="sync-status sync-status-error">Some failed</span>}
              {syncStatus === 'error' && <span className="sync-status sync-status-error">Sync failed</span>}
              <Button variant="default" onClick={onDiscard} disabled={syncStatus === 'syncing'}>
                Discard
              </Button>
              <Button onClick={onSync} disabled={syncStatus === 'syncing'} loading={syncStatus === 'syncing'}>
                Push to YouTube
              </Button>
            </div>
          )}
          <div className="tier-board-utility-actions">
            <Button
              variant="default"
              leftSection={<Shuffle size={15} />}
              onClick={onShufflePlay}
              disabled={!hasVideos}
            >
              Shuffle play
            </Button>
            <Button variant="default" onClick={onStartDuel}>
              Start duel
            </Button>
          </div>
        </div>
      </div>

      {showPending && (
        <PendingChangesModal moves={pendingMoves} onClose={() => setShowPending(false)} />
      )}

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
            pendingRemovalKeys={pendingRemovalKeys}
          />
        ))}
      </div>
    </section>
  );
}
