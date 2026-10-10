import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Image,
  Kbd,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { ArrowDown, ArrowUp, Inbox, ListOrdered, Swords, Undo2, Volume2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import { createSession, estimateDuels, ladderChanges } from '../duel/sessions';
import { selectPlayerCoversPage } from '../store/selectors';
import { TIER_COLORS, TIER_ORDER, TODO_TIER } from '../tiers';
import { songLabel } from '../tierUtils';
import { useTierName } from '../tierLabels';
import { TierChip } from './TierBits';
import EmbeddedPlayer from './EmbeddedPlayer';

// Duels, by goal (see duel/sessions.js for the three modes). A session is an
// immutable value - every answer returns a new one - so undo is free and the
// ladder on the right is always exactly what Apply would write.

const HOOK = 0.35; // songs start about a third in - near the hook, not the intro

function ladderFrom(tierItems) {
  const ladder = {};
  for (const t of [...TIER_ORDER, TODO_TIER]) {
    if (tierItems[t]) ladder[t] = tierItems[t].map((v) => v.videoId);
  }
  return ladder;
}

// ---------------------------------------------------------------- song card

function SongCard({ video, tier, side, keyHint, active, onListen, onPick, pickLabel }) {
  const { song, artist } = songLabel(video);
  const playerRef = useRef(null);
  const seeked = useRef(false);

  // Only the side you're listening to plays; the other waits where it was.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (active) p.playVideo?.();
    else p.pauseVideo?.();
  }, [active]);

  return (
    <Card withBorder radius="md" padding={0} style={{ borderColor: active ? 'var(--accent)' : undefined }}>
      <Card.Section style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--media-bg)' }}>
        <EmbeddedPlayer
          key={video.videoId}
          videoId={video.videoId}
          autoplay={active}
          onPlayerReady={(p) => {
            playerRef.current = p;
            seeked.current = false;
          }}
          onPlayingChange={(playing) => {
            const p = playerRef.current;
            if (!playing || !p || seeked.current) return;
            seeked.current = true;
            const d = p.getDuration?.() ?? 0;
            if (d > 60) p.seekTo(d * HOOK, true);
            if (!active) p.pauseVideo();
          }}
        />
        {tier && (
          <Box style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, pointerEvents: 'none' }}>
            <TierChip tier={tier} size={26} />
          </Box>
        )}
      </Card.Section>
      <Stack gap={10} p="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Box miw={0}>
            <Text fw={700} truncate="end">{song}</Text>
            <Text c="dimmed" size="sm" truncate="end">{artist}</Text>
          </Box>
          <Tooltip label="Listen to this one (Tab switches)" withArrow>
            <Button
              size="compact-sm"
              variant={active ? 'light' : 'subtle'}
              color={active ? 'accent' : 'gray'}
              leftSection={<Volume2 size={14} />}
              onClick={onListen}
            >
              {active ? 'Listening' : `Listen ${side.toUpperCase()}`}
            </Button>
          </Tooltip>
        </Group>
        {onPick && (
          <Button fullWidth size="md" onClick={onPick} rightSection={<Kbd size="xs">{keyHint}</Kbd>}>
            {pickLabel}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

// ------------------------------------------------------------------ ladder

// One bar per tier, a sliver per song: the two contenders are marked, and in
// Place the range the new song can still land in is lit up - you watch the
// binary search close in.
function Ladder({ ladder, request, showTodo, videoOf }) {
  const tierName = useTierName();
  const tiers = [...TIER_ORDER, ...(showTodo ? [TODO_TIER] : [])].filter((t) => ladder[t]);
  const marked = new Set(request?.kind === 'duel' ? [request.a, request.b] : request ? [request.id] : []);
  return (
    <Stack gap={10}>
      {tiers.map((t) => {
        const ids = ladder[t];
        const inRange = (i) =>
          request?.kind === 'duel' && request.tier === t && request.lo != null && i >= request.lo && i < Math.max(request.hi, request.lo + 1);
        return (
          <Group key={t} gap={10} wrap="nowrap">
            <TierChip tier={t} size={24} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap={0} wrap="nowrap" h={16} style={{ borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
                {ids.map((id, i) => (
                  // A native title, not a Tooltip each: a to-do list can be 1000 songs.
                  <Box
                      key={`${id}-${i}`}
                      title={videoOf(id) ? songLabel(videoOf(id)).song : id}
                      h="100%"
                      style={{
                        flex: 1,
                        minWidth: marked.has(id) ? 6 : 0,
                        background: marked.has(id)
                          ? 'var(--accent)'
                          : `color-mix(in srgb, ${TIER_COLORS[t]} ${inRange(i) ? 85 : 30}%, transparent)`,
                        borderRight: ids.length < 120 ? '1px solid var(--surface)' : undefined,
                      }}
                    />
                ))}
              </Group>
            </Box>
            <Text size="xs" c="dimmed" w={34} ta="right">{ids.length}</Text>
          </Group>
        );
      })}
      <Text size="xs" c="dimmed">
        Accent = the two songs in this duel{request?.lo != null ? '; bright = where the new song can still land' : ''}. Hover a sliver for its song. ({tierName(TIER_ORDER[0])} first)
      </Text>
    </Stack>
  );
}

function ChangeList({ changes, videoOf }) {
  const order = [...TIER_ORDER, TODO_TIER];
  if (!changes.length) return <Text size="sm" c="dimmed">No changes yet.</Text>;
  return (
    <Stack gap={6}>
      {changes.map(({ id, from, to }) => {
        const v = videoOf(id);
        const up = from && order.indexOf(to.tier) < order.indexOf(from.tier);
        const down = from && order.indexOf(to.tier) > order.indexOf(from.tier);
        return (
          <Group key={id} gap={8} wrap="nowrap">
            <Image src={v?.thumbnail} w={36} h={36} radius="sm" fit="cover" />
            <Box miw={0} style={{ flex: 1 }}>
              <Text size="sm" truncate="end">{v ? songLabel(v).song : id}</Text>
              <Group gap={4}>
                {from && from.tier !== to.tier && <TierChip tier={from.tier} size={16} />}
                {from && from.tier !== to.tier && <Text size="xs" c="dimmed">→</Text>}
                <TierChip tier={to.tier} size={16} />
                <Text size="xs" c="dimmed">#{to.index + 1}</Text>
              </Group>
            </Box>
            {up && <ArrowUp size={16} color="currentColor" style={{ color: 'var(--accent)' }} />}
            {down && <ArrowDown size={16} color="currentColor" style={{ color: 'var(--text-dim)' }} />}
          </Group>
        );
      })}
    </Stack>
  );
}

// ------------------------------------------------------------- mode picker

function ModeCard({ icon, title, body, meta, onClick, disabled, children }) {
  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      className={disabled ? undefined : 'duel-card'}
      onClick={disabled ? undefined : onClick}
      style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      <Stack gap="sm" ta="left">
        <ThemeIcon size={40} radius="md" variant="light" color="accent">{icon}</ThemeIcon>
        <Title order={3} fz={20}>{title}</Title>
        <Text size="sm" c="dimmed">{body}</Text>
        <Badge variant="light" color="gray" w="fit-content">{meta}</Badge>
        {children}
      </Stack>
    </Card>
  );
}

function ModePicker({ ladder, onStart }) {
  const tierName = useTierName();
  const todo = ladder[TODO_TIER]?.length ?? 0;
  const tiers = TIER_ORDER.filter((t) => ladder[t]);
  return (
    <Stack gap="xl">
      <Box ta="left">
        <Title order={1} fz={30}>Duel</Title>
        <Text c="dimmed">Pick a job. Every duel moves the board on the right as you go; nothing reaches YouTube until you apply and push.</Text>
      </Box>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <ModeCard
          icon={<Inbox size={22} />}
          title="Place to-do songs"
          body={`Give each song from ${tierName(TODO_TIER)} a tier, then a few duels find its exact spot. Beat the top of its tier and it gets a shot at the tier above.`}
          meta={todo ? `${todo} to place · ~${estimateDuels('place', ladder)} duels each` : 'Nothing to place'}
          disabled={!todo}
          onClick={() => onStart('place')}
        />
        <ModeCard
          icon={<Swords size={22} />}
          title="Tune the borders"
          body="The bottom of each tier against the top of the one below. Lose to a lower song and you swap. Quick - fixes songs filed a tier off."
          meta={`~${estimateDuels('tune', ladder)} duels`}
          onClick={() => onStart('tune')}
        />
        <ModeCard
          icon={<ListOrdered size={22} />}
          title="Order a tier"
          body="Properly sort one tier - positions are ranks. Merge sort, so one wrong pick can't wreck the rest."
          meta="Pick a tier"
        >
          <Group gap={6} onClick={(e) => e.stopPropagation()}>
            {tiers.map((t) => (
              <Tooltip key={t} label={`${ladder[t].length} songs · ~${estimateDuels('order', ladder, { tier: t })} duels`} withArrow>
                <UnstyledButton disabled={ladder[t].length < 2} onClick={() => onStart('order', { tier: t })}>
                  <TierChip tier={t} size={30} active={ladder[t].length >= 2} />
                </UnstyledButton>
              </Tooltip>
            ))}
          </Group>
        </ModeCard>
      </SimpleGrid>
    </Stack>
  );
}

// ----------------------------------------------------------------- the view

export default function DuelView({ tierItems, isLoading, onApply, onExit }) {
  const tierName = useTierName();
  const playerCoversPage = useSelector(selectPlayerCoversPage);
  const [session, setSession] = useState(null);
  const [listening, setListening] = useState('a');

  const videoMap = useMemo(() => {
    const map = new Map();
    Object.values(tierItems).forEach((list) => list?.forEach((v) => map.set(v.videoId, v)));
    return map;
  }, [tierItems]);
  const videoOf = (id) => videoMap.get(id);
  const boardLadder = useMemo(() => ladderFrom(tierItems), [tierItems]);

  const request = session?.request ?? null;
  const tiers = TIER_ORDER.filter((t) => boardLadder[t]);
  const changes = useMemo(() => (session ? ladderChanges(session.startLadder, session.ladder) : []), [session]);

  // The new song keeps playing across its duels; a new song starts on A again.
  const subject = request?.kind === 'tier' ? request.id : request?.a;
  useEffect(() => setListening('a'), [subject]);

  function start(mode, opts) {
    setSession(createSession(mode, boardLadder, opts));
  }
  const answer = (value) => setSession((s) => s.answer(value));
  const undo = () => setSession((s) => (s.answers.length ? s.undo() : s));

  function apply() {
    const result = {};
    for (const [t, ids] of Object.entries(session.ladder)) result[t] = ids.map(videoOf).filter(Boolean);
    onApply(result);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (!request || playerCoversPage || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return;
      if (e.key === 'u') {
        e.preventDefault();
        undo();
      } else if (request.kind === 'tier' && e.code.startsWith('Digit')) {
        const t = tiers[Number(e.code.slice(5)) - 1];
        if (t) {
          e.preventDefault();
          answer(t);
        }
      } else if (request.kind === 'duel') {
        if (e.key === 'ArrowLeft') answer(request.a);
        else if (e.key === 'ArrowRight') answer(request.b);
        else if (e.key === 'ArrowDown') answer(null);
        else if (e.key === 'Tab') setListening((l) => (l === 'a' ? 'b' : 'a'));
        else return;
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, playerCoversPage, tiers.join()]);

  if (isLoading) {
    return (
      <Container className="duel-view" size={1200} pt={24}>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} h={260} radius="md" />)}
        </SimpleGrid>
      </Container>
    );
  }

  if (!session) {
    return (
      <Container className="duel-view" size={1200} pt={24}>
        <Group mb="lg">
          <Button variant="default" onClick={onExit}>&larr; Back to board</Button>
        </Group>
        <ModePicker ladder={boardLadder} onStart={start} />
      </Container>
    );
  }

  const placeTotal = session.mode === 'place' ? session.startLadder[TODO_TIER].length : 0;
  const placed = placeTotal - (session.ladder[TODO_TIER]?.length ?? 0);
  const estimate =
    session.mode === 'place' ? placeTotal : estimateDuels(session.mode, session.startLadder, session.opts);
  const done = session.mode === 'place' ? placed : session.duels;
  const pct = request ? Math.min(99, Math.round((done / Math.max(1, estimate)) * 100)) : 100;
  const a = request?.kind === 'duel' ? videoOf(request.a) : null;
  const b = request?.kind === 'duel' ? videoOf(request.b) : null;
  const tierOf = (id) => Object.keys(session.ladder).find((t) => session.ladder[t].includes(id));
  const question =
    request?.kind === 'tier'
      ? 'Which tier is this song?'
      : request?.step === 'climb'
        ? `Top of its tier - does it beat this ${tierName(request.tier)} song too?`
        : request?.step === 'drop'
          ? `Bottom of its tier - is it still better than this ${tierName(request.tier)} song?`
          : request?.step === 'border'
            ? `${tierName(request.border[0])} / ${tierName(request.border[1])} border - which is better?`
            : 'Which is better?';

  return (
    <Container className="duel-view" size={1400} pt={16} pb={40}>
      <Group justify="space-between" mb="lg" wrap="wrap">
        <Group gap="sm">
          <Button variant="default" onClick={() => setSession(null)}>&larr; Modes</Button>
          <Button variant="subtle" color="gray" leftSection={<Undo2 size={16} />} disabled={!session.answers.length} onClick={undo}>
            Undo <Kbd size="xs" ml={6}>U</Kbd>
          </Button>
        </Group>
        <Stack gap={4} style={{ flex: 1, maxWidth: 360 }}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={600}>
              {session.mode === 'place'
                ? `${placed} of ${placeTotal} placed · ${session.duels} duels`
                : `${session.duels} of ~${estimate} duels`}
            </Text>
            <Text size="xs" c="dimmed" fw={600}>{pct}%</Text>
          </Group>
          <Progress value={pct} size="sm" radius="xl" />
        </Stack>
        <Group gap="sm">
          <Button variant="default" onClick={onExit}>{changes.length ? 'Discard & exit' : 'Exit'}</Button>
          <Button disabled={!changes.length} onClick={apply}>
            Apply {changes.length || ''} change{changes.length === 1 ? '' : 's'}
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Stack style={{ flex: 1, minWidth: 0 }} gap="lg">
          {request ? (
            <>
              <Title order={2} fz={24} ta="center">{question}</Title>
              {/* Same first child for the tier pick and the duels after it,
                  so the new song's player carries on instead of restarting. */}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                {request.kind === 'tier' ? (
                  <SongCard video={videoOf(request.id)} side="a" active onListen={() => {}} />
                ) : (
                  <SongCard
                    video={a}
                    tier={session.mode === 'place' ? null : tierOf(a.videoId)}
                    side="a"
                    keyHint="←"
                    active={listening === 'a'}
                    onListen={() => setListening('a')}
                    onPick={() => answer(request.a)}
                    pickLabel={session.mode === 'place' ? 'The new song' : 'This one'}
                  />
                )}
                {request.kind === 'tier' ? (
                  <Paper withBorder radius="md" p="xl">
                    <Stack justify="center" h="100%" gap="lg">
                      <Group justify="center" gap="sm">
                        {tiers.map((t, i) => (
                          <TierChip key={t} tier={t} size={52} kbd={i + 1} title={`${tierName(t)} (${i + 1})`} onClick={() => answer(t)} />
                        ))}
                      </Group>
                      <Text size="sm" c="dimmed" ta="center">
                        Rough is fine - the duels that follow find the exact spot, and can move it a tier.
                      </Text>
                    </Stack>
                  </Paper>
                ) : (
                  <SongCard
                    video={b}
                    tier={tierOf(b.videoId)}
                    side="b"
                    keyHint="→"
                    active={listening === 'b'}
                    onListen={() => setListening('b')}
                    onPick={() => answer(request.b)}
                    pickLabel="This one"
                  />
                )}
              </SimpleGrid>
              {a && b && (
                <Group justify="center" gap="lg">
                  <Group gap={6}><Kbd>←</Kbd><Kbd>→</Kbd><Text size="sm" c="dimmed">pick</Text></Group>
                  <UnstyledButton onClick={() => answer(null)}>
                    <Group gap={6}><Kbd>↓</Kbd><Text size="sm" c="dimmed">can&apos;t decide</Text></Group>
                  </UnstyledButton>
                  <Group gap={6}><Kbd>Tab</Kbd><Text size="sm" c="dimmed">switch song</Text></Group>
                  <Group gap={6}><Kbd>U</Kbd><Text size="sm" c="dimmed">undo</Text></Group>
                </Group>
              )}
            </>
          ) : (
            <Stack align="center" py={48} gap="sm">
              <Title order={2}>All done.</Title>
              <Text c="dimmed" maw={460} ta="center">
                {changes.length
                  ? `${changes.length} song${changes.length === 1 ? '' : 's'} moved. Apply them to the board - they're staged like any edit, so you can still review, undo or discard before pushing to YouTube.`
                  : 'Everything was already where it belongs.'}
              </Text>
              <Group mt="sm">
                <Button variant="default" onClick={() => setSession(null)}>Another duel</Button>
                {changes.length > 0 && <Button onClick={apply}>Apply {changes.length} changes</Button>}
              </Group>
            </Stack>
          )}
        </Stack>

        <Paper withBorder radius="md" p="md" w={360} visibleFrom="md" style={{ flexShrink: 0 }}>
          <Stack gap="md">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">The board, live</Text>
            <Ladder ladder={session.ladder} request={request} showTodo={session.mode === 'place'} videoOf={videoOf} />
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="sm">Changes ({changes.length})</Text>
            <ScrollArea.Autosize mah={320}>
              <ChangeList changes={changes} videoOf={videoOf} />
            </ScrollArea.Autosize>
          </Stack>
        </Paper>
      </Group>
    </Container>
  );
}
