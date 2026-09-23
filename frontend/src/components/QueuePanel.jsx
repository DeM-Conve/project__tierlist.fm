import { useEffect, useRef } from 'react';
import { ActionIcon, Box, Group, Image, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Play, Shuffle, X } from 'lucide-react';
import { EqualizerMark, TierChip } from './TierBits';

// How many played / upcoming entries the panel renders around "now".
const HISTORY_SHOWN = 50;
const UPCOMING_SHOWN = 200;

// One queue row. The whole row is the drag handle; the cover is the play
// button (▶ on hover), and double-clicking the row plays it too - so a
// plain click-and-drag never starts a song by accident.
function Row({ entry, dimmed, isCurrent, onPlay, onRemove, dragging }) {
  const mine = entry.source === 'user' && !isCurrent;
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
      onDoubleClick={isCurrent ? undefined : onPlay}
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
        onClick={isCurrent ? undefined : onPlay}
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
          onClick={onRemove}
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
}

// A droppable run of rows: the played list or Up next. `offset` maps the
// rendered index back to the real one (the played list only renders its
// tail).
function DragList({ id, entries, offset = 0, dimmed, onPlay, onRemove, empty, more }) {
  return (
    <Droppable
      droppableId={id}
      // The clone is rendered in <body> so the dragged row follows the
      // pointer exactly, whatever the dock's own positioning.
      renderClone={(provided, snapshot, rubric) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
          <Row entry={entries[rubric.source.index]} dragging />
        </div>
      )}
    >
      {(provided, snapshot) => (
        <Box
          ref={provided.innerRef}
          {...provided.droppableProps}
          mih={entries.length === 0 ? 44 : undefined}
          style={{ borderRadius: 8, outline: snapshot.isDraggingOver ? '1px dashed var(--accent)' : undefined }}
        >
          {entries.length === 0 && !snapshot.isDraggingOver && empty}
          {entries.map((entry, i) => (
            <Draggable key={entry.key} draggableId={entry.key} index={i}>
              {(drag) => (
                <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                  <Row
                    entry={entry}
                    dimmed={dimmed}
                    onPlay={() => onPlay(id, offset + i)}
                    onRemove={() => onRemove(entry.key)}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
          {more}
        </Box>
      )}
    </Droppable>
  );
}

// YouTube-Music-style queue: one timeline. What's been played (dimmed)
// above the playing song, then Up next - one list: songs you queued (Play
// next / Add to queue from anywhere, the same song as often as you like)
// followed by the rest of what you started. Drag any row anywhere,
// including a played song back down to hear it again; click a cover (or
// double-click a row) to play it. State lives in focusSlice.
export default function QueuePanel({ queue, current, onJump, onRemove, onMove, onShuffle }) {
  const { history, upcoming, contextLabel } = queue;
  const viewportRef = useRef(null);
  const currentRef = useRef(null);
  const historyStart = Math.max(0, history.length - HISTORY_SHOWN);
  const shownHistory = history.slice(historyStart);
  const shownUpcoming = upcoming.slice(0, UPCOMING_SHOWN);

  // Keep the playing song pinned near the top as the queue advances, with
  // a sliver of the last played song showing above it.
  useEffect(() => {
    const viewport = viewportRef.current;
    const row = currentRef.current;
    if (!viewport || !row) return;
    const top = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTo({ top: Math.max(0, top - 28), behavior: 'smooth' });
  }, [current.key, current.video.videoId]);

  const realIndex = (section, index) => (section === 'history' ? historyStart + index : index);

  function onDragEnd({ source, destination }) {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    onMove(
      { section: source.droppableId, index: realIndex(source.droppableId, source.index) },
      { section: destination.droppableId, index: realIndex(destination.droppableId, destination.index) }
    );
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

      <ScrollArea viewportRef={viewportRef} mt={8} style={{ flex: 1, minHeight: 0 }} type="hover" scrollbarSize={6} offsetScrollbars>
        <DragDropContext onDragEnd={onDragEnd}>
          <Stack gap={2}>
            {historyStart > 0 && (
              <Text fz="xs" c="dimmed" ta="center" py={6}>
                {historyStart} earlier
              </Text>
            )}
            <DragList id="history" entries={shownHistory} offset={historyStart} dimmed onPlay={onJump} onRemove={onRemove} />

            <div ref={currentRef}>
              <Row entry={current} isCurrent />
            </div>

            <Text fz={11} fw={800} tt="uppercase" c="dimmed" mt="md" mb={4} px={6} style={{ letterSpacing: 1 }}>
              Up next{upcoming.length > 0 ? ` · ${upcoming.length}` : ''}
            </Text>
            <DragList
              id="upcoming"
              entries={shownUpcoming}
              onPlay={onJump}
              onRemove={onRemove}
              empty={
                <Text fz="xs" c="dimmed" px={6} py={10}>
                  End of the queue. Use Play next / Add to queue in any song's ⋯ menu, or drag a played song back down here.
                </Text>
              }
              more={
                upcoming.length > UPCOMING_SHOWN && (
                  <Text fz="xs" c="dimmed" ta="center" py={8}>
                    + {upcoming.length - UPCOMING_SHOWN} more
                  </Text>
                )
              }
            />
          </Stack>
        </DragDropContext>
      </ScrollArea>
    </>
  );
}
