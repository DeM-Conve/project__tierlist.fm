import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useHover } from '@mantine/hooks';
import {
  Accordion, Alert, Anchor, Badge, Box, Button, Checkbox, Chip, Container, Group, Kbd, Paper, Progress, Skeleton, Stack, Table, Text,
  ThemeIcon, Title, UnstyledButton,
} from '@mantine/core';
import { ArrowDown, ArrowUp, Hourglass, Play, Square, Swords } from 'lucide-react';
import { useTierName } from '../../tierLabels';
import { TIER_ORDER } from '../../tiers';
import { TierChip } from '../TierBits';
import EmbeddedPlayer from '../EmbeddedPlayer';
import { useDuelAnalysisQuery, useStartDuelMutation } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { leaningConfidence, leaningText, moveKind, orderChanges, pct, record, shortfallText } from '../../duel/duelText';
import { ProbabilityBars, ScoreTrend, SectionLabel, SongArt } from './DuelBits';
import PageHeader from '../PageHeader';
import { SECTION_GAP } from '../../layout/spacing';

// One suggested move: song, from -> to, confidence, Move / Keep (or what was decided, with Undo).
// The whole row is one click target: an UnstyledButton stretched over it
// (the "stretched link" pattern - no button inside a button), with the
// Keep / Move buttons raised above it so they still work on their own.
export function MoveRow({ s, board, selected, decided, onSelect, onMove, onKeep, onUndo, detail }) {
  const tierName = useTierName();
  const { hovered, ref } = useHover();
  return (
    <Group
      ref={ref}
      wrap="wrap"
      gap="md"
      px="lg"
      py="sm"
      pos="relative"
      data-selected={selected || undefined}
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--surface-2)' : hovered ? 'var(--mantine-color-default-hover)' : undefined,
        boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
      }}
    >
      <UnstyledButton onClick={onSelect} pos="absolute" inset={0} aria-label={`Show evidence for ${board.nameOf(s.song)}`} />
      <Box style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Group gap="md" wrap="nowrap">
          <SongArt video={board.videoOf(s.song)} />
          <Box miw={0}>
            <Text fw={700} truncate="end">{board.nameOf(s.song)}</Text>
            <Text fz="md" c="dimmed" truncate="end">
              {board.artistOf(s.song)} · {detail ?? `${record(s)} (W–L–D)`}
            </Text>
          </Box>
        </Group>
      </Box>
      <Group gap="2xs" w={130} wrap="nowrap">
        <TierChip tier={s.from} size={20} />
        <Text c="dimmed">→</Text>
        <TierChip tier={s.to} size={20} />
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Box h={6} style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
          <Box h="100%" w={pct(s.confidence)} style={{ background: 'var(--accent)' }} />
        </Box>
        <Text ff="monospace" fz="md">{pct(s.confidence)}</Text>
      </Group>
      {decided ? (
        <Group gap="xs" miw={150} pos="relative" style={{ zIndex: 1 }}>
          <Text fz="md" fw={700} c={decided === 'move' ? 'accent' : 'dimmed'}>
            {decided === 'move' ? `Moved to ${tierName(s.to)}` : `Kept in ${tierName(s.from)}`}
          </Text>
          <Anchor component="button" fz="md" c="dimmed" onClick={onUndo}>Undo</Anchor>
        </Group>
      ) : (
        <Group gap="3xs" miw={150} pos="relative" style={{ zIndex: 1 }}>
          <Button variant="default" onClick={onKeep}>Keep</Button>
          <Button onClick={onMove}>Move</Button>
        </Group>
      )}
    </Group>
  );
}

