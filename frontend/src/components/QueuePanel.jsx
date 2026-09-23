import { useEffect, useRef } from 'react';
import { ActionIcon, Box, Button, Group, Image, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { GripVertical, Shuffle, X } from 'lucide-react';
import { EqualizerMark, TierChip } from './TierBits';

// How many played / context entries the panel renders around "now". Your
// own queue (Up next) is always rendered in full.
const HISTORY_SHOWN = 50;
const CONTEXT_SHOWN = 150;

function Row({ entry, dimmed, isCurrent, onClick, onRemove, dragging, handleProps }) {
  return (
    <Group
      className="queue-row"
      gap={4}
      wrap="nowrap"
      pr={4}
      bg={
        isCurrent
          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
          : dragging
            ? 'var(--surface-2)'
            : undefined
      }
      opacity={dimmed ? 0.55 : 1}
      aria-current={isCurrent ? 'true' : undefined}
      style={{ borderRadius: 8, boxShadow: dragging ? '0 10px 28px var(--shadow)' : undefined }}
    >
      <UnstyledButton
        onClick={onClick}
        px={6}
        py={6}
        style={{ flex: 1, minWidth: 0, cursor: isCurrent ? 'default' : undefined }}
      >
        <Group gap={10} wrap="nowrap">
          <Box w={14} style={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
            {isCurrent && <EqualizerMark color="var(--accent)" height={11} />}
          </Box>
          <Image src={entry.video.thumbnail} w={40} h={40} radius={6} fit="cover" alt="" />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fz="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'accent' : undefined} truncate="end">
              {entry.video.title}
            </Text>
            <Text fz="xs" c="dimmed" truncate="end">
              {entry.video.channelTitle}
            </Text>
          </Box>
          {entry.tier && <TierChip tier={entry.tier} size={20} />}
        </Group>
      </UnstyledButton>
      {/* Drag handle on the right, like YouTube Music's. */}
      {handleProps && (
        <Box
          {...handleProps}
          className="queue-row-grip"
          c="dimmed"
          px={2}
          style={{ display: 'flex', cursor: 'grab', flexShrink: 0 }}
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </Box>
      )}
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

function SectionTitle({ children, right }) {
  return (
    <Group justify="space-between" wrap="nowrap" mt="md" mb={4} px={6}>
      <Text fz={11} fw={800} tt="uppercase" c="dimmed" truncate="end" style={{ letterSpacing: 1 }}>
        {children}
      </Text>
      {right}
    </Group>
  );
}

// One draggable section ("Up next" = your queue, "Next from <X>" = the rest
// of what you started). Rows can be dragged within and between the two.
function DragSection({ id, entries, limit, onJump, onRemove, empty }) {
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <Droppable
      droppableId={id}
      // The clone is rendered in <body> so the dragged row follows the
      // pointer exactly, whatever the dock's own positioning.
      renderClone={(provided, snapshot, rubric) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
          <Row entry={shown[rubric.source.index]} dragging handleProps={{}} />
        </div>
      )}
    >
      {(provided, snapshot) => (
        <Box
          ref={provided.innerRef}
          {...provided.droppableProps}
          mih={entries.length === 0 ? 44 : undefined}
          style={{
            borderRadius: 8,
            outline: snapshot.isDraggingOver ? '1px dashed var(--accent)' : undefined,
          }}
        >
          {entries.length === 0 && !snapshot.isDraggingOver && empty}
          {shown.map((entry, index) => (
            <Draggable key={entry.key} draggableId={entry.key} index={index}>
              {(dragProvided) => (
                <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                  <Row
                    entry={entry}
                    handleProps={dragProvided.dragHandleProps}
                    onClick={() => onJump(id, index)}
                    onRemove={() => onRemove(entry.key)}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
          {limit && entries.length > limit && (
            <Text fz="xs" c="dimmed" ta="center" py={8}>
              + {entries.length - limit} more
            </Text>
          )}
        </Box>
      )}
    </Droppable>
  );
}

// YouTube-Music-style queue: what's played (dimmed) above the playing song,
// then your own queue ("Up next": Play next / Add to queue from anywhere,
// the same song as often as you like), then the rest of what you started
// ("Next from Rap"). Drag rows to reorder or move them between the two;
// click any row to jump there. State lives in focusSlice.
export default function QueuePanel({ queue, current, onJump, onRemove, onMove, onClearUpNext, onShuffle }) {
  const { history, upNext, context, contextLabel } = queue;
  const viewportRef = useRef(null);
  const currentRef = useRef(null);
  const historyStart = Math.max(0, history.length - HISTORY_SHOWN);
  const shownHistory = history.slice(historyStart);
  const upcoming = upNext.length + context.length;

  // Keep the playing song pinned near the top as the queue advances, with
  // a sliver of the last played song showing above it.
  useEffect(() => {
    const viewport = viewportRef.current;
    const row = currentRef.current;
    if (!viewport || !row) return;
    const top = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTo({ top: Math.max(0, top - 28), behavior: 'smooth' });
  }, [current.key, current.video.videoId]);

  function onDragEnd({ source, destination }) {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    onMove({ section: source.droppableId, index: source.index }, { section: destination.droppableId, index: destination.index });
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
        {context.length > 1 && (
          <Tooltip label={`Shuffle what's next from ${contextLabel || 'this list'}`} withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onShuffle} aria-label="Shuffle upcoming songs">
              <Shuffle size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <ScrollArea viewportRef={viewportRef} mt={8} style={{ flex: 1, minHeight: 0 }} type="hover" scrollbarSize={6} offsetScrollbars>
        <Stack gap={2}>
          {historyStart > 0 && (
            <Text fz="xs" c="dimmed" ta="center" py={6}>
              {historyStart} earlier
            </Text>
          )}
          {shownHistory.map((entry, i) => (
            <Row
              key={entry.key}
              entry={entry}
              dimmed
              onClick={() => onJump('history', historyStart + i)}
              onRemove={() => onRemove(entry.key)}
            />
          ))}
          <div ref={currentRef}>
            <Row entry={current} isCurrent />
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <SectionTitle
              right={
                upNext.length > 0 && (
                  <Tooltip label="Remove every song you queued" withArrow>
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={onClearUpNext}>
                      Clear
                    </Button>
                  </Tooltip>
                )
              }
            >
              Up next{upNext.length > 0 ? ` · ${upNext.length}` : ''}
            </SectionTitle>
            <DragSection
              id="upNext"
              entries={upNext}
              onJump={onJump}
              onRemove={onRemove}
              empty={
                <Text fz="xs" c="dimmed" px={6} py={10}>
                  Use Play next / Add to queue in any song's ⋯ menu, or drag a song up here.
                </Text>
              }
            />

            {context.length > 0 && (
              <>
                <SectionTitle>Next from {contextLabel || 'this list'}</SectionTitle>
                <DragSection id="context" entries={context} limit={CONTEXT_SHOWN} onJump={onJump} onRemove={onRemove} />
              </>
            )}
          </DragDropContext>

          {upcoming === 0 && (
            <Text fz="xs" c="dimmed" ta="center" py={8}>
              End of the queue
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </>
  );
}
