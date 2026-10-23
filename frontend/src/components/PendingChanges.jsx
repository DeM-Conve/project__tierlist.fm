import { useCallback, useEffect, useState } from 'react';
import { tierName } from '../tierLabels';
import { useDispatch, useSelector } from 'react-redux';
import { ActionIcon, Box, Button, Group, Image, Kbd, Modal, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { useHotkeys, useMediaQuery } from '@mantine/hooks';
import { AlertTriangle, ArrowRight, Trash2, Undo2 } from 'lucide-react';
import { selectBoardsChanges, selectStagedFailures } from '../store/selectors';
import { cancelTransfer, discardAll, discardBoard, moveWithFeedback } from '../tierActions';
import { useShellActions } from '../layout/shellActions';
import { songLabel } from '../tierUtils';
import { TierChip } from './TierBits';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const putBackLabel = (move) =>
  move.kind === 'transfer' ? `Keep in ${move.fromCategory} · ${tierName(move.fromTier)}` : `Put back in ${tierName(move.from)}`;

// A change's identity (the playlist item it acts on) - also what a push's
// failure reason is keyed by.
const changeKey = (m) => `${m.kind}-${m.id ?? m.video.id ?? m.video.videoId}-${m.tier ?? m.to ?? m.toTier}`;

// A change only the old copy's delete is left of: an auto-resolved
// duplicate, or a transfer a push already added to its new board.
const deleteOnly = (m) => m.kind === 'dedupe' || (m.kind === 'transfer' && m.inserted);

// Why the last push of a change failed, in words: which step, then the
// backend's own reason.
function failureText(move, { step, error }) {
  const where =
    move.kind === 'transfer'
      ? step === 'insert'
        ? `add it to ${move.toCategory} · ${tierName(move.toTier)}`
        : `remove it from ${move.fromCategory} · ${tierName(move.fromTier)}`
      : step === 'insert'
        ? `add it to ${tierName(move.to)}`
        : `remove it from ${tierName(move.kind === 'dedupe' ? move.tier : move.from)}`;
  const what = step ? `Couldn’t ${where}` : 'Push failed';
  return error ? `${what}: ${error}` : `${what}.`;
}

// One staged change: cover, song, and "from -> to" in tier chips. Moves can
// (and removals) can be put back individually; auto-resolved duplicates
// can't (by design). `failure`: why its last push failed, shown under it.
function ChangeRow({ move, first, onRevert, failure }) {
  const { song, artist } = songLabel(move.video);
  return (
    <Box py="2xs" style={first ? undefined : { borderTop: '1px solid var(--border-soft)' }}>
    <Group gap="sm" wrap="nowrap">
      <Image src={move.video.thumbnail || undefined} w={40} h={40} radius={4} fit="cover" alt="" />
      <Box miw={0} flex={1}>
        <Text fz="sm" fw={600} truncate="end" title={move.video.title}>
          {song}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {move.kind === 'dedupe' ? `${artist} · duplicate copy` : artist}
        </Text>
      </Box>
      {move.kind === 'transfer' && move.inserted ? (
        // Already added to the other board; only the old copy's delete is left.
        <Tooltip
          label={`Already in ${move.toCategory} · ${tierName(move.toTier)} on YouTube. Pushing removes the old copy from ${move.fromCategory} · ${tierName(move.fromTier)}.`}
          withArrow
          multiline
          maw={260}
        >
          <Group gap="3xs" wrap="nowrap" flex="none" maw="55%">
            <Trash2 size={13} color="var(--mantine-color-red-filled)" />
            <Text fz="xs" c="red" fw={600} truncate="end" maw={150}>
              Remove from {move.fromCategory}
            </Text>
            <TierChip tier={move.fromTier} size={20} active={false} />
          </Group>
        </Tooltip>
      ) : move.kind === 'transfer' ? (
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
        {!deleteOnly(move) && (
          <Tooltip label={putBackLabel(move)} withArrow>
            <ActionIcon variant="subtle" color="gray" onClick={onRevert} aria-label={putBackLabel(move)}>
              <Undo2 size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>
    </Group>
      {failure && (
        <Group gap="3xs" wrap="nowrap" align="flex-start" pl={52} pt="4xs">
          <AlertTriangle size={13} color="var(--mantine-color-red-filled)" style={{ flexShrink: 0, marginTop: 2 }} />
          <Text fz="xs" c="red" role="note">
            {failureText(move, failure)}
          </Text>
        </Group>
      )}
    </Box>
  );
}

// What the bar says: the user's own changes first ("3 changes on Rap",
// "5 changes on 2 boards"), then auto-staged duplicates apart ("1 duplicate
// to clean up") - a board with only those must not look like the user staged
// something.
function pendingSummary(groups, { compact = false } = {}) {
  const changes = groups.reduce((n, g) => n + g.changes.length, 0);
  const dedupes = groups.reduce((n, g) => n + g.dedupes.length, 0);
  const boards = groups.filter((g) => g.changes.length);
  const dupText = dedupes ? plural(dedupes, 'duplicate') + ' to clean up' : '';
  if (!changes) return { changes, dedupes, boards: groups.length, text: compact ? `${dedupes} to clean up` : dupText };
  if (compact) return { changes, dedupes, boards: boards.length, text: `${changes} staged` };
  const where = boards.length === 1 ? boards[0].category : `${boards.length} boards`;
  const text = `${plural(changes, 'change')} on ${where}${dupText ? ` · ${dupText}` : ''}`;
  return { changes, dedupes, boards: groups.length, text };
}

function ReviewChangesModal({ opened, onClose, groups, syncStatus, onPush }) {
  const dispatch = useDispatch();
  const failures = useSelector(selectStagedFailures);
  const failureOf = new Map(failures.map((f) => [changeKey(f), f.failure]));
  const syncing = syncStatus === 'syncing';
  const total = groups.reduce((n, g) => n + g.changes.length + g.dedupes.length, 0);

  useEffect(() => {
    if (opened && total === 0) onClose(); // everything put back / pushed
  }, [opened, total, onClose]);

  // A change is put back on its own board, open or not.
  const revert = (m, category) =>
    m.kind === 'transfer'
      ? dispatch(cancelTransfer(m))
      : dispatch(moveWithFeedback([{ fromTier: m.to, toTier: m.from, videoId: m.video.videoId }], { category }));

  const { text } = pendingSummary(groups);
  return (
    <Modal opened={opened} onClose={onClose} centered size={600} radius="lg" title={<Text fw={800}>{text} to push</Text>}>
      <Stack gap="md">
        <ScrollArea.Autosize mah="min(60vh, 520px)" offsetScrollbars="present" type="auto">
          <Stack gap="lg">
            {groups.map((g) => (
              // One board's changes: what you staged, then the duplicates the
              // app found on it (auto-staged), each with the board's Discard.
              <Box key={g.category} component="section" aria-label={`${g.category} changes`}>
                <Group justify="space-between" wrap="nowrap" gap="sm" pb="4xs" style={{ borderBottom: '1px solid var(--border)' }}>
                  <Box miw={0}>
                    <Text fw={700} fz="lg" truncate="end">
                      {g.category}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {[g.changes.length && plural(g.changes.length, 'change'), g.dedupes.length && `${plural(g.dedupes.length, 'duplicate')} to clean up`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Box>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => dispatch(discardBoard(g.category))}
                    disabled={syncing || !g.changes.length}
                    aria-label={`Discard changes on ${g.category}`}
                  >
                    Discard
                  </Button>
                </Group>
                <Stack gap={0}>
                  {g.changes.map((m, i) => (
                    <ChangeRow key={changeKey(m)} move={m} first={i === 0} onRevert={() => revert(m, g.category)} failure={failureOf.get(changeKey(m))} />
                  ))}
                </Stack>
                {g.dedupes.length > 0 && (
                  <>
                    <Text fz="xs" fw={700} c="dimmed" tt="uppercase" pt="2xs">
                      Duplicates to clean up (found by the app)
                    </Text>
                    <Stack gap={0}>
                      {g.dedupes.map((m, i) => (
                        <ChangeRow key={changeKey(m)} move={m} first={i === 0} failure={failureOf.get(changeKey(m))} />
                      ))}
                    </Stack>
                  </>
                )}
              </Box>
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => dispatch(discardAll())} disabled={syncing}>
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

// The one staged-changes bar, on every page (bottom-centre, above the mini
// player): every board's unpushed changes, wherever you are. Review lists
// them by board; Push sends every board's (each planned from its own draft);
// Discard drops them all. Also owns Shift+P. Hidden only on a duel matchup.
export default function PendingChanges() {
  const dispatch = useDispatch();
  const { pushAll } = useShellActions();
  const groups = useSelector(selectBoardsChanges);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const [reviewOpen, setReviewOpen] = useState(false);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const compact = useMediaQuery('(max-width: 62em)');
  const summary = pendingSummary(groups, { compact });
  const count = summary.changes + summary.dedupes;
  const failedCount = useSelector(selectStagedFailures).length;

  // Shift+P pushes (Mantine useHotkeys: exact modifiers, and it ignores
  // keys typed into inputs). Shift is required - a bare "p" was too easy to
  // hit by accident while browsing a board.
  useHotkeys([
    [
      'shift+P',
      (e) => {
        if (count === 0) return;
        e.preventDefault();
        pushAll?.();
      },
      { preventDefault: false },
    ],
  ]);

  const showBar = count > 0 || syncStatus === 'done' || syncStatus === 'partial' || syncStatus === 'error';

  return (
    <>
      <ReviewChangesModal opened={reviewOpen} onClose={closeReview} groups={groups} syncStatus={syncStatus} onPush={() => pushAll?.()} />
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
              bg={summary.changes > 0 ? 'accent' : count > 0 ? 'gray' : syncStatus === 'done' ? 'teal' : 'red'}
              style={{ borderRadius: '50%', flexShrink: 0 }}
            />
            {count > 0 ? (
              <Button variant="subtle" color="gray" c="var(--text)" px="3xs" onClick={() => setReviewOpen(true)}>
                {compact ? summary.text : `${summary.text} · review`}
              </Button>
            ) : (
              <Text size="sm" fw={600} pr="sm">
                {syncStatus === 'done' ? 'Synced to YouTube' : syncStatus === 'partial' ? 'Some changes failed' : 'Sync failed'}
              </Text>
            )}
            {failedCount > 0 && (
              // Stays until those changes are pushed, put back or discarded;
              // opens the review list, where each one says why.
              <Button variant="light" color="red" size="compact-sm" onClick={() => setReviewOpen(true)}>
                {failedCount} failed · why?
              </Button>
            )}
            {count > 0 && (
              <>
                <Button
                  variant="default"
                  size={compact ? 'xs' : 'sm'}
                  onClick={() => dispatch(discardAll())}
                  disabled={syncStatus === 'syncing'}
                >
                  {summary.boards > 1 ? 'Discard all' : 'Discard'}
                </Button>
                <Button
                  size={compact ? 'xs' : 'sm'}
                  onClick={() => pushAll?.()}
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