// A move the engine leans towards but isn't sure of. Deliberately not a
// MoveRow: dimmed, no selection bar, a neutral bar instead of the accent and
// only quiet actions - duel it more (the useful one) or move it anyway.
function LeaningRow({ s, board, decided, onDuel, onMove, onUndo, starting }) {
  const tierName = useTierName();
  const others = (s.unmet ?? []).filter((u) => u.kind !== 'CONFIDENCE').map(shortfallText);
  return (
    <Group wrap="wrap" gap="md" px="lg" py="xs" data-testid="leaning-row" style={{ borderTop: '1px solid var(--border-soft)' }}>
      <Group gap="md" wrap="nowrap" style={{ flex: '1 1 260px', minWidth: 0, opacity: 0.75 }}>
        <SongArt video={board.videoOf(s.song)} size={32} />
        <Box miw={0}>
          <Text fz="md" truncate="end">{board.nameOf(s.song)}</Text>
          <Text fz="sm" c="dimmed" truncate="end">
            {board.artistOf(s.song)} · {others.length ? others.join(' · ') : `${record(s)} (W–L–D)`}
          </Text>
        </Box>
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap" style={{ opacity: 0.75 }} aria-label={`Leaning ${tierName(s.from)} to ${tierName(s.to)}`}>
        <TierChip tier={s.from} size={18} />
        <Text c="dimmed">→</Text>
        <TierChip tier={s.to} size={18} />
      </Group>
      <Stack gap="4xs" w={130}>
        <Text fz="sm" c="dimmed">{leaningConfidence(s)}</Text>
        <Progress value={Math.round(s.confidence * 100)} size={3} color="var(--text-faint)" aria-label="Confidence" />
      </Stack>
      {decided ? (
        <Group gap="xs" miw={190}>
          <Text fz="md" c="dimmed">{decided === 'move' ? `Moved to ${tierName(s.to)}` : `Kept in ${tierName(s.from)}`}</Text>
          <Anchor component="button" fz="md" c="dimmed" onClick={onUndo}>Undo</Anchor>
        </Group>
      ) : (
        <Group gap="4xs" miw={190} wrap="nowrap">
          <Button variant="subtle" color="gray" size="compact-sm" onClick={onMove}>Move anyway</Button>
          <Button variant="subtle" color="gray" size="compact-sm" leftSection={<Swords size={14} />} onClick={onDuel} disabled={starting}>
            {s.from === 'TODO' ? 'Duel to-do songs' : 'Duel this song'}
          </Button>
        </Group>
      )}
    </Group>
  );
}

// No move is sure enough yet: say so, name the closest, send them to duel.
function NothingReady({ closest, board, base }) {
  const tierName = useTierName();
  return (
    <Paper withBorder radius="lg" p="lg">
      <Group gap="md" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color="gray" size={36} radius="md"><Hourglass size={18} /></ThemeIcon>
        <Stack gap="2xs" style={{ flex: 1 }} miw={0}>
          <Text fw={700}>{closest ? 'Nothing is sure enough to move yet' : 'No moves to review'}</Text>
          <Text fz="md" c="dimmed">
            {closest
              ? `Closest: ${board.nameOf(closest.song)} - ${leaningText(closest, tierName)}.`
              : 'Duel more and the strongest cases show up here.'}
          </Text>
        </Stack>
        <Button component={Link} to={`${base}/duel`} leftSection={<Swords size={16} />} style={{ flexShrink: 0 }}>Duel more</Button>
      </Group>
    </Paper>
  );
}

// MoveRow's exact shape (same Group, paddings and column widths) with
// Skeleton blocks for the song, the tier change, the bar and the buttons.
function MoveRowSkeleton() {
  return (
    <Group wrap="wrap" gap="md" px="lg" py="sm" style={{ borderBottom: '1px solid var(--border)' }} data-testid="move-row-skeleton">
      <Group gap="md" wrap="nowrap" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Skeleton w={44} h={44} radius="sm" style={{ flexShrink: 0 }} />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Skeleton h={12} w="55%" />
          <Skeleton h={10} w="35%" />
        </Stack>
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Skeleton w={20} h={20} radius={4} />
        <Text c="dimmed">→</Text>
        <Skeleton w={20} h={20} radius={4} />
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Skeleton h={6} style={{ flex: 1 }} />
        <Skeleton h={10} w={30} />
      </Group>
      <Group gap="3xs" miw={150}>
        <Skeleton h={36} w={68} radius="sm" />
        <Skeleton h={36} w={64} radius="sm" />
      </Group>
    </Group>
  );
}

