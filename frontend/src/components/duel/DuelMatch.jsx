import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Alert, Anchor, Box, Button, Center, Container, Grid, Group, Kbd, Paper, Progress, ScrollArea, SimpleGrid, Skeleton, Stack, Text, ThemeIcon,
  Title, UnstyledButton, useMatches,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTierName } from '../../tierLabels';
import { TierChip } from '../TierBits';
import EmbeddedPlayer from '../EmbeddedPlayer';
import { holdPlayer, releasePlayer } from '../../store/focusSlice';
import {
  useDuelSessionQuery, useDuelSkipMutation, useDuelUndoMutation, useDuelVerdictMutation, useEndDuelMutation,
} from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import {
  VERDICTS, likelyTiers, outcomeText, pct, reasonText, scoreDelta, verdictForKey, verdictHeadline,
} from '../../duel/duelText';
import { ProbabilityBars, SectionLabel } from './DuelBits';
import { CLIP_START, firstStart, nextStart, seeked } from '../../duel/clipWindow';
import { SECTION_GAP } from '../../layout/spacing';
import { useCanvas } from '../../layout/canvas';
import { matchFitHeight } from '../../duel/matchFit';
import { isSequenceKey } from '../../keyboard/sequence';
import UpCrumb from '../UpCrumb';

// Clips: from the 0:30 mark (no "most replayed" data without an outside
// service), the same length on both sides so their parts line up.
const CLIP_SECONDS = 30;

// The rhythm inside each column (between heading, cards, verdicts, hints and
// between the side cards) - one notch tighter than SECTION_GAP.
const COLUMN_GAP = 'sm';

// The fitted player's frame, a "contain" box with no Mantine prop for it:
// its height starts at a full-width 16:9 player's - half the cards row
// (100cqw of the cards box, an inline-size container) less the gap between
// the cards (spacing md) and a card's padding (sm) and borders (2px each
// side) - and shrinks with the column (flex-shrink, min-height 0); the
// player inside is as wide as that height allows (cq units of this size
// container), never wider than the card.
const FIT_FRAME = {
  flex: '0 1 auto',
  minHeight: 0,
  containerType: 'size',
  height: 'calc(((100cqw - var(--mantine-spacing-md)) / 2 - 2 * var(--mantine-spacing-sm) - 4px) * 9 / 16)',
};

