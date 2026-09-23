import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Kbd,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ArrowDown, ArrowUp, CopyX, CloudUpload, Undo2 } from 'lucide-react';
import { TIER_COLORS, TIER_ORDER } from '../tiers';
import { selectPendingMoves } from '../store/selectors';
import { moveWithFeedback } from '../tierActions';
import { TierChip } from './TierBits';

// YouTube Data API cost of pushing: a move is playlistItems.insert +
// playlistItems.delete (50 each); removing a duplicate is one delete.
const QUOTA = { move: 100, dedupe: 50 };
const DAILY_QUOTA = 10000;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const rank = (tier) => TIER_ORDER.indexOf(tier);

function Stat({ icon: Icon, color, value, label }) {
  return (
    <Paper withBorder radius="md" px="sm" py={8} bg="var(--surface)" style={{ flex: 1, opacity: value ? 1 : 0.5 }}>
      <Group gap={8} wrap="nowrap">
        <ThemeIcon size={26} radius="xl" variant="light" color={color}>
          <Icon size={14} />
        </ThemeIcon>
        <div>
          <Text fz="lg" fw={800} lh={1}>
            {value}
          </Text>
          <Text fz={11} c="dimmed" tt="uppercase" fw={600} lts={0.4}>
            {label}
          </Text>
        </div>
      </Group>
    </Paper>
  );
}

function ChangeRow({ move, onRevert }) {
  const { video } = move;
  const promoted = move.kind === 'move' && rank(move.to) < rank(move.from);
  return (
    <Group gap="sm" wrap="nowrap" px="sm" py={6} className="review-row">
      <Image src={video.thumbnail || undefined} w={48} h={36} radius={4} fit="cover" alt="" />
      <Box miw={0} flex={1}>
        <Text fz="sm" fw={600} truncate="end" title={video.title}>
          {video.title}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {video.channelTitle || ' '}
        </Text>
      </Box>
      {move.kind === 'move' ? (
        <Group gap={6} wrap="nowrap" flex="none">
          <Text fz="xs" c="dimmed">
            from
          </Text>
          <TierChip tier={move.from} size={20} />
          <ThemeIcon size={20} radius="xl" variant="light" color={promoted ? 'teal' : 'orange'}>
            {promoted ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </ThemeIcon>
          <Tooltip label={`Put back in ${move.from}`} withArrow>
            <ActionIcon variant="subtle" color="gray" onClick={onRevert} aria-label={`Put back in ${move.from}`}>
              <Undo2 size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : (
        <Group gap={6} wrap="nowrap" flex="none">
          <Text fz="xs" c="dimmed">
            kept in
          </Text>
          <TierChip tier={move.keptTier} size={20} />
        </Group>
      )}
    </Group>
  );
}

// One block per destination - the board's own tier row look (colour spine +
// tier chip), so the review reads as "what your tier list will become".
function Section({ tier, title, moves, onRevert }) {
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group gap={0} wrap="nowrap" align="stretch">
        <Box w={4} bg={tier ? TIER_COLORS[tier] : 'var(--border)'} style={{ flexShrink: 0 }} />
        <Stack gap={0} flex={1} miw={0}>
          <Group gap={8} px="sm" pt={8} pb={4}>
            {title}
            <Text fz="xs" c="dimmed">
              {plural(moves.length, 'video')}
            </Text>
          </Group>
          {moves.map((m) => (
            <ChangeRow key={`${m.kind}-${m.video.videoId}-${m.tier ?? m.to}`} move={m} onRevert={() => onRevert(m)} />
          ))}
        </Stack>
      </Group>
    </Paper>
  );
}

function ReviewChangesModal({ opened, onClose, moves, category, syncStatus, onPush, onDiscard }) {
  const dispatch = useDispatch();
  const syncing = syncStatus === 'syncing';
  const moved = moves.filter((m) => m.kind === 'move');
  const removed = moves.filter((m) => m.kind === 'dedupe');
  const promoted = moved.filter((m) => rank(m.to) < rank(m.from)).length;
  const quota = moves.reduce((sum, m) => sum + QUOTA[m.kind], 0);

  useEffect(() => {
    if (opened && moves.length === 0) onClose(); // everything reverted / pushed
  }, [opened, moves.length, onClose]);

  const revert = (m) => dispatch(moveWithFeedback([{ fromTier: m.to, toTier: m.from, videoId: m.video.videoId }]));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={620}
      radius="lg"
      padding="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 3 }}
      title={
        <Stack gap={2}>
          <Text fz={11} fw={700} c="dimmed" tt="uppercase" lts={1}>
            Review · {category}
          </Text>
          <Title order={3} fw={900}>
            {plural(moves.length, 'change')} staged
          </Title>
        </Stack>
      }
    >
      <Stack gap="md">
        <Group gap="xs" wrap="nowrap">
          <Stat icon={ArrowUp} color="teal" value={promoted} label="Moved up" />
          <Stat icon={ArrowDown} color="orange" value={moved.length - promoted} label="Moved down" />
          <Stat icon={CopyX} color="red" value={removed.length} label="Duplicates" />
        </Group>

        <ScrollArea.Autosize mah="min(52vh, 460px)" offsetScrollbars="present" type="auto">
          <Stack gap="sm">
            {TIER_ORDER.map((tier) => {
              const into = moved.filter((m) => m.to === tier);
              return into.length ? (
                <Section
                  key={tier}
                  tier={tier}
                  moves={into}
                  onRevert={revert}
                  title={
                    <Group gap={6}>
                      <Text fz="sm" fw={700}>
                        Into
                      </Text>
                      <TierChip tier={tier} size={22} />
                    </Group>
                  }
                />
              ) : null;
            })}
            {removed.length > 0 && (
              <Section
                moves={removed}
                title={
                  <Text fz="sm" fw={700}>
                    Removed - duplicate of a higher tier
                  </Text>
                }
              />
            )}
          </Stack>
        </ScrollArea.Autosize>

        <Divider />
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Text fz="xs" c="dimmed" flex={1} miw={0}>
            Nothing is on YouTube yet. Pushing uses about {quota.toLocaleString()} of your{' '}
            {DAILY_QUOTA.toLocaleString()} daily API units.
          </Text>
          <Group gap="xs" wrap="nowrap" flex="none">
            <Button variant="subtle" color="red" onClick={onDiscard} disabled={syncing}>
              Discard all
            </Button>
            <Button
              leftSection={<CloudUpload size={16} />}
              rightSection={<Kbd size="xs">⇧P</Kbd>}
              onClick={onPush}
              loading={syncing}
            >
              Push to YouTube
            </Button>
          </Group>
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
        category={category}
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
