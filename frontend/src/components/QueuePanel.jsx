import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ActionIcon, Box, Group, Image, ScrollArea, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useMergedRef } from '@mantine/hooks';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Shuffle, X } from 'lucide-react';
import { EqualizerMark, TierChip } from './TierBits';
import { queueMove, queueSlot } from '../queueTimeline';

// A queue row is 6px + a 40px cover + 6px, plus a 2px gap below it. Exact,
// so only the playing song's row (which carries the "Up next" header) is
// measured.
export const QUEUE_ROW_SIZE = 54;
const CURRENT_ESTIMATE = QUEUE_ROW_SIZE + 40;
const OVERSCAN = 6;

// One queue row. The whole row is the drag handle; the cover is the play
// button (▶ on hover), and double-clicking the row plays it too - so a
// plain click-and-drag never starts a song by accident.
// Memoized: the queue can hold hundreds of songs.
const Row = memo(function Row({ entry, section, index, dimmed, isCurrent, onPlay, onRemove, dragging }) {
  const mine = entry.source === 'user' && !isCurrent;
  const play = isCurrent || !onPlay ? undefined : () => onPlay(section, index);
  return (
    <Group
      className="queue-row"
      gap={10}
      wrap="nowrap"
      px={6}
      py={6}
      pos="relative"
      bg={
        isCurrent
          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
          : dragging
            ? 'var(--surface-2)'
            : undefined
      }
      opacity={dimmed && !dragging ? 0.55 : 1}
      aria-current={isCurrent ? 'true' : undefined}
      onDoubleClick={play}
      style={{
        borderRadius: 8,
        cursor: isCurrent ? 'default' : dragging ? 'grabbing' : 'grab',
        boxShadow: dragging ? '0 10px 28px var(--shadow)' : undefined,
      }}
    >
      {/* A thin accent bar marks songs you queued yourself - "Add to
          queue" lands right after the last of them. */}
      {mine && <Box pos="absolute" left={0} top={10} bottom={10} w={3} bg="accent" style={{ borderRadius: 2 }} />}
      <UnstyledButton
        className="queue-thumb"
        onClick={play}
        aria-label={isCurrent ? 'Playing now' : `Play ${entry.video.title}`}
        pos="relative"
        style={{ flexShrink: 0, borderRadius: 6, cursor: isCurrent ? 'default' : 'pointer' }}
      >
        <Image src={entry.video.thumbnail} w={40} h={40} radius={6} fit="cover" alt="" />
        <Box
          className={isCurrent ? undefined : 'queue-thumb-play'}
          pos="absolute"
          inset={0}
          bg={isCurrent ? 'var(--overlay)' : 'var(--media-control-bg)'}
          c="var(--media-fg)"
          style={{ borderRadius: 6, display: 'grid', placeItems: 'center', opacity: isCurrent ? 1 : undefined }}
        >
          {isCurrent ? <EqualizerMark color="var(--media-fg)" height={12} /> : <Play size={16} fill="currentColor" />}
        </Box>
      </UnstyledButton>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text fz="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'accent' : undefined} truncate="end">
          {entry.video.title}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {entry.video.channelTitle}
        </Text>
      </Box>
      {entry.tier && <TierChip tier={entry.tier} size={20} />}
      {onRemove ? (
        <ActionIcon
          className="queue-row-remove"
          variant="subtle"
          color="gray"
          radius="xl"
          size={26}
          onClick={() => onRemove(entry.key)}
          aria-label="Remove from queue"
          title="Remove from queue"
        >
          <X size={14} />
        </ActionIcon>
      ) : (
        <Box w={26} style={{ flexShrink: 0 }} />
      )}
    </Group>
  );
});

