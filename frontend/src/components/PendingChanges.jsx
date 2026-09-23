import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import { Badge, Box, Button, Group, Kbd, Modal, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ArrowRight } from 'lucide-react';
import { TIER_COLORS } from '../tiers';
import { selectPendingMoves } from '../store/selectors';
import { TIER_INK } from '../tierUtils';

function PendingChangesModal({ opened, moves, onClose }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      title={
        <Text fw={800} fz="lg">
          {moves.length} change{moves.length === 1 ? '' : 's'} staged
        </Text>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Text size="sm" c="dimmed" mb="sm">
        Nothing has touched YouTube yet. Push to apply these, or discard to go back to what's on YouTube.
      </Text>
      <Stack gap={0}>
        {moves.map((m) => (
          <Group
            key={`${m.kind}-${m.video.videoId}-${m.tier ?? m.to}`}
            justify="space-between"
            wrap="nowrap"
            gap="md"
            py={9}
            style={{ borderBottom: '1px dashed var(--border-soft)' }}
          >
            <Text fz="sm" truncate="end" title={m.video.title}>
              {m.video.title}
            </Text>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Badge radius="sm" color={TIER_COLORS[m.kind === 'dedupe' ? m.tier : m.from]} c={TIER_INK}>
                {m.kind === 'dedupe' ? m.tier : m.from}
              </Badge>
              <ArrowRight size={13} color="var(--text-faint)" />
              {m.kind === 'dedupe' ? (
                <Text fz="xs" fw={600} c="red.5">
                  removed (duplicate)
                </Text>
              ) : (
                <Badge radius="sm" color={TIER_COLORS[m.to]} c={TIER_INK}>
                  {m.to}
                </Badge>
              )}
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}

// Floating "unsaved changes" bar, shown on every page of a board (tier
// list, tier focus, quick sort) - staged edits are the one thing that needs
// a decision, so they sit above everything (and above the mini player)
// instead of competing with page buttons. Also owns Shift+P, so the
// shortcut works on every one of those pages, not just the tier list.
export default function PendingChanges() {
  const { syncChanges, discardChanges } = useOutletContext();
  const moves = useSelector(selectPendingMoves);
  const syncStatus = useSelector((s) => s.tiers.syncStatus);
  const category = useSelector((s) => s.view.currentCategory);
  const [reviewOpen, setReviewOpen] = useState(false);
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
      <PendingChangesModal opened={reviewOpen} moves={moves} onClose={() => setReviewOpen(false)} />
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