// One side of the duel: a real YouTube player that plays its clip while it's
// the side being heard, pauses (and keeps its place) otherwise, and calls
// onClipEnd when the clip has played out. The clip is a moving window: each
// time it's this side's turn again it plays the NEXT part of the song
// (0:30-1:00, then 1:00-1:30, ...; back to the first part after the end),
// so waiting longer hears more of the song. Seeking in the player (a jump the
// clock can't explain) starts the window where you seeked to - never treated
// as the clip ending.
function ClipCard({ side, video, song, name, artist, active, paused, fit, onListen,onStartedByUser, onClipEnd, onBlocked }) {
  const tierName = useTierName();
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const length = CLIP_SECONDS;
  // The current part's start (null until the player knows the duration).
  const segRef = useRef(null);
  const [segStart, setSegStart] = useState(CLIP_START);
  const moveSeg = (t) => {
    segRef.current = t;
    setSegStart(t);
  };
  const endRef = useRef(onClipEnd);
  useEffect(() => {
    endRef.current = onClipEnd;
  });
  const [blocked, setBlocked] = useState(false);
  // Can't be played here (embedding off): hand straight over to the other side.
  useEffect(() => {
    if (blocked && active) endRef.current?.();
  }, [blocked, active]);

  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return undefined;
    // Not heard, or paused (Space): hold the place.
    if (!active || paused) {
      p.pauseVideo?.();
      return undefined;
    }
    const d = p.getDuration?.() || 0;
    if (segRef.current === null) moveSeg(firstStart(d, length));
    const t = p.getCurrentTime?.() ?? 0;
    if (t < segRef.current || t >= segRef.current + length) p.seekTo(segRef.current, true);
    p.playVideo?.();
    let last = null;
    const id = setInterval(() => {
      const now = p.getCurrentTime?.() ?? 0;
      const dur = p.getDuration?.() || 0;
      // A jump more than the tick could cover: the listener seeked.
      if (seeked(last, now)) moveSeg(Math.max(0, Math.floor(now)));
      last = now;
      const from = segRef.current;
      setProgress(Math.min(1, Math.max(0, (now - from) / length)));
      if (now >= from + length || (dur && now >= dur - 0.5)) {
        // Next time it's this side's turn: the next part, or the first again.
        moveSeg(nextStart(from, length, dur));
        endRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [active, paused, ready, length]);

  // "Replay clip": the current part from its start.
  function replay() {
    playerRef.current?.seekTo?.(segRef.current ?? CLIP_START, true);
    setProgress(0);
  }

  return (
    <Paper withBorder radius="lg" p="sm" h={fit ? '100%' : undefined}
      style={{ borderColor: active ? 'var(--accent)' : undefined, borderWidth: active ? 2 : 1 }}>
      <Stack gap="xs" h={fit ? '100%' : undefined}>
        {/* Side, status and the clip's one action on a single row. Tab
            switches to the other song, so only the paused side shows it. */}
        <Group justify="space-between" wrap="nowrap" gap="2xs">
          <Group gap="2xs" wrap="nowrap">
            <ThemeIcon variant="light" color="gray" size={28} radius="md" fw={900}>{side}</ThemeIcon>
            <Text fz="md" fw={700} c={active && !paused ? 'accent' : 'dimmed'}>{active && !paused ? '▶ Playing' : 'Paused'}</Text>
          </Group>
          <Button size="compact-sm" variant="default" onClick={active ? replay : onListen}
            rightSection={active ? null : <Kbd size="xs">Tab</Kbd>}>
            {active ? 'Replay clip' : `Hear ${side}`}
          </Button>
        </Group>
        {/* Fitted: the player is the card's full width while the column has
            the height for it, and shrinks (16:9, centred) once it doesn't.
            Flowing (narrow screens): always the full card width. */}
        <Center data-testid="duel-clip-frame" style={fit ? FIT_FRAME : undefined}>
          <Box pos="relative" data-testid="duel-clip-video"
            style={{
              width: fit ? 'min(100cqw, 100cqh * 16 / 9)' : '100%', aspectRatio: '16 / 9',
              borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden', background: 'var(--media-bg)',
            }}>
            <EmbeddedPlayer
              key={video.videoId}
              videoId={video.videoId}
              autoplay={false}
              // Play pressed in the player itself while this side isn't the one
              // being heard (or the clip is paused): this side becomes it,
              // instead of the app pausing it again.
              onPlayingChange={(playing) => {
                if (playing && (!active || paused)) onStartedByUser?.();
              }}
              onPlayerReady={(p) => {
                playerRef.current = p;
                setReady(!!p);
              }}
              onBlocked={() => {
                setBlocked(true);
                onBlocked?.();
              }}
            />
            {song?.tier && (
              <Box pos="absolute" bottom={8} right={8} style={{ pointerEvents: 'none' }}>
                <TierChip tier={song.tier} size={24} />
              </Box>
            )}
          </Box>
        </Center>
        <Stack gap="5xs">
          <Text ff="var(--font-display)" fw={800} fz="xl" lh={1.2} truncate="end" title={name}>{name}</Text>
          <Text fz="lg" c="dimmed" truncate="end">{artist}{song?.tier ? ` · ${tierName(song.tier)}` : ''}</Text>
        </Stack>
        {/* The part being played: its window, a progress line, its number - one row. */}
        <Group gap="2xs" wrap="nowrap">
          <Text ff="monospace" fz="sm" c="dimmed" style={{ flexShrink: 0 }}>
            {fmt(segStart)} – {fmt(segStart + length)}
          </Text>
          <Progress value={progress * 100} size="sm" radius="xl" color={active ? 'accent' : 'gray'} style={{ flex: 1 }} />
          <Text ff="monospace" fz="sm" c="dimmed" style={{ flexShrink: 0 }}>
            part {Math.max(1, Math.round((segStart - CLIP_START) / length) + 1)}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function useSecondsLeft(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000)) : 0;
}

// The matchup: hear both hooks, give a five-step verdict, see what it did.
export default function DuelMatch({ category, sessionId, boardLoading, base }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const tierName = useTierName();
  const board = useDuelBoard(category);
  const layout = board.duelLayout.layout;
  const session = useDuelSessionQuery(category, sessionId, board.duelLayout, !boardLoading);
  const verdict = useDuelVerdictMutation(category, sessionId);
  const skip = useDuelSkipMutation(category, sessionId);
  const undo = useDuelUndoMutation(category, sessionId);
  const end = useEndDuelMutation(category, sessionId);
  // Two columns side by side (lg, the Grid spans below): the page is the
  // canvas's height and nothing scrolls; narrower, it flows.
  const wide = useMatches({ base: false, lg: true });
  const pageHeight = matchFitHeight(useCanvas().height, wide);
  const fit = pageHeight != null;
  const [listening, setListeningSide] = useState('A');
  const [paused, setPaused] = useState(false);
  // Hearing a side (Tab, "Hear A/B", a clip ending) always plays it.
  const setListening = (side) => {
    setPaused(false);
    setListeningSide(side);
  };
  // Sides whose video can't be played here, by video id (a new pair starts clean).
  const [blocked, setBlocked] = useState({});
  const [answered, setAnswered] = useState(null); // the matchup just answered, until "Next duel"
  const secondsLeft = useSecondsLeft(session.data?.endsAt);

  const s = session.data;
  const m = s?.matchup;
  const busy = verdict.isPending || skip.isPending || undo.isPending || end.isPending;

  // The duel clips are the audio here: the dock steps aside (hidden, paused)
  // until the matchup closes, then picks up again if it was playing.
  useEffect(() => {
    dispatch(holdPlayer());
    return () => dispatch(releasePlayer());
  }, [dispatch]);

  // Every new pair (after a verdict or a skip) starts clean: on A, both clips
  // from 0:30 part 1 - the cards are keyed by the pair, so nothing carries over
  // (the user's call: a song staying on after a skip restarts too).
  useEffect(() => {
    if (!m || answered) return;
    setListening('A');
  }, [m?.a, m?.b, answered]); // eslint-disable-line react-hooks/exhaustive-deps

  // 409: the session moved on (another tab, a double press - nothing was
  // recorded twice) or it ended: show it as it is now.
  const failed = (err) => {
    if (err?.response?.status === 409) {
      notifications.show({ title: err.response.data?.title ?? 'Session changed', message: errorMessage(err, '') });
      setAnswered(null);
      session.refetch();
      return;
    }
    notifications.show({ color: 'red', title: 'That didn’t save', message: errorMessage(err, 'The app couldn’t reach the server.') });
  };

  function pick(v) {
    if (!m || busy || answered) return;
    setAnswered(m);
    verdict.mutate({ layout, a: m.a, b: m.b, verdict: v, seenDuels: s.duels.length }, { onError: (e) => { setAnswered(null); failed(e); } });
  }
  function next() {
    setAnswered(null);
  }
  function dontKnow() {
    if (!m || busy) return;
    skip.mutate({ layout, videoId: m.b, seenDuels: s.duels.length }, { onError: failed });
  }
  function takeBack() {
    if (busy) return;
    setAnswered(null);
    undo.mutate({ layout, seenDuels: s.duels.length }, { onError: failed });
  }
  function finish() {
    if (end.isPending) return;
    end.mutate({ layout }, { onSuccess: () => navigate(`${base}/duel/done/${sessionId}`), onError: failed });
  }

  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      // Alt+arrows are the browser's Back / Forward, never a verdict; the
      // key after `g` belongs to the sequence (`g u` is up, not Undo).
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isSequenceKey(e)) return;
      // A held key repeats: one press, one verdict.
      if (e.repeat) return;
      if (e.key === 'e') {
        finish();
        return;
      }
      if (e.key === ' ') {
        // Play / pause the clip being heard, like any player - its only job,
        // before and after a verdict.
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if (answered) {
        // Enter, not Space (that's play / pause): the next duel. Default
        // prevented, so a focused button isn't clicked as well.
        if (e.key === 'Enter') {
          e.preventDefault();
          next();
        } else if (e.key === 'u') takeBack();
        return;
      }
      const v = verdictForKey(e);
      if (v) {
        e.preventDefault();
        pick(v);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setListening(listening === 'A' ? 'B' : 'A');
      } else if (e.key === 's') {
        dontKnow();
      } else if (e.key === 'u') {
        takeBack();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (session.isError) {
    return (
      <Container className="duel-view" size={900} py="xs">
        <Alert color="red" title="Couldn’t open this duel session">
          {errorMessage(session.error, 'The app couldn’t reach the server.')}
          <Group mt="sm">
            <Button size="xs" component={Link} to={`${base}/duel`}>Back to the duel hub</Button>
            <Button size="xs" variant="default" onClick={() => session.refetch()}>Retry</Button>
          </Group>
        </Alert>
      </Container>
    );
  }
  // The page: a top bar, then the duel (main column) beside its side column -
  // two Grids on the same two columns, so both rows share the columns' edges
  // and long song names never resize the layout between duels. Fitted (lg,
  // see `fit`), the page is exactly the canvas's height: the body row takes
  // what the top bar leaves, the players shrink to the space left in the
  // main column and "This session" scrolls inside its card - the canvas
  // itself never scrolls, before or after a verdict.
  const tall = fit ? '100%' : undefined;
  const frame = ({ testId, top, main, side }) => (
    <Container className="duel-view" fluid px={0} py={0} h={pageHeight ?? undefined} data-testid={testId} data-fit={fit || undefined}>
      <Stack gap={SECTION_GAP} h={tall}>
        <Grid gutter={SECTION_GAP}>{top}</Grid>
        <Grid gutter={SECTION_GAP} style={fit ? { flex: 1, minHeight: 0 } : undefined} styles={fit ? { inner: { height: '100%' } } : undefined}>
          <Grid.Col span={{ base: 12, lg: 8 }} h={tall} data-testid="duel-main">
            <Stack gap={COLUMN_GAP} h={tall}>{main}</Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }} h={tall} data-testid="duel-side">
            <Stack gap={COLUMN_GAP} h={tall}>{side}</Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
  const topBar = (left, right) => (
    <>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Group wrap="nowrap" gap="md" align="center">
          <Box style={{ flexShrink: 0 }}><UpCrumb /></Box>
          <Stack gap="2xs" style={{ flex: 1, minWidth: 0 }}>{left}</Stack>
        </Group>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Group grow wrap="nowrap" gap="2xs" h="100%" align="center">{right}</Group>
      </Grid.Col>
    </>
  );
  // One line: the clip times on each card already say where the parts start.
  const heading = <Title order={1} ta="center">Which one hits harder?</Title>;
  // The two cards: fitted, as tall as their content (full-width players)
  // until the column runs short, then they shrink with it - one grid row,
  // minmax(0, 1fr), so it can go below the cards' content. Spare height on a
  // tall screen stays under the hint row, not inside the cards.
  const cardsBox = (children) => (
    <Box pos="relative" style={fit ? { flex: '0 1 auto', minHeight: 0, containerType: 'inline-size' } : undefined} data-testid="duel-cards">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" h={tall} style={fit ? { gridTemplateRows: 'minmax(0, 1fr)' } : undefined}>
        {children}
      </SimpleGrid>
      {/* Roughly level with the players' middles (the cards' header row sits above them). */}
      <ThemeIcon visibleFrom="sm" pos="absolute" left="50%" top="45%" size={52} radius="xl" variant="default" fw={900}
        style={{ transform: 'translate(-50%, -50%)' }}>VS</ThemeIcon>
    </Box>
  );
  const hint = (key, label) => (
    <Group gap="3xs" wrap="nowrap" style={{ flexShrink: 0 }}><Kbd size="xs">{key}</Kbd><Text fz="md" c="dimmed">{label}</Text></Group>
  );
  const movesLink = (
    <Anchor component={Link} to={`${base}/duel/moves`} fz="md" fw={700} style={{ flexShrink: 0 }}>Review suggested moves →</Anchor>
  );

  if (!s) {
    // Same frame, columns and block sizes as the loaded page below, so
    // nothing jumps when the session arrives.
    return frame({
      testId: 'duel-match-loading',
      top: topBar(
        <>
          <Skeleton h={14} w={180} />
          <Skeleton h={10} radius="xl" />
        </>,
        <>
          <Skeleton h={30} radius="sm" />
          <Skeleton h={30} radius="sm" />
        </>
      ),
      main: (
        <>
          {heading}
          {cardsBox([0, 1].map((i) => <Skeleton key={i} h={fit ? undefined : 360} radius="lg"
            // Fitted: a full-width player's frame plus the card's rows (~143px).
            style={fit ? { height: `calc(${FIT_FRAME.height.slice(5, -1)} + 143px)` } : undefined} />))}
          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="2xs">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={86} radius="md" />)}
          </SimpleGrid>
          {/* The hint row's line. */}
          <Text fz="md" aria-hidden>&nbsp;</Text>
        </>
      ),
      side: (
        <>
          <Skeleton h={104} radius="md" />
          <Skeleton h={180} radius="md" />
          <Skeleton mih={fit ? 96 : 180} radius="md" style={{ flex: '1 1 0' }} />
          {movesLink}
        </>
      ),
    });
  }

  const gain = s.certainty - s.certaintyStart;
  const elapsed = Math.max(1, s.minutes * 60 - secondsLeft);
  const shown = answered ?? m;
  const pairKey = `${shown?.a}|${shown?.b}`;
  const prev = s.previous;
  const showResult = answered && prev && !verdict.isPending;
  const v = (id) => board.videoOf(id) ?? { videoId: id };

  // After a verdict: what it did, in the verdict buttons' own place (laid
  // over them, so the page is exactly as tall as before - the players don't
  // resize between duels). Two lines: headline + score changes, then the
  // song's standing; Undo / Next duel on the right.
  const result = showResult && (
    <Paper pos="absolute" top={0} left={0} right={0} bottom={0} radius="md" px="md" py="xs" display="flex" data-testid="duel-result"
      style={{ alignItems: 'center', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid var(--accent)' }}>
      <Group justify="space-between" wrap={fit ? 'nowrap' : 'wrap'} gap="md" w="100%">
        <Stack gap="4xs" miw={0} style={{ flex: '1 1 240px' }}>
          <Group gap="md" wrap="nowrap" miw={0}>
            <Text ff="var(--font-display)" fw={800} fz="xl" lh={1.2} truncate="end" miw={0}>
              {verdictHeadline(prev.duel.verdict, board.nameOf(prev.duel.a), board.nameOf(prev.duel.b))}
            </Text>
            {/* By side letter (the cards right above name them), so a long
                song name never squeezes the score change out. */}
            {[['A', prev.duel.a, answered.songA.mu, prev.a.mu], ['B', prev.duel.b, answered.songB.mu, prev.b.mu]].map(([side, id, before, after]) => (
              <Group key={side} gap="4xs" wrap="nowrap" style={{ flexShrink: 0 }} title={board.nameOf(id)}>
                <Text fz="md" c="dimmed" fw={700}>{side}</Text>
                <Text fz="md" ff="monospace" fw={700}>{scoreDelta(before, after)}</Text>
              </Group>
            ))}
          </Group>
          <Text fz="md" lh={1.3} lineClamp={2}>{outcomeText(prev.a, board.nameOf(prev.duel.a), tierName)}</Text>
        </Stack>
        <Group gap="2xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button variant="default" onClick={takeBack}>Undo</Button>
          <Button onClick={next} rightSection={<Kbd size="xs">Enter</Kbd>} disabled={!m && !s.done}>
            {m ? 'Next duel' : 'Finish'}
          </Button>
        </Group>
      </Group>
    </Paper>
  );

  return frame({
    top: topBar(
      <>
        <Group justify="space-between" wrap="nowrap">
          <Text fz="md" fw={700} truncate="end">
            Certainty <Text span c="accent" inherit>{gain >= 0 ? '+' : '−'}{pct(Math.abs(gain))}</Text> · {s.duels.length} duels
          </Text>
          <Text fz="md" fw={700} c="dimmed" style={{ flexShrink: 0 }}>{secondsLeft > 0 ? `~${Math.ceil(secondsLeft / 60)} min left` : 'Time’s up'}</Text>
        </Group>
        <Progress value={Math.min(100, (elapsed / (s.minutes * 60)) * 100)} size="md" radius="xl" />
      </>,
      <>
        <Button variant="default" onClick={takeBack} disabled={!s.duels.length || busy} rightSection={<Kbd size="xs">U</Kbd>}>Undo</Button>
        <Button variant="light" color="gray" onClick={finish} loading={end.isPending} rightSection={<Kbd size="xs">E</Kbd>}>End session</Button>
      </>
    ),
    main: !shown ? (
      <Paper withBorder radius="lg" p="md">
        <Stack align="center" gap="sm">
          <Title order={2}>{secondsLeft > 0 ? 'Nothing left worth asking.' : 'Time’s up.'}</Title>
          <Text c="dimmed">{s.duels.length} duels this session. See what they settled.</Text>
          <Button onClick={finish} loading={end.isPending}>See the summary</Button>
        </Stack>
      </Paper>
    ) : (
      <>
        {heading}
        {cardsBox(
          <>
            <ClipCard key={`A|${pairKey}`} side="A" video={v(shown.a)} song={shown.songA} name={board.nameOf(shown.a)} artist={board.artistOf(shown.a)}
              active={listening === 'A'} paused={paused} fit={fit} onListen={() => setListening('A')}
              onStartedByUser={() => setListening('A')}
              onClipEnd={() => !blocked[shown.b] && setListening('B')}
              onBlocked={() => setBlocked((x) => ({ ...x, [shown.a]: true }))} />
            <ClipCard key={`B|${pairKey}`} side="B" video={v(shown.b)} song={shown.songB} name={board.nameOf(shown.b)} artist={board.artistOf(shown.b)}
              active={listening === 'B'} paused={paused} fit={fit} onListen={() => setListening('B')}
              onStartedByUser={() => setListening('B')}
              onClipEnd={() => !blocked[shown.a] && setListening('A')}
              onBlocked={() => setBlocked((x) => ({ ...x, [shown.b]: true }))} />
          </>
        )}
        <Box pos="relative" data-testid="duel-verdict-area">
          {/* Under the result they keep their size but are hidden and inert. */}
          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="2xs" role="group" aria-label="Your verdict"
            aria-hidden={showResult || undefined} inert={!!showResult} style={showResult ? { visibility: 'hidden' } : undefined}>
            {VERDICTS.map((x) => (
              <UnstyledButton key={x.verdict} onClick={() => pick(x.verdict)} disabled={busy || !!answered}>
                <Paper withBorder radius="md" py="md" px="xs" className="duel-card"
                  style={{ background: x.verdict === 'TOO_CLOSE' ? 'var(--surface)' : 'var(--surface-2)' }}>
                  <Stack gap="2xs" align="center">
                    <Text ff="var(--font-display)" fw={800} fz="lg">{x.label}</Text>
                    <Group gap="5xs">{x.keys.map((k) => <Kbd key={k} size="xs">{k}</Kbd>)}</Group>
                  </Stack>
                </Paper>
              </UnstyledButton>
            ))}
          </SimpleGrid>
          {result}
        </Box>
        {/* One line of keys in both states, so the page's height never changes. */}
        <Group justify="center" gap="lg" wrap={fit ? 'nowrap' : 'wrap'} data-testid="duel-hints">
          {answered ? (
            <>
              {hint('Enter', m ? 'next duel' : 'finish')}
              {hint('U', 'undo')}
              {hint('Space', 'play / pause')}
            </>
          ) : (
            <>
              <Text fz="md" c="dimmed" truncate="end" miw={0}>“Clearly” moves scores twice as far</Text>
              {hint('Space', 'play / pause')}
              <UnstyledButton onClick={dontKnow} style={{ flexShrink: 0 }}>
                <Group gap="3xs" wrap="nowrap"><Text fz="md" c="dimmed">Don’t know one of them</Text><Kbd size="xs">S</Kbd></Group>
              </UnstyledButton>
            </>
          )}
        </Group>
      </>
    ),
    // The side column is as tall as the duel: "This session" takes what the
    // cards above it leave and scrolls inside (flex-basis 0, so a long list
    // never makes the column taller), and the moves link always shows under it.
    side: (
      <>
        {shown && (
          <>
            <Paper withBorder radius="md" p="sm">
              <Stack gap="2xs">
                <SectionLabel>Why this duel</SectionLabel>
                <Text fz="md" lh={1.45}>{reasonText(shown, board.nameOf, tierName)}</Text>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Stack gap="xs">
                <SectionLabel>{board.nameOf(shown.a)} - where it belongs</SectionLabel>
                <ProbabilityBars song={showResult ? prev.a : shown.songA} tiers={likelyTiers(shown.songA, 3).map((x) => x.tier)} />
                <Text fz="md" c="dimmed">A move is suggested once one tier passes <b>85%</b> with at least 4 duels behind it.</Text>
              </Stack>
            </Paper>
          </>
        )}
        <Paper withBorder radius="md" p="sm" mih={fit ? 96 : 180} display="flex" data-testid="duel-session"
          style={{ flex: '1 1 0', flexDirection: 'column', gap: 'var(--mantine-spacing-2xs)' }}>
          <SectionLabel>This session</SectionLabel>
          <ScrollArea type="auto" offsetScrollbars style={{ flex: 1, minHeight: 0 }}>
            <Stack gap="2xs">
              {s.duels.length === 0 && <Text fz="md" c="dimmed">Your verdicts show up here.</Text>}
              {[...s.duels].reverse().map((d) => {
                const aWins = d.verdict === 'A' || d.verdict === 'A_CLEARLY';
                const draw = d.verdict === 'TOO_CLOSE';
                return (
                  <Group key={d.id} justify="space-between" gap="2xs" wrap="nowrap">
                    <Text fz="md" truncate="end" style={{ flex: 1, minWidth: 0 }}>
                      <b>{board.nameOf(aWins || draw ? d.a : d.b)}</b> {draw ? '≈' : 'over'} {board.nameOf(aWins || draw ? d.b : d.a)}
                    </Text>
                    <Text fz="md" c="dimmed" style={{ flexShrink: 0 }}>{draw ? 'too close' : d.verdict.endsWith('CLEARLY') ? 'clearly' : ''}</Text>
                  </Group>
                );
              })}
              {s.skipped.length > 0 && <Text fz="md" c="dimmed">{s.skipped.length} skipped as unknown</Text>}
            </Stack>
          </ScrollArea>
        </Paper>
        {movesLink}
      </>
    ),
  });
}