// The evidence panel's sections (real labels) with Skeleton content.
function EvidenceSkeleton() {
  return (
    <Paper withBorder radius="lg" p="md" style={{ flex: '1 1 380px' }} data-testid="evidence-skeleton">
      <Stack gap="lg">
        <Group gap="md" wrap="nowrap">
          <Skeleton w={60} h={60} radius="sm" style={{ flexShrink: 0 }} />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Skeleton h={18} w="70%" />
            <Skeleton h={12} w="40%" />
          </Stack>
          <Skeleton w={48} h={48} circle />
        </Group>
        <Stack gap="xs">
          <SectionLabel>Where it belongs</SectionLabel>
          <Stack gap="2xs">
            {[0, 1, 2].map((i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <Skeleton w={22} h={22} radius={4} />
                <Skeleton h={10} style={{ flex: 1 }} />
                <Skeleton h={10} w={40} />
              </Group>
            ))}
          </Stack>
        </Stack>
        <Stack gap="2xs">
          <Group justify="space-between">
            <SectionLabel>Score over duels</SectionLabel>
            <Text fz="sm" c="dimmed">dashed = tier border</Text>
          </Group>
          <Skeleton h={80} />
        </Stack>
        <Stack gap="4xs">
          <SectionLabel>Key results</SectionLabel>
          {[0, 1].map((i) => (
            <Group key={i} justify="space-between" py="3xs" style={{ borderBottom: '1px solid var(--border-soft)' }} wrap="nowrap">
              <Skeleton h={12} w="50%" />
              <Skeleton w={20} h={20} radius={4} />
            </Group>
          ))}
        </Stack>
        <Group gap="2xs" grow>
          <Skeleton h={42} radius="sm" />
          <Skeleton h={42} radius="sm" />
        </Group>
      </Stack>
    </Paper>
  );
}

const KEY_HINTS = [['↑', '↓', 'browse'], ['M', 'move'], ['X', 'keep'], ['L', 'lock tier'], ['P', 'play']];

function KeyHints() {
  return (
    <Group gap="lg" px="lg" py="md" wrap="wrap">
      {KEY_HINTS.map((k) => (
        <Group key={k.at(-1)} gap="4xs">
          {k.slice(0, -1).map((x) => <Kbd key={x} size="xs">{x}</Kbd>)}
          <Text fz="md" c="dimmed">{k.at(-1)}</Text>
        </Group>
      ))}
    </Group>
  );
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'up', label: 'Up a tier' },
  { value: 'down', label: 'Down a tier' },
  { value: 'new', label: 'New placements' },
];

