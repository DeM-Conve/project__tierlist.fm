import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Alert, Anchor, Box, Button, Checkbox, Chip, Container, Group, Kbd, Paper, Skeleton, Stack, Text, Title, UnstyledButton,
} from '@mantine/core';
import { Play, Square } from 'lucide-react';
import { useTierName } from '../../tierLabels';
import { TIER_ORDER } from '../../tiers';
import { TierChip } from '../TierBits';
import EmbeddedPlayer from '../EmbeddedPlayer';
import { useDuelAnalysisQuery } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { moveKind, pct, record } from '../../duel/duelText';
import { ProbabilityBars, ScoreTrend, SectionLabel, SongArt } from './DuelBits';

// One suggested move: song, from -> to, confidence, Move / Keep (or what was decided, with Undo).
export function MoveRow({ s, board, selected, decided, onSelect, onMove, onKeep, onUndo, detail }) {
  const tierName = useTierName();
  return (
    <Group
      wrap="wrap"
      gap="md"
      px="lg"
      py="sm"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--surface-2)' : undefined,
        boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
      }}
    >
      <UnstyledButton onClick={onSelect} style={{ flex: '1 1 260px', minWidth: 0 }} aria-label={`Show evidence for ${board.nameOf(s.song)}`}>
        <Group gap="md" wrap="nowrap">
          <SongArt video={board.videoOf(s.song)} />
          <Box miw={0}>
            <Text fw={700} truncate="end">{board.nameOf(s.song)}</Text>
            <Text fz="md" c="dimmed" truncate="end">
              {board.artistOf(s.song)} · {detail ?? `${record(s)} (W–L–D)`}
            </Text>
          </Box>
        </Group>
      </UnstyledButton>
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
        <Group gap="xs" miw={150}>
          <Text fz="md" fw={700} c={decided === 'move' ? 'accent' : 'dimmed'}>
            {decided === 'move' ? `Moved to ${tierName(s.to)}` : `Kept in ${tierName(s.from)}`}
          </Text>
          <Anchor component="button" fz="md" c="dimmed" onClick={onUndo}>Undo</Anchor>
        </Group>
      ) : (
        <Group gap="3xs" miw={150}>
          <Button onClick={onMove}>Move</Button>
          <Button variant="default" onClick={onKeep}>Keep</Button>
        </Group>
      )}
    </Group>
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
  const board = useDuelBoard(category);
  const analysis = useDuelAnalysisQuery(category, board.duelLayout, !boardLoading);
  const [filter, setFilter] = useState('all');
  const [decided, setDecided] = useState({}); // song -> { s, kind }
  const [selected, setSelected] = useState(null);
  const [previewSong, setPreviewSong] = useState(null);

  const data = analysis.data;
  const muOf = (id) => data?.songs.find((x) => x.id === id)?.mu;

  // Decided rows stay listed (with Undo) after the analysis drops them.
  const rows = useMemo(() => {
    if (!data) return [];
    const live = data.suggestions.filter((s) => !decided[s.song]);
    const done = Object.values(decided).map((d) => d.s);
    return [...live, ...done].sort((a, b) => b.confidence - a.confidence);
  }, [data, decided]);
  const counts = { all: rows.length, up: 0, down: 0, new: 0 };
  rows.forEach((s) => (counts[moveKind(s.from, s.to)] += 1));
  const shown = filter === 'all' ? rows : rows.filter((s) => moveKind(s.from, s.to) === filter);
  const current = shown.find((s) => s.song === selected) ?? shown[0];
  const sure = rows.filter((s) => !decided[s.song] && s.confidence >= 0.9);

  // The preview belongs to one song: selecting another stops it.
  const previewing = !!current && previewSong === current.song;
  const togglePreview = () => setPreviewSong((p) => (p === current?.song ? null : current?.song));

  const move = (s) => {
    board.accept(s, muOf);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'move' } }));
  };
  const keep = (s) => {
    board.keep(s);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'keep' } }));
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
    const i = shown.findIndex((s) => s.song === current?.song);
    const next = shown[Math.max(0, Math.min(shown.length - 1, i + step))];
    if (next) setSelected(next.song);
  };
  useHotkeys('down', () => browse(1), { preventDefault: true }, [shown, current]);
  useHotkeys('up', () => browse(-1), { preventDefault: true }, [shown, current]);
  useHotkeys('m', () => current && !decided[current.song] && move(current), [current, decided]);
  useHotkeys('x', () => current && !decided[current.song] && keep(current), [current, decided]);
  useHotkeys('l', () => current && toggleLock(current.song), [current, locked]);
  useHotkeys('p', () => current && togglePreview(), [current, previewSong]);

  if (analysis.isError) {
    return (
      <Container className="duel-view" size={1320} py="xs">
        <Alert color="red" title="Couldn’t load the suggested moves">
          {errorMessage(analysis.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="xs" onClick={() => analysis.refetch()}>Retry</Button></Group>
        </Alert>
      </Container>
    );
  }

  const currentSong = current && data?.songs.find((x) => x.id === current.song);
  // The dashed line: the border nearest the song's score.
  const border = currentSong && data.borders.reduce((best, b) => (!best || Math.abs(b.score - currentSong.mu) < Math.abs(best.score - currentSong.mu) ? b : best), null);

  return (
    <Container className="duel-view" size={1320} py="xs">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap="2xs">
            <Anchor component={Link} to={`${base}/duel`} fz="md" fw={700} tt="uppercase" style={{ letterSpacing: '0.14em' }}>
              ← {category} · Duel
            </Anchor>
            <Title order={1}>Suggested moves</Title>
            <Text c="dimmed">Your duels built the case. Nothing moves until you say so - then push to YouTube as usual.</Text>
          </Stack>
          <Button disabled={!sure.length} onClick={() => sure.forEach(move)}>
            Move all {sure.length} at ≥90%
          </Button>
        </Group>

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
        ) : (
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Paper withBorder radius="lg" style={{ flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
              {shown.length === 0 && (
                <Text c="dimmed" p="xl" ta="center">
                  No moves to review. Duel more and the strongest cases show up here.
                </Text>
              )}
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
              <KeyHints />
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
                        <Button onClick={() => move(current)}>Move to {tierName(current.to)}</Button>
                        <Button variant="default" onClick={() => keep(current)}>Keep in {tierName(current.from)}</Button>
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

        {data && Object.keys(data.tierOrders).length > 0 && (
          <Stack gap="sm">
            <Title order={2}>Tighten tier order</Title>
            <Text c="dimmed" fz="md">Order within a tier is the songs sorted by score - positions are ranks on YouTube.</Text>
            <Paper withBorder radius="lg">
              {Object.entries(data.tierOrders).map(([tier, ids]) => {
                const now = (board.tierItems[tier] || []).map((v) => v.videoId);
                const changed = ids.filter((id, i) => now[i] !== id).length;
                return (
                  <Group key={tier} justify="space-between" px="lg" py="sm" style={{ borderBottom: '1px solid var(--border)' }}>
                    <Group gap="xs">
                      <TierChip tier={tier} size={22} />
                      <Text>{changed} of {ids.length} songs change places</Text>
                    </Group>
                    <Button variant="default" onClick={() => board.applyTierOrder(tier, ids)}>Sort {tierName(tier)} by score</Button>
                  </Group>
                );
              })}
            </Paper>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
