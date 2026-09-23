import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Image,
  Kbd,
  Paper,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { ArrowLeft, ArrowRight, Play, Undo2 } from 'lucide-react';
import { TIER_COLORS } from '../tiers';
import { moveWithFeedback, undoEdit } from '../tierActions';
import { minimizePlayer, openFocus, setFocusedVideo } from '../store/focusSlice';
import { selectFocusSequence } from '../store/selectors';
import { TierChip } from './TierBits';
import { TIER_INK } from '../tierUtils';

function tierOf(tierItems, videoId) {
  return Object.keys(tierItems).find((t) => tierItems[t]?.some((v) => v.videoId === videoId));
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Quick sort: the song plays (in the normal player dock, minimized), you hit
// 1-5 / click a tier, it files the song there and moves to the next one.
// The page follows the dock rather than owning playback, so the dock's own
// next/prev (h/l, arrows) and auto-advance-on-end all stay in step with it.
export default function QuickSortView({ category, tiers, initialScope, onBack }) {
  const dispatch = useDispatch();
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const focusSequence = useSelector(selectFocusSequence);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const focusQueue = useSelector((s) => s.focus.focusQueue);

  const [scope, setScope] = useState(initialScope && tiers.includes(initialScope) ? initialScope : 'all');
  const [order, setOrder] = useState('shuffle');
  const [session, setSession] = useState(null); // { queue, videos: Map, history: [] , done }

  const scopeCount = (s) => (s === 'all' ? tiers.reduce((n, t) => n + (tierItems[t]?.length ?? 0), 0) : tierItems[s]?.length ?? 0);

  const inSession = session && focusQueue === session.queue;
  const index = inSession && focusedVideo ? session.queue.indexOf(focusedVideo.videoId) : -1;
  const currentId = index >= 0 ? session.queue[index] : null;
  const current = currentId ? session.videos.get(currentId) : null;
  const currentTier = currentId ? tierOf(tierItems, currentId) : null;

  function start() {
    const pool = focusSequence.filter((e) => scope === 'all' || e.tier === scope);
    if (!pool.length) return;
    const ids = pool.map((e) => e.video.videoId);
    const queue = order === 'shuffle' ? shuffled(ids) : ids;
    const videos = new Map(pool.map((e) => [e.video.videoId, e.video]));
    setSession({ queue, videos, history: [], done: false });
    const first = pool.find((e) => e.video.videoId === queue[0]);
    dispatch(openFocus({ tier: first.tier, videoId: first.video.videoId, queue, entries: focusSequence, category }));
    dispatch(minimizePlayer());
  }

  function goTo(i) {
    if (i >= session.queue.length) {
      setSession((s) => ({ ...s, done: true }));
      return;
    }
    const id = session.queue[i];
    dispatch(setFocusedVideo({ tier: tierOf(tierItems, id), videoId: id }));
  }

  function rate(tier) {
    if (!currentId) return;
    const from = currentTier;
    if (tier !== from) {
      dispatch(moveWithFeedback([{ fromTier: from, toTier: tier, videoId: currentId }], { quiet: true }));
    }
    setSession((s) => ({ ...s, history: [...s.history, { videoId: currentId, from, to: tier, index }] }));
    goTo(index + 1);
  }

  function skip() {
    if (!currentId) return;
    setSession((s) => ({ ...s, history: [...s.history, { videoId: currentId, from: currentTier, to: currentTier, index, skipped: true }] }));
    goTo(index + 1);
  }

  function undo() {
    const last = session?.history.at(-1);
    if (!last) return;
    if (last.from !== last.to) dispatch(undoEdit({ silent: true }));
    setSession((s) => ({ ...s, history: s.history.slice(0, -1), done: false }));
    dispatch(setFocusedVideo({ tier: last.from, videoId: last.videoId }));
  }

  function resume() {
    const i = Math.min(session.history.length, session.queue.length - 1);
    const id = session.queue[i];
    dispatch(openFocus({ tier: tierOf(tierItems, id), videoId: id, queue: session.queue, entries: focusSequence, category }));
    dispatch(minimizePlayer());
  }

  useEffect(() => {
    function onKeyDown(e) {
      const a = document.activeElement;
      if (a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!session) {
        if (e.key === 'Enter') {
          e.preventDefault();
          start();
        }
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && !e.shiftKey && currentId) {
        const t = tiers[Number(digit[1]) - 1];
        if (t) {
          e.preventDefault();
          rate(t);
        }
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        undo();
      } else if (e.key === 's') {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const moved = useMemo(() => (session ? session.history.filter((h) => h.from !== h.to) : []), [session]);
  const upNext = session && index >= 0 ? session.queue.slice(index + 1, index + 4).map((id) => session.videos.get(id)) : [];

  // --- Setup -------------------------------------------------------------
  if (!session) {
    return (
      <Container size={640} className="quick-sort-view" py="xl">
        <UnstyledButton onClick={onBack} mb="lg">
          <Group gap={6} c="dimmed">
            <ArrowLeft size={14} />
            <Text fz="sm">{category} · tier list</Text>
          </Group>
        </UnstyledButton>
        <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
          Rank mode
        </Text>
        <Title order={1} fz={40} fw={900} mb="xs">
          Quick sort
        </Title>
        <Text c="dimmed" mb="xl">
          Each song plays. Press <Kbd size="xs">1</Kbd>–<Kbd size="xs">{tiers.length}</Kbd> or tap a tier to file it,
          and the next one starts. Your changes are staged like any other edit - nothing reaches YouTube until you push.
        </Text>

        <Stack gap="lg">
          <div>
            <Text fw={600} mb={6}>Songs to sort</Text>
            <SegmentedControl
              fullWidth
              value={scope}
              onChange={setScope}
              data={[
                { value: 'all', label: `Whole board · ${scopeCount('all')}` },
                ...tiers.map((t) => ({ value: t, label: `${t} · ${scopeCount(t)}` })),
              ]}
            />
          </div>
          <div>
            <Text fw={600} mb={6}>Order</Text>
            <SegmentedControl
              value={order}
              onChange={setOrder}
              data={[
                { value: 'shuffle', label: 'Shuffled' },
                { value: 'inOrder', label: 'Top to bottom' },
              ]}
            />
          </div>
          <Group>
            <Button size="md" leftSection={<Play size={16} fill="currentColor" />} onClick={start} disabled={!scopeCount(scope)} rightSection={<Kbd size="xs">↵</Kbd>}>
              Start sorting
            </Button>
          </Group>
        </Stack>
      </Container>
    );
  }

  // --- Done --------------------------------------------------------------
  if (session.done) {
    return (
      <Container size={640} className="quick-sort-view" py="xl" ta="center">
        <Title order={1} fz={36} fw={900} mb="xs">
          Sorted {session.history.length} songs
        </Title>
        <Text c="dimmed" mb="lg">
          {moved.length === 0 ? 'Everything stayed where it was.' : `${moved.length} changed tier - they're staged below, ready to push.`}
        </Text>
        <Stack gap={6} mb="xl" ta="left">
          {moved.map((m) => (
            <Group key={m.videoId} justify="space-between" wrap="nowrap">
              <Text fz="sm" truncate="end">{session.videos.get(m.videoId)?.title}</Text>
              <Group gap={6} wrap="nowrap">
                <TierChip tier={m.from} size={22} />
                <ArrowRight size={12} />
                <TierChip tier={m.to} size={22} />
              </Group>
            </Group>
          ))}
        </Stack>
        <Group justify="center">
          <Button variant="default" leftSection={<Undo2 size={15} />} onClick={undo}>
            Undo last
          </Button>
          <Button variant="default" onClick={() => setSession(null)}>
            Sort more
          </Button>
          <Button onClick={onBack}>Back to tier list</Button>
        </Group>
      </Container>
    );
  }

  // --- Session -----------------------------------------------------------
  const pct = Math.round((session.history.length / session.queue.length) * 100);
  const glow = currentTier ? TIER_COLORS[currentTier] : 'var(--accent)';

  return (
    <Container size={900} className="quick-sort-view" py="md">
      <Group justify="space-between" mb="lg" wrap="nowrap">
        <UnstyledButton onClick={onBack}>
          <Group gap={6} c="dimmed">
            <ArrowLeft size={14} />
            <Text fz="sm">End session</Text>
          </Group>
        </UnstyledButton>
        <Stack gap={4} style={{ flex: 1, maxWidth: 360 }}>
          <Group justify="space-between">
            <Text fz="xs" c="dimmed" fw={600}>
              {session.history.length} of {session.queue.length} sorted
            </Text>
            <Text fz="xs" c="dimmed" fw={600}>
              {moved.length} moved
            </Text>
          </Group>
          <Progress value={pct} size="sm" radius="xl" />
        </Stack>
      </Group>

      {!current ? (
        <Stack align="center" py={80} gap="md">
          <Text c="dimmed">The player was stopped or moved on to something else.</Text>
          <Button onClick={resume} leftSection={<Play size={15} fill="currentColor" />}>
            Resume at song {Math.min(session.history.length + 1, session.queue.length)}
          </Button>
        </Stack>
      ) : (
        <Stack align="center" gap="lg">
          <Box
            style={{
              borderRadius: 16,
              boxShadow: `0 30px 90px -20px color-mix(in srgb, ${glow} 60%, transparent)`,
              transition: 'box-shadow 300ms ease',
            }}
          >
            <Image src={current.thumbnail} w={260} h={260} radius={16} fit="cover" alt="" />
          </Box>
          <Stack gap={4} align="center" maw={620}>
            <Title order={2} fz={24} ta="center" lineClamp={2}>
              {current.title}
            </Title>
            <Group gap={8}>
              <Text c="dimmed" fz="sm">{current.channelTitle}</Text>
              {currentTier && (
                <Badge radius="sm" color={TIER_COLORS[currentTier]} c={TIER_INK}>
                  now {currentTier}
                </Badge>
              )}
            </Group>
          </Stack>

          <Group gap="sm" justify="center" wrap="wrap">
            {tiers.map((t, i) => {
              const isCurrent = t === currentTier;
              return (
                <UnstyledButton
                  key={t}
                  onClick={() => rate(t)}
                  className="sort-tier-btn"
                  w={110}
                  h={92}
                  bg={TIER_COLORS[t]}
                  aria-label={isCurrent ? `Keep in ${t}` : `Move to ${t}`}
                  style={{
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: isCurrent ? '3px solid var(--text)' : undefined,
                    outlineOffset: 3,
                  }}
                >
                  <Text ff="var(--font-display)" fw={900} fz={30} lh={1} c={TIER_INK}>
                    {t}
                  </Text>
                  <Text fz={11} fw={700} c={TIER_INK} opacity={0.7} mt={4}>
                    {isCurrent ? 'keep' : 'press'} {i + 1}
                  </Text>
                </UnstyledButton>
              );
            })}
          </Group>

          <Group gap="sm">
            <Button variant="default" leftSection={<Undo2 size={15} />} onClick={undo} disabled={!session.history.length} rightSection={<Kbd size="xs">U</Kbd>}>
              Undo
            </Button>
            <Button variant="default" rightSection={<Kbd size="xs">S</Kbd>} onClick={skip}>
              Skip
            </Button>
          </Group>

          {upNext.length > 0 && (
            <Paper withBorder radius="md" p="sm" w="100%" maw={620} bg="var(--surface)">
              <Text fz={11} fw={800} tt="uppercase" c="dimmed" mb={6} style={{ letterSpacing: 1 }}>
                Up next
              </Text>
              <Stack gap={6}>
                {upNext.map((v) => (
                  <Group key={v.videoId} gap="sm" wrap="nowrap">
                    <Image src={v.thumbnail} w={32} h={32} radius={4} fit="cover" alt="" />
                    <Text fz="sm" truncate="end" style={{ flex: 1 }}>{v.title}</Text>
                    {tierOf(tierItems, v.videoId) && <TierChip tier={tierOf(tierItems, v.videoId)} size={20} />}
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </Container>
  );
}
