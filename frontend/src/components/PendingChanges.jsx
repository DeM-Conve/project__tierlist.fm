import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import { ActionIcon, Badge, Box, Button, Group, Image, Kbd, Modal, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ArrowRight, Trash2, Undo2 } from 'lucide-react';
import { selectPendingMoves } from '../store/selectors';
import { moveWithFeedback } from '../tierActions';
import { songLabel } from '../tierUtils';
import { TierChip } from './TierBits';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One staged change: cover, song, and "from -> to" in tier chips. Moves can
// (and removals) can be put back individually; auto-resolved duplicates
// can't (by design).
function ChangeRow({ move, first, onRevert }) {
  const { song, artist } = songLabel(move.video);
  return (
    <Group gap="sm" wrap="nowrap" py={8} style={first ? undefined : { borderTop: '1px solid var(--border-soft)' }}>
      <Image src={move.video.thumbnail || undefined} w={40} h={40} radius={4} fit="cover" alt="" />
      <Box miw={0} flex={1}>
        <Text fz="sm" fw={600} truncate="end" title={move.video.title}>
          {song}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {move.kind === 'dedupe' ? `${artist} · duplicate` : artist}
        </Text>
      </Box>
      {move.kind === 'move' ? (
        <Group gap={6} wrap="nowrap" flex="none">
          <TierChip tier={move.from} size={20} />
          <ArrowRight size={13} color="var(--text-faint)" />
          <TierChip tier={move.to} size={20} />
        </Group>
      ) : (
        // A deletion names the exact copy going away (outlined chip) and,
        // for a duplicate, the tier that keeps the song (solid chip) - so
        // it's obvious nothing is lost.
        <Tooltip
          label={
            move.kind === 'dedupe'
              ? `On YouTube this song is in both ${move.tier} and ${move.keptTier}. Pushing deletes the ${move.tier} copy; it stays in ${move.keptTier}.`
              : `Pushing deletes this song from ${move.from}.`
          }
          withArrow
          multiline
          maw={260}
        >
          <Group gap={6} wrap="nowrap" flex="none">
            <Badge size="sm" variant="light" color="red" leftSection={<Trash2 size={11} />}>
              Delete
            </Badge>
            <TierChip tier={move.kind === 'dedupe' ? move.tier : move.from} size={20} active={false} />
            {move.kind === 'dedupe' && (
              <>
                <Text fz="xs" c="dimmed" ml={4}>
                  kept in
                </Text>
                <TierChip tier={move.keptTier} size={20} />
              </>
            )}
          </Group>
        </Tooltip>
      )}
      <Box w={28} flex="none">
        {move.kind !== 'dedupe' && (
          <Tooltip label={`Put back in ${move.from}`} withArrow>
            <ActionIcon variant="subtle" color="gray" onClick={onRevert} aria-label={`Put back in ${move.from}`}>
              <Undo2 size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>
    </Group>
  );
}

function ReviewChangesModal({ opened, onClose, moves, syncStatus, onPush, onDiscard }) {
  const dispatch = useDispatch();
  const syncing = syncStatus === 'syncing';

  useEffect(() => {
    if (opened && moves.length === 0) onClose(); // everything put back / pushed
  }, [opened, moves.length, onClose]);

  const revert = (m) => dispatch(moveWithFeedback([{ fromTier: m.to, toTier: m.from, videoId: m.video.videoId }]));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={560}
      radius="lg"
      title={<Text fw={800}>{plural(moves.length, 'change')} to push</Text>}
    >
      <Stack gap="md">
        <ScrollArea.Autosize mah="min(55vh, 480px)" offsetScrollbars="present" type="auto">
          <Stack gap={0}>
            {moves.map((m, i) => (
              <ChangeRow key={`${m.kind}-${m.video.videoId}-${m.tier ?? m.to}`} move={m} first={i === 0} onRevert={() => revert(m)} />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDiscard} disabled={syncing}>
            Discard all
          </Button>
          <Button onClick={onPush} loading={syncing} rightSection={<Kbd size="xs">⇧P</Kbd>}>
            Push to YouTube
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Floating "unsaved changes" bar, shown on every page of a board (tier
// list, tier focus, duel) - staged edits are the one thing that needs
// a decision, so they sit above everything (and above the mini player)
// instead of competing with page buttons. Also owns Shift+P, so the
// shortcut works on every one of those pages, not just the tier list.
export default function PendingChanges() {
  const { syncChanges, discardChanges } = useOutletContext();
  const moves = useSelector(selectPendingMoves);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const category = useSelector((s) => s.view.currentCategory);
  const [reviewOpen, setReviewOpen] = useState(false);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const compact = useMediaQuery('(max-width: 62em)');
  const count = moves.length;

  useEffect(() => {
    function onKeyDown(e) {
      const a = document.activeElement;
      const isTyping = a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA' || a?.isContentEditable;
      // Shift required (e.key is the uppercase 'P') - a bare "p" was too
      // easy to hit by accident while browsing a board.
      if (e.key === 'P' && !isTyping && count > 0 && category) {
        e.preventDefault();
        syncChanges(category);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, category, syncChanges]);

  const showBar = count > 0 || syncStatus === 'done' || syncStatus === 'partial' || syncStatus === 'error';

  return (
    <>
      <ReviewChangesModal
        opened={reviewOpen}
        onClose={closeReview}
        moves={moves}
        syncStatus={syncStatus}
        onPush={() => syncChanges(category)}
        onDiscard={discardChanges}
      />
      {showBar && (
        <Paper
          withBorder
          radius="md"
          shadow="xl"
          p={6}
          pl="md"
          className="anim-rise"
          bg="var(--surface-2)"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(20px + var(--player-dock-height))',
            translate: '-50% 0',
            zIndex: 60,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Group gap="sm" wrap="nowrap">
            <Box
              w={8}
              h={8}
              bg={count > 0 ? 'accent' : syncStatus === 'done' ? 'teal' : 'red'}
              style={{ borderRadius: '50%', flexShrink: 0 }}
            />
            {count > 0 ? (
              <Button variant="subtle" color="gray" c="var(--text)" px={6} onClick={() => setReviewOpen(true)}>
                {compact ? `${count} staged` : `${count} change${count === 1 ? '' : 's'} staged · review`}
              </Button>
            ) : (
              <Text size="sm" fw={600} pr="sm">
                {syncStatus === 'done' ? 'Synced to YouTube' : syncStatus === 'partial' ? 'Some changes failed' : 'Sync failed'}
              </Text>
            )}
            {syncStatus === 'partial' && count > 0 && (
              <Badge color="red" variant="light">
                Some failed
              </Badge>
            )}
            {syncStatus === 'error' && count > 0 && (
              <Badge color="red" variant="light">
                Sync failed
              </Badge>
            )}
            {count > 0 && (
              <>
                <Button
                  variant="default"
                  size={compact ? 'xs' : 'sm'}
                  onClick={discardChanges}
                  disabled={syncStatus === 'syncing'}
                >
                  Discard
                </Button>
                <Button
                  size={compact ? 'xs' : 'sm'}
                  onClick={() => syncChanges(category)}
                  disabled={syncStatus === 'syncing'}
                  loading={syncStatus === 'syncing'}
                  rightSection={compact ? null : <Kbd size="xs">⇧P</Kbd>}
                >
                  {compact ? 'Push' : 'Push to YouTube'}
                </Button>
              </>
            )}
          </Group>
        </Paper>
      )}
    </>
  );
}