// "Suggested moves": the duels built the case; nothing moves until you say so.
export default function DuelMoves({ category, boardLoading, base }) {
  const tierName = useTierName();
  const navigate = useNavigate();
  const board = useDuelBoard(category);
  const analysis = useDuelAnalysisQuery(category, board.duelLayout, !boardLoading);
  const start = useStartDuelMutation(category);
  const [filter, setFilter] = useState('all');
  const [decided, setDecided] = useState({}); // song -> { s, kind, lean }
  const [selected, setSelected] = useState(null);
  const [previewSong, setPreviewSong] = useState(null);

  const data = analysis.data;
  const muOf = (id) => data?.songs.find((x) => x.id === id)?.mu;

  // Decided rows stay listed (with Undo), in the list they came from, after the analysis drops them.
  const [rows, leaningRows] = useMemo(() => {
    if (!data) return [[], []];
    const list = (live, lean) => [
      ...live.filter((s) => !decided[s.song]),
      ...Object.values(decided).filter((d) => !!d.lean === lean).map((d) => d.s),
    ].sort((a, b) => b.confidence - a.confidence);
    return [list(data.suggestions, false), list(data.leaning ?? [], true)];
  }, [data, decided]);
  const counts = { all: rows.length, up: 0, down: 0, new: 0 };
  rows.forEach((s) => (counts[moveKind(s.from, s.to)] += 1));
  const byFilter = (list) => (filter === 'all' ? list : list.filter((s) => moveKind(s.from, s.to) === filter));
  const shown = byFilter(rows);
  // The chips filter both lists the same way; the leaning header names the filter so its rows don't read as unfiltered.
  const shownLeaning = byFilter(leaningRows);
  const filterLabel = filter === 'all' ? '' : ` · ${FILTERS.find((f) => f.value === filter).label.toLowerCase()}`;
  const leaningTitle = `Leaning · ${shownLeaning.length} not sure yet${filterLabel}`;
  const isLeaning = (s) => leaningRows.includes(s);
  // Browsing (keys, the evidence panel) walks the ready suggestions only -
  // leaning moves are never selected, so nothing about them reads as a suggestion.
  const browsable = shown;
  const current = browsable.find((s) => s.song === selected) ?? browsable[0];
  // "Duel this song": a One song session pinned on it (to-do songs only duel in Place TODO).
  const duelSong = (s) => start.mutate(
    { layout: board.duelLayout.layout, focus: s.from === 'TODO' ? 'PLACE_TODO' : 'ONE_SONG', songId: s.from === 'TODO' ? null : s.song, minutes: 5 },
    { onSuccess: (session) => navigate(`${base}/duel/play/${session.id}`) }
  );
  const sure = rows.filter((s) => !decided[s.song] && s.confidence >= 0.9);

  // The preview belongs to one song: selecting another stops it.
  const previewing = !!current && previewSong === current.song;
  const togglePreview = () => setPreviewSong((p) => (p === current?.song ? null : current?.song));

  const move = (s) => {
    board.accept(s, muOf);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'move', lean: isLeaning(s) } }));
  };
  const keep = (s) => {
    board.keep(s);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'keep', lean: isLeaning(s) } }));
  };
  const undo = (s) => {
    board.undo(s, decided[s.song]?.kind === 'move');
    setDecided((d) => Object.fromEntries(Object.entries(d).filter(([song]) => song !== s.song)));
  };
  const [locked, setLocked] = useState({});
  const toggleLock = (id) => {
    const next = !locked[id];
    board.setLocked(id, next);
    setLocked((l) => ({ ...l, [id]: next }));
  };

  const browse = (step) => {
    const i = browsable.findIndex((s) => s.song === current?.song);
    const next = browsable[Math.max(0, Math.min(browsable.length - 1, i + step))];
    if (next) setSelected(next.song);
  };
  useHotkeys('down', () => browse(1), { preventDefault: true }, [browsable, current]);
  useHotkeys('up', () => browse(-1), { preventDefault: true }, [browsable, current]);
  useHotkeys('m', () => current && !decided[current.song] && move(current), [current, decided]);
  useHotkeys('x', () => current && !decided[current.song] && keep(current), [current, decided]);
  useHotkeys('l', () => current && toggleLock(current.song), [current, locked]);
  useHotkeys('p', () => current && togglePreview(), [current, previewSong]);

  if (analysis.isError) {
    return (
      <Container className="duel-view" fluid px={0} py={0}>
        <Alert color="red" title="Couldn’t load the suggested moves">
          {errorMessage(analysis.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="compact-sm" onClick={() => analysis.refetch()}>Retry</Button></Group>
        </Alert>
      </Container>
    );
  }

  const currentSong = current && data?.songs.find((x) => x.id === current.song);
  // The dashed line: the border nearest the song's score.
  const border = currentSong && data.borders.reduce((best, b) => (!best || Math.abs(b.score - currentSong.mu) < Math.abs(best.score - currentSong.mu) ? b : best), null);

  return (
    <Container className="duel-view" fluid px={0} py={0}>
      <Stack gap={SECTION_GAP}>
        <PageHeader
          crumb={
            <Anchor component={Link} to={`${base}/duel`} fz="xs" c="dimmed">
              ← {category} · Duel
            </Anchor>
          }
          title="Suggested moves"
          meta="Your duels built the case. Nothing moves until you say so - then push to YouTube as usual."
          actions={rows.length > 0 && (
            <Button disabled={!sure.length} onClick={() => sure.forEach(move)}>
              Move all {sure.length} at ≥90%
            </Button>
          )}
        />

        <Chip.Group value={filter} onChange={setFilter}>
          <Group gap="2xs">
            {FILTERS.map((f) => (
              <Chip key={f.value} value={f.value} variant="light">
                {f.label} · {counts[f.value]}
              </Chip>
            ))}
          </Group>
        </Chip.Group>

        {/* Loading keeps the two-column layout: skeleton rows on the left,
            the evidence panel's sections on the right. */}
        {!data ? (
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Paper withBorder radius="lg" style={{ flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
              {[0, 1, 2, 3, 4].map((i) => <MoveRowSkeleton key={i} />)}
              <KeyHints />
            </Paper>
            <EvidenceSkeleton />
          </Group>
        ) : rows.length === 0 ? (
          <NothingReady closest={leaningRows.find((l) => !decided[l.song])} board={board} base={base} />
        ) : (
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Paper withBorder radius="lg" style={{ flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
              {shown.length === 0 && <Text c="dimmed" p="xl" ta="center">No {FILTERS.find((f) => f.value === filter).label.toLowerCase()} moves are ready.</Text>}
              {shown.map((s) => (
                <MoveRow
                  key={s.song}
                  s={s}
                  board={board}
                  selected={current?.song === s.song}
                  decided={decided[s.song]?.kind}
                  onSelect={() => setSelected(s.song)}
                  onMove={() => move(s)}
                  onKeep={() => keep(s)}
                  onUndo={() => undo(s)}
                />
              ))}
              {shown.length > 0 && <KeyHints />}
            </Paper>

            {current && (
              <Paper withBorder radius="lg" p="md" style={{ flex: '1 1 380px' }}>
                <Stack gap="lg">
                  <Group gap="md" wrap="nowrap">
                    <SongArt video={board.videoOf(current.song)} size={60} />
                    <Box style={{ flex: 1 }} miw={0}>
                      <Title order={3} fz="xl" truncate="end">{board.nameOf(current.song)}</Title>
                      <Text c="dimmed" fz="md" truncate="end">{board.artistOf(current.song)}</Text>
                    </Box>
                    <Button radius="xl" w={48} h={48} p={0} aria-label={previewing ? 'Stop' : `Play ${board.nameOf(current.song)}`}
                      onClick={togglePreview}>
                      {previewing ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </Button>
                  </Group>
                  {previewing && (
                    <Box style={{ aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: 'var(--media-bg)' }}>
                      <EmbeddedPlayer videoId={current.song} autoplay />
                    </Box>
                  )}
                  <Stack gap="xs">
                    <SectionLabel>Where it belongs</SectionLabel>
                    <ProbabilityBars song={currentSong} tiers={TIER_ORDER.filter((t) => currentSong?.probabilities[t] != null)} />
                  </Stack>
                  <Stack gap="2xs">
                    <Group justify="space-between">
                      <SectionLabel>Score over {current.wins + current.losses + current.draws} duels</SectionLabel>
                      <Text fz="sm" c="dimmed">dashed = tier border</Text>
                    </Group>
                    <ScoreTrend trend={current.trend} border={border?.score} />
                  </Stack>
                  <Stack gap="4xs">
                    <SectionLabel>Key results</SectionLabel>
                    {current.keyResults.map((k, i) => (
                      <Group key={i} justify="space-between" py="3xs" style={{ borderBottom: '1px solid var(--border-soft)' }} wrap="nowrap">
                        <Group gap="2xs" wrap="nowrap" miw={0}>
                          <Text fw={800} w={40} c={k.result > 0 ? 'accent' : 'dimmed'}>
                            {k.result > 0 ? 'Won' : k.result < 0 ? 'Lost' : 'Draw'}
                          </Text>
                          <Text fz="md" truncate="end">{board.nameOf(k.opponent)}</Text>
                        </Group>
                        {k.opponentTier && <TierChip tier={k.opponentTier} size={20} />}
                      </Group>
                    ))}
                  </Stack>
                  <Stack gap="xs">
                    {!decided[current.song] && (
                      <Group gap="2xs" grow>
                        <Button variant="default" onClick={() => keep(current)}>Keep in {tierName(current.from)}</Button>
                        <Button onClick={() => move(current)}>Move to {tierName(current.to)}</Button>
                      </Group>
                    )}
                    <Checkbox
                      checked={!!locked[current.song]}
                      onChange={() => toggleLock(current.song)}
                      label={`Lock ${board.nameOf(current.song)} in its tier - never suggest a move again`}
                    />
                    <Text fz="md" c="dimmed">
                      Keeping it raises the bar: it won’t be suggested again until five fresh duels point the same way.
                    </Text>
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Group>
        )}

        {/* Leaning: a separate, quiet, collapsed view - where the duels point
            short of the bar. Never selected, never a primary action. */}
        {shownLeaning.length > 0 && (
          <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
            <Accordion chevronPosition="left" variant="default" styles={{ content: { padding: 0 } }}>
              <Accordion.Item value="leaning" style={{ borderBottom: 0 }}>
                <Accordion.Control aria-label={leaningTitle}>
                  <Stack gap="5xs">
                    <Text fz="md" fw={600} c="dimmed">{leaningTitle}</Text>
                    <Text fz="sm" c="dimmed">Not suggestions - where your duels point so far, short of the bar. Duel them more to settle it.</Text>
                  </Stack>
                </Accordion.Control>
                <Accordion.Panel>
                  {shownLeaning.map((s) => (
                    <LeaningRow
                      key={s.song}
                      s={s}
                      board={board}
                      decided={decided[s.song]?.kind}
                      starting={start.isPending}
                      onDuel={() => duelSong(s)}
                      onMove={() => move(s)}
                      onUndo={() => undo(s)}
                    />
                  ))}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Paper>
        )}
        {start.isError && <Alert color="red">{errorMessage(start.error, 'Couldn’t start the session.')}</Alert>}

        {data && Object.keys(data.tierOrders).length > 0 && (
          <Stack gap="sm">
            <Title order={2}>Tighten tier order</Title>
            <Text c="dimmed" fz="md">Order within a tier is the songs sorted by score - positions are ranks on YouTube. Check the new order before you sort.</Text>
            <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
              {/* The first tier starts open: the change is there to see before Sort. */}
              <Accordion multiple chevronPosition="left" variant="default" defaultValue={Object.keys(data.tierOrders).slice(0, 1)}>
                {Object.entries(data.tierOrders).map(([tier, ids]) => (
                  <TierOrderItem key={tier} tier={tier} ids={ids} board={board} />
                ))}
              </Accordion>
            </Paper>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

// One tier's proposed order: a header (how many change, Sort) that opens to
// the songs at their new places - where each was, arrows for how far it
// moved; songs that stay put are dimmed.
function TierOrderItem({ tier, ids, board }) {
  const tierName = useTierName();
  const changes = orderChanges((board.tierItems[tier] || []).map((v) => v.videoId), ids);
  const changed = changes.filter((c) => c.delta !== 0).length;
  return (
    <Accordion.Item value={tier}>
      <Group gap="xs" wrap="nowrap" pr="lg">
        <Accordion.Control aria-label={`Show the new ${tierName(tier)} order`}>
          <Group gap="xs" wrap="nowrap">
            <TierChip tier={tier} size={22} />
            <Text>{changed} of {ids.length} songs change places</Text>
          </Group>
        </Accordion.Control>
        <Button variant="default" style={{ flexShrink: 0 }} onClick={() => board.applyTierOrder(tier, ids)}>
          Sort {tierName(tier)} by score
        </Button>
      </Group>
      <Accordion.Panel>
        <Table verticalSpacing="4xs" horizontalSpacing="sm" withRowBorders={false} aria-label={`New ${tierName(tier)} order`}>
          <Table.Tbody>
            {changes.map((c) => {
              const moved = c.delta !== 0;
              return (
                <Table.Tr key={`${c.id}-${c.to}`} style={{ opacity: moved ? 1 : 0.5 }} data-moved={moved || undefined}>
                  <Table.Td w={36}><Text ff="monospace" fz="md" ta="right">{c.to}</Text></Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" miw={0}>
                      <SongArt video={board.videoOf(c.id)} size={28} />
                      <Box miw={0}>
                        <Text fz="md" fw={moved ? 600 : 400} truncate="end">{board.nameOf(c.id)}</Text>
                        <Text fz="sm" c="dimmed" truncate="end">{board.artistOf(c.id)}</Text>
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td w={120}>
                    {moved ? (
                      <Group gap="3xs" wrap="nowrap" justify="flex-end">
                        <Text fz="sm" c="dimmed">was {c.from}</Text>
                        <Badge
                          variant="light"
                          color={c.delta > 0 ? 'accent' : 'gray'}
                          leftSection={c.delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                          aria-label={`${c.delta > 0 ? 'up' : 'down'} ${Math.abs(c.delta)}`}
                        >
                          {Math.abs(c.delta)}
                        </Badge>
                      </Group>
                    ) : (
                      <Text fz="sm" c="dimmed" ta="right">stays</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
