import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, Paper, Skeleton, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { ArrowUpRight, Shuffle } from 'lucide-react';
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
  searchActive,
  matchedKeys,
  activeMatchKey,
  onShufflePlay,
}) {
  const [overIndex, setOverIndex] = useState(null);
  // While a "/" search is active, a tier with hundreds of videos becomes
  // unusable if matches just get dimmed in place - you'd still have to
  // scroll through the whole row to find them. Filter down to only the
  // matches instead; the active-match highlight still shows which one n/N
  // is currently on.
  const visibleItems = searchActive
    ? items?.filter((v) => matchedKeys?.has(`${tier}:${v.videoId}`))
    : items;

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
        {!loading && (
          <span className="tier-count">
            {searchActive ? `${visibleItems?.length ?? 0}/${items?.length ?? 0}` : items?.length ?? 0}
          </span>
        )}
        {!loading && items?.length > 0 && (
          <Tooltip label={`Shuffle play ${tier}`}>
            <ActionIcon
              variant="subtle"
              color="dark"
              size="sm"
              className="tier-shuffle-btn"
              onClick={() => onShufflePlay(tier)}
              aria-label={`Shuffle play ${tier}`}
            >
              <Shuffle size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <div
        className={`tier-content${searchActive ? ' tier-content-search' : ''}`}
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="tier-thumb-skeleton" radius="sm" />
          ))}
        {!loading && !searchActive && items?.length === 0 && (
          <p className="tier-empty">Drop videos here</p>
        )}
        {!loading && searchActive && visibleItems?.length === 0 && (
          <p className="tier-empty">No matches in this tier</p>
        )}
        {!loading && visibleItems?.map((v, i) => {
          const key = `${tier}:${v.videoId}`;
          const isActiveMatch = activeMatchKey === key;
          return (
          <div key={v.videoId} className="tier-thumb-wrap">
            {isDragOver && overIndex === i && <span className="drop-indicator" />}
            <Card
              className={`tier-thumb${draggedVideoId === v.videoId ? ' tier-thumb-dragging' : ''}${
                searchActive ? ' tier-thumb-search-match' : ''
              }${isActiveMatch ? ' tier-thumb-search-active' : ''}`}
              data-video-id={v.videoId}
              data-tier={tier}
              padding={0}
              radius="sm"
              withBorder
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
              <Card.Section pos="relative">
                <img src={v.thumbnail || ''} alt={v.title} draggable={false} />
                {pendingRemovalKeys?.has(`${tier}:${v.videoId}`) && (
                  <Badge
                    color="yellow"
                    size="xs"
                    className="tier-thumb-duplicate-tag"
                    title="Also in a higher tier's playlist - this copy will be removed on sync"
                  >
                    Removing (duplicate)
                  </Badge>
                )}
                <ActionIcon
                  component="a"
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="filled"
                  color="dark"
                  size="sm"
                  className="tier-thumb-link"
                  title="Open on YouTube"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ArrowUpRight size={14} />
                </ActionIcon>
              </Card.Section>
              <Text size="xs" c="dimmed" truncate="end" px={8} py={6} title={v.title}>
                {v.title}
              </Text>
            </Card>
          </div>
          );
        })}
        {isDragOver && overIndex === visibleItems?.length && <span className="drop-indicator" />}
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

  // Vim-style "/" find: "/" opens it and is typed straight into the box as
  // the literal command-line prefix, the way vim's own "/" shows up in its
  // command line - deleting it (e.g. select-all + backspace) cancels the
  // search entirely rather than leaving a bare, unprefixed query active.
  // Enter (in the box) or n/N (once you've clicked away) step through
  // matches, Escape closes it. Each tier row filters down to just its
  // matches rather than merely highlighting them in place.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInputRef = useRef(null);

  const searchableEntries = useMemo(() => {
    const list = [];
    TIER_ORDER.forEach((t) => {
      if (!tierGroups[category]?.[t]) return;
      (tierItems[t] || []).forEach((video) => list.push({ tier: t, video }));
    });
    return list;
  }, [tierGroups, category, tierItems]);

  // The box's value is the literal vim command line - it always starts
  // with the "/" that opened it, and the real query is whatever follows.
  const queryText = searchQuery.slice(1);

  const matches = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    return searchableEntries.filter((e) => e.video.title.toLowerCase().includes(q));
  }, [searchableEntries, queryText]);

  function handleSearchChange(value) {
    if (!value.startsWith('/')) {
      // The leading "/" itself got deleted (e.g. select-all + backspace) -
      // same as vim, clearing the command line cancels the search outright
      // rather than leaving an unprefixed query active.
      setSearchOpen(false);
      setSearchQuery('');
      return;
    }
    setSearchQuery(value);
  }

  useEffect(() => {
    setMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const active = matches[matchIndex % matches.length];
    const el = document.querySelector(
      `[data-tier="${active.tier}"][data-video-id="${CSS.escape(active.video.videoId)}"]`
    );
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [matches, matchIndex]);

  useEffect(() => {
    function onKeyDown(e) {
      const active = document.activeElement;
      const inSearchBox = active === searchInputRef.current;
      const isTyping =
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        setSearchOpen(true);
        setSearchQuery('/');
        requestAnimationFrame(() => {
          const el = searchInputRef.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        });
        return;
      }
      // Shift+P pushes pending changes to YouTube - the same action the
      // command palette's "Sync ... to YouTube" entry runs, just reachable
      // without opening the palette. Requires Shift (checked via e.key
      // being the uppercase 'P') since a bare "p" was too easy to hit by
      // accident while browsing a board. Only fires when there's actually
      // something to push, matching the "Push to YouTube" button only
      // showing then.
      if (e.key === 'P' && !isTyping && pendingMoves.length > 0) {
        e.preventDefault();
        onSync();
        return;
      }
      if (!searchOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery('');
        searchInputRef.current?.blur();
        return;
      }
      if (e.key === 'Enter' && inSearchBox) {
        e.preventDefault();
        if (matches.length === 0) return;
        // A single match is unambiguous - Enter should just play it, the
        // same way a browser's own find-in-page jumps straight there
        // instead of making you cycle through a "1 of 1" result.
        if (matches.length === 1) {
          const only = matches[0];
          onThumbClick(only.tier, only.video.videoId);
          setSearchOpen(false);
          setSearchQuery('');
          searchInputRef.current?.blur();
          return;
        }
        setMatchIndex((i) => (e.shiftKey ? i - 1 + matches.length : i + 1) % matches.length);
        return;
      }
      if (!isTyping && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (matches.length === 0) return;
        setMatchIndex((i) => (e.key === 'N' ? i - 1 + matches.length : i + 1) % matches.length);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, matches, onThumbClick, pendingMoves, onSync]);

  const matchedKeys = useMemo(
    () => new Set(matches.map((e) => `${e.tier}:${e.video.videoId}`)),
    [matches]
  );
  const activeMatchKey =
    matches.length > 0 ? `${matches[matchIndex % matches.length].tier}:${matches[matchIndex % matches.length].video.videoId}` : null;

  return (
    <section>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" mb="sm">
        <Stack gap={2}>
          <Title order={1} fz={28} fw={800} lh={1.2}>
            {category}
          </Title>
          <Text c="dimmed" size="sm">
            Drag a video into another tier, then sync when you're ready.
          </Text>
        </Stack>

        <Group gap="md" wrap="wrap">
          {pendingMoves.length > 0 && (
            <Paper withBorder radius="sm" p={6}>
              <Group gap="xs">
                <Button variant="subtle" onClick={() => setShowPending(true)}>
                  {pendingMoves.length} pending
                </Button>
                {syncStatus === 'done' && (
                  <Badge color="teal" variant="light">
                    Synced
                  </Badge>
                )}
                {(syncStatus === 'partial' || syncStatus === 'error') && (
                  <Badge color="red" variant="light">
                    {syncStatus === 'partial' ? 'Some failed' : 'Sync failed'}
                  </Badge>
                )}
                <Button variant="default" onClick={onDiscard} disabled={syncStatus === 'syncing'}>
                  Discard
                </Button>
                <Button onClick={onSync} disabled={syncStatus === 'syncing'} loading={syncStatus === 'syncing'}>
                  Push to YouTube
                </Button>
              </Group>
            </Paper>
          )}
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<Shuffle size={15} />}
              onClick={() => onShufflePlay()}
              disabled={!hasVideos}
            >
              Shuffle play
            </Button>
            <Button variant="default" onClick={onStartDuel}>
              Start duel
            </Button>
          </Group>
        </Group>
      </Group>

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
            searchActive={queryText.trim().length > 0}
            matchedKeys={matchedKeys}
            activeMatchKey={activeMatchKey}
            onShufflePlay={onShufflePlay}
          />
        ))}
      </div>

      {searchOpen && (
        <Paper
          withBorder
          radius="sm"
          shadow="md"
          p={6}
          style={{
            position: 'fixed',
            left: 16,
            bottom: 'calc(16px + var(--player-dock-height))',
            zIndex: 60,
            width: 300,
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="/search titles..."
              size="xs"
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {matches.length > 0 ? `${(matchIndex % matches.length) + 1}/${matches.length}` : '0/0'}
            </Text>
          </Group>
        </Paper>
      )}
    </section>
  );
}
