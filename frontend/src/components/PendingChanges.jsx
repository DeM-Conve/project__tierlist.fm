import { useCallback, useEffect, useState } from 'react';
import { tierName } from '../tierLabels';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import { ActionIcon, Badge, Box, Button, Group, Image, Kbd, Modal, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { useHotkeys, useMediaQuery } from '@mantine/hooks';
import { ArrowRight, Trash2, Undo2 } from 'lucide-react';
import { selectStagedChanges } from '../store/selectors';
import { cancelTransfer, moveWithFeedback } from '../tierActions';
import { songLabel } from '../tierUtils';
import { TierChip } from './TierBits';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const putBackLabel = (move) =>
  move.kind === 'transfer' ? `Keep in ${move.fromCategory} · ${tierName(move.fromTier)}` : `Put back in ${tierName(move.from)}`;

// One staged change: cover, song, and "from -> to" in tier chips. Moves can
// (and removals) can be put back individually; auto-resolved duplicates
// can't (by design).
function ChangeRow({ move, first, onRevert }) {
  const { song, artist } = songLabel(move.video);
  return (
    <Group gap="sm" wrap="nowrap" py="2xs" style={first ? undefined : { borderTop: '1px solid var(--border-soft)' }}>
      <Image src={move.video.thumbnail || undefined} w={40} h={40} radius={4} fit="cover" alt="" />
      <Box miw={0} flex={1}>
        <Text fz="sm" fw={600} truncate="end" title={move.video.title}>
          {song}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {move.kind === 'dedupe' ? `${artist} · duplicate copy` : artist}
        </Text>
      </Box>
      {move.kind === 'transfer' ? (
        // To another board: "Rock [T2] -> Nippo Normal [T3]".
        <Group gap="3xs" wrap="nowrap" flex="none" maw="55%">
          <Text fz="xs" c="dimmed" truncate="end" maw={110}>
            {move.fromCategory}
          </Text>
          <TierChip tier={move.fromTier} size={20} />
          <ArrowRight size={13} color="var(--text-faint)" />
          <Text fz="xs" fw={600} truncate="end" maw={110}>
            {move.toCategory}
          </Text>
          <TierChip tier={move.toTier} size={20} />
        </Group>
      ) : move.kind === 'move' ? (
        <Group gap="3xs" wrap="nowrap" flex="none">
          <TierChip tier={move.from} size={20} />
          <ArrowRight size={13} color="var(--text-faint)" />
          <TierChip tier={move.to} size={20} />
        </Group>
      ) : (
        // A deletion reads as a sentence: "Remove from [TODO] · already in
        // [A]" for a duplicate (so it's obvious nothing is lost), "Remove
        // from [B]" for a plain removal.
        <Tooltip
          label={
            move.kind === 'dedupe'
              ? `This song is in both ${tierName(move.tier)} and ${tierName(move.keptTier)} on YouTube. Pushing removes it from ${tierName(move.tier)} only - it stays in ${tierName(move.keptTier)}.`
              : `Pushing removes this song from ${tierName(move.from)}.`
          }
          withArrow
          multiline
          maw={260}
        >
          <Group gap="3xs" wrap="nowrap" flex="none">
            <Trash2 size={13} color="var(--mantine-color-red-filled)" />
            <Text fz="xs" c="red" fw={600}>
              Remove from
            </Text>
            <TierChip tier={move.kind === 'dedupe' ? move.tier : move.from} size={20} active={false} />
            {move.kind === 'dedupe' && (
              <>
                <Text fz="xs" c="dimmed" ml="4xs">
                  · already in
                </Text>
                <TierChip tier={move.keptTier} size={20} />
              </>
            )}
          </Group>
        </Tooltip>
      )}
      <Box w={28} flex="none">
        {move.kind !== 'dedupe' && (
          <Tooltip label={putBackLabel(move)} withArrow>
            <ActionIcon variant="subtle" color="gray" onClick={onRevert} aria-label={putBackLabel(move)}>
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

  const revert = (m) =>
    m.kind === 'transfer'
      ? dispatch(cancelTransfer(m))
      : dispatch(moveWithFeedback([{ fromTier: m.to, toTier: m.from, videoId: m.video.videoId }]));

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
              <ChangeRow key={`${m.kind}-${m.id ?? m.video.videoId}-${m.tier ?? m.to ?? m.toTier}`} move={m} first={i === 0} onRevert={() => revert(m)} />
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
  const moves = useSelector(selectStagedChanges);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const category = useSelector((s) => s.view.currentCategory);
  const [reviewOpen, setReviewOpen] = useState(false);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const compact = useMediaQuery('(max-width: 62em)');
  const count = moves.length;

  // Shift+P pushes (Mantine useHotkeys: exact modifiers, and it ignores
  // keys typed into inputs). Shift is required - a bare "p" was too easy to
  // hit by accident while browsing a board.
  useHotkeys([
    [
      'shift+P',
      (e) => {
        if (count === 0 || !category) return;
        e.preventDefault();
        syncChanges(category);
      },
      { preventDefault: false },
    ],
  ]);

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
          p="3xs"
          pl="md"
          className="anim-rise"
          bg="var(--surface-2)"
          style={{
            // Anchored to the Layout's body row (its nearest positioned
            // ancestor - the scrolling canvas isn't one), so it floats just
            // above the player dock without scrolling with the page.
            position: 'absolute',
            left: '50%',
            bottom: 20,
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
              <Button variant="subtle" color="gray" c="var(--text)" px="3xs" onClick={() => setReviewOpen(true)}>
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