// YouTube-Music-style queue: one timeline. What's been played (dimmed)
// above the playing song, then Up next - one list: songs you queued (Play
// next / Add to queue from anywhere, the same song as often as you like)
// followed by the rest of what you started. Drag any row anywhere,
// including a played song back down to hear it again; click a cover (or
// double-click a row) to play it. State lives in focusSlice.
//
// The whole timeline is ONE virtualized list (@tanstack/react-virtual) and
// one @hello-pangea/dnd Droppable in virtual mode: [...history, now,
// ...upcoming], so every song is in it (no "+N more") but only the rows on
// screen are rendered. The playing song is a drag-disabled row, so a drop
// above it lands in history and below it in Up next (queueTimeline.js).
export default function QueuePanel({ queue, current, onJump, onRemove, onMove, onShuffle }) {
  const { history, upcoming, contextLabel } = queue;
  const viewportRef = useRef(null);
  const H = history.length;
  const rows = useMemo(() => [...history, current, ...upcoming], [history, current, upcoming]);

  // Stable handlers for the memoized rows (the parent passes fresh ones).
  const latest = useRef(null);
  useLayoutEffect(() => {
    latest.current = { onJump, onRemove, historyLength: H };
  });
  const play = useCallback((section, index) => latest.current.onJump(section, index), []);
  const remove = useCallback((key) => latest.current.onRemove(key), []);

  // (No React Compiler in this app, so its "incompatible library" note on
  // useVirtualizer doesn't apply.)
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (i) => (i === H ? CURRENT_ESTIMATE : QUEUE_ROW_SIZE),
    overscan: OVERSCAN,
    getItemKey: (i) => (i === H ? 'now' : rows[i].key),
  });

  // Keep the playing song pinned near the top as the queue advances, with
  // a sliver of the last played song showing above it.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // Only when the playing song changes (not when a played row is removed),
    // so the history length is read through the ref.
    viewport.scrollTo({ top: Math.max(0, latest.current.historyLength * QUEUE_ROW_SIZE - 28), behavior: 'smooth' });
  }, [current.key, current.video.videoId]);

  function onDragEnd({ source, destination }) {
    if (!destination) return;
    const move = queueMove(H, source.index, destination.index);
    if (move) onMove(move.from, move.to);
  }

  return (
    <>
      <Group h={30} gap={8} wrap="nowrap" className="player-queue-head">
        <Text fz={11} fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
          Queue
        </Text>
        {contextLabel && (
          <Text fz="xs" c="dimmed" truncate="end" style={{ flex: 1, minWidth: 0 }}>
            Playing from <b>{contextLabel}</b>
          </Text>
        )}
        {upcoming.length > 1 && (
          <Tooltip label="Shuffle Up next" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onShuffle} aria-label="Shuffle Up next">
              <Shuffle size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable
          droppableId="queue"
          mode="virtual"
          // Rows scrolled out of view aren't rendered, so the dragged row is
          // drawn as a clone in <body> - it also follows the pointer exactly,
          // whatever the dock's own positioning.
          renderClone={(provided, snapshot, rubric) => (
            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
              <Row entry={rows[rubric.source.index]} dimmed={rubric.source.index < H} dragging />
            </div>
          )}
        >
          {(provided) => (
            <QueueViewport droppableRef={provided.innerRef} viewportRef={viewportRef} droppableProps={provided.droppableProps}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const isCurrent = item.index === H;
                  const entry = rows[item.index];
                  const slot = queueSlot(H, item.index);
                  return (
                    <Draggable
                      key={item.key}
                      draggableId={isCurrent ? `now:${entry.key}` : entry.key}
                      index={item.index}
                      isDragDisabled={isCurrent}
                    >
                      {(drag) => (
                        <div
                          ref={(el) => {
                            drag.innerRef(el);
                            if (el && isCurrent) virtualizer.measureElement(el);
                          }}
                          {...drag.draggableProps}
                          {...drag.dragHandleProps}
                          data-index={item.index}
                          style={{
                            ...drag.draggableProps.style,
                            position: 'absolute',
                            top: item.start,
                            left: 0,
                            width: '100%',
                            paddingBottom: 2,
                          }}
                        >
                          {isCurrent ? (
                            <NowAndUpNext current={entry} upcomingCount={upcoming.length} />
                          ) : (
                            <Row
                              entry={entry}
                              section={slot.section}
                              index={slot.index}
                              dimmed={slot.section === 'history'}
                              onPlay={play}
                              onRemove={remove}
                            />
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
              </div>
            </QueueViewport>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}

// The ScrollArea's viewport is both the virtualizer's scroll element and
// the Droppable (dnd's virtual lists want the scroll container as the
// droppable).
function QueueViewport({ droppableRef, viewportRef, droppableProps, children }) {
  const ref = useMergedRef(droppableRef, viewportRef);
  return (
    <ScrollArea
      viewportRef={ref}
      viewportProps={droppableProps}
      mt={8}
      style={{ flex: 1, minHeight: 0 }}
      type="hover"
      scrollbars="y"
      scrollbarSize={6}
      offsetScrollbars
    >
      {children}
    </ScrollArea>
  );
}

// The playing song, with the "Up next" heading (and the end-of-queue hint)
// under it - one row of the list, so it moves with the rest while dragging.
function NowAndUpNext({ current, upcomingCount }) {
  return (
    <>
      <Row entry={current} isCurrent />
      <Text fz={11} fw={800} tt="uppercase" c="dimmed" mt="md" mb={4} px={6} style={{ letterSpacing: 1 }}>
        Up next{upcomingCount > 0 ? ` · ${upcomingCount}` : ''}
      </Text>
      {upcomingCount === 0 && (
        <Text fz="xs" c="dimmed" px={6} py={10}>
          End of the queue. Use Play next / Add to queue in any song's ⋯ menu, or drag a played song back down here.
        </Text>
      )}
    </>
  );
}
