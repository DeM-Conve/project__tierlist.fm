import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ActionIcon,
  Badge,
  Button,
  Flex,
  Group,
  Image,
  Kbd,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { CheckCheck, ExternalLink, Link2, Play, SkipForward, Undo2, EyeOff } from 'lucide-react';
import { TIER_COLORS, TIER_ORDER, TODO_TIER } from '../tiers';
import { selectPlayerCoversPage, selectTierCategories, selectTierGroups } from '../store/selectors';
import { chooseBoard, setCurrent } from '../store/inboxSlice';
import { songLabel, TIER_INK, youtubeUrl } from '../tierUtils';
import { EqualizerMark } from './TierBits';

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];
function ago(iso) {
  if (!iso) return null;
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const [unit, size] = STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? ['minute', 60];
  return RELATIVE.format(Math.round(seconds / size), unit);
}

function isTyping() {
  const el = document.activeElement;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
}

// One big tier target: the whole point of the page is "press a number".
function TierTarget({ tier, label, hotkey, disabled, onClick }) {
  const button = (
    <UnstyledButton
      onClick={disabled ? undefined : onClick}
      aria-label={`File into ${label}`}
      aria-disabled={disabled}
      className="inbox-tier"
      bg={TIER_COLORS[tier]}
      h={76}
      style={{
        flex: 1,
        minWidth: 64,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Text ff="var(--font-display)" fw={900} fz={tier === TODO_TIER ? 16 : 24} lh={1} c={TIER_INK}>
        {tier === TODO_TIER ? 'Later' : tier}
      </Text>
      <Kbd size="xs">{hotkey}</Kbd>
    </UnstyledButton>
  );
  return disabled ? (
    <Tooltip label={`This board has no ${label} playlist`} withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

// The Inbox: liked (or pasted) songs that aren't on any board yet, one card
// at a time. Keyboard-first: 1-5 files into a tier of the guessed board,
// t saves it to the board's TODO list, s skips, x hides a non-song, u undoes,
// Enter plays it (filing the playing song rolls on to the next), b picks
// another board.
export default function InboxView({ inbox, actions, onPasteLink }) {
  const dispatch = useDispatch();
  const categories = useSelector(selectTierCategories);
  const tierGroups = useSelector(selectTierGroups);
  const playingId = useSelector((s) => s.focus.focusedVideo?.videoId);
  const playerCoversPage = useSelector(selectPlayerCoversPage);
  const boardRef = useRef(null);

  const { current, list, loading, progress } = inbox;
  const guess = inbox.guessBoard(current);
  const board = guess ? tierGroups[guess.category] ?? {} : {};
  const rankedTiers = TIER_ORDER;
  const hasTodo = !!board[TODO_TIER];
  const isPlaying = current && playingId === current.videoId;

  // The card follows the music: when the dock moves on to the next Inbox
  // song by itself (the previous one ended), show that one.
  useEffect(() => {
    if (playingId && list.some((v) => v.videoId === playingId)) dispatch(setCurrent(playingId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  // Capture phase + stopImmediatePropagation: on this page 1-5 file a song
  // instead of the player's seek-to-percent, and u / Ctrl+Z undo Inbox
  // actions instead of board edits. Not while the full-screen player covers
  // the page - then the keys are the player's (digits seek, as elsewhere).
  useEffect(() => {
    function onKeyDown(e) {
      if (playerCoversPage || isTyping() || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const claim = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (mod && e.key.toLowerCase() === 'z') {
        claim();
        actions.undo();
        return;
      }
      if (mod) return;
      if (e.key === 'u') {
        claim();
        actions.undo();
        return;
      }
      if (!current || !guess) return;
      const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : null;
      if (digit >= 1 && digit <= rankedTiers.length) {
        const tier = rankedTiers[digit - 1];
        claim();
        if (board[tier]) actions.file(current, guess.category, tier);
      } else if (e.key === 't' && hasTodo) {
        claim();
        actions.file(current, guess.category, TODO_TIER);
      } else if (e.key === 's') {
        claim();
        actions.skip(current);
      } else if (e.key === 'x') {
        claim();
        actions.dismiss(current);
      } else if (e.key === 'Enter') {
        claim();
        actions.listen(current);
      } else if (e.key === 'b') {
        claim();
        boardRef.current?.focus();
        boardRef.current?.click();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  const label = current ? songLabel(current) : null;
  const upNext = current ? list.filter((v) => v.videoId !== current.videoId).slice(0, 12) : [];

  return (
    <Stack gap="xl" maw={1100}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
            Inbox
          </Text>
          <Title order={1} fz={{ base: 30, sm: 40 }} fw={900} lh={1}>
            New songs
          </Title>
          <Text c="dimmed" fz="sm">
            {loading
              ? 'Looking for songs you liked…'
              : list.length
                ? `${list.length} ${list.length === 1 ? 'song' : 'songs'} you liked on YouTube, not in a tier yet`
                : 'Every song you liked is in a tier'}
          </Text>
        </Stack>
        <TextInput
          w={360}
          placeholder="Add a song: paste its YouTube link"
          leftSection={<Link2 size={15} />}
          rightSection={<Kbd size="xs">Ctrl V</Kbd>}
          rightSectionWidth={64}
          onChange={(e) => {
            const input = e.currentTarget;
            if (onPasteLink(input.value)) {
              input.value = '';
              input.blur();
            }
          }}
          aria-label="Paste a YouTube link"
        />
      </Group>

      {loading && (
        <Paper withBorder radius="lg" p="xl">
          <Stack gap="sm">
            <Text fz="sm" c="dimmed">
              Checking your {progress.total} tier playlists for songs you’ve already filed… {progress.loaded}/
              {progress.total}
            </Text>
            <Progress value={progress.total ? (progress.loaded / progress.total) * 100 : 0} animated />
          </Stack>
        </Paper>
      )}

      {!loading && !current && (
        <Paper withBorder radius="lg" p={48}>
          <Stack align="center" gap="sm" ta="center">
            <ThemeIcon size={56} radius="xl" variant="light">
              <CheckCheck size={28} />
            </ThemeIcon>
            <Title order={3}>Inbox zero</Title>
            <Text c="dimmed" maw={420}>
              Like a song on YouTube (or YouTube Music), or paste its link anywhere here with{' '}
              <Kbd size="xs">Ctrl</Kbd> <Kbd size="xs">V</Kbd>, and it lands here, ready to rate.
            </Text>
          </Stack>
        </Paper>
      )}

      {!loading && current && (
        <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }} bg="var(--surface)">
          <Flex gap="xl" direction={{ base: 'column', sm: 'row' }}>
            <UnstyledButton
              onClick={() => actions.listen(current)}
              pos="relative"
              w={{ base: '100%', sm: 360 }}
              style={{ flex: 'none', borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' }}
              aria-label={`Play ${label.song}`}
            >
              <Image src={current.thumbnail} alt="" style={{ aspectRatio: '16 / 9' }} fit="cover" />
              <Group
                pos="absolute"
                left={10}
                bottom={10}
                gap={6}
                px={10}
                py={6}
                bg="var(--media-control-bg)"
                style={{ borderRadius: 999 }}
              >
                {isPlaying ? <EqualizerMark color="var(--media-fg)" height={11} /> : <Play size={13} color="var(--media-fg)" fill="currentColor" />}
                <Text fz="xs" fw={700} c="var(--media-fg)">
                  {isPlaying ? 'Playing' : 'Listen'}
                </Text>
                {!isPlaying && <Kbd size="xs">Enter</Kbd>}
              </Group>
            </UnstyledButton>

            <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
              <Stack gap={4}>
                <Text fz="xs" c="dimmed">
                  {current.addedAt ? `You liked this on YouTube ${ago(current.addedAt)}` : 'Added from a pasted link'}
                </Text>
                <Title order={2} fz={{ base: 24, sm: 30 }} lh={1.15} lineClamp={2} title={current.title}>
                  {label.song}
                </Title>
                <Text c="dimmed">{label.artist}</Text>
              </Stack>

              <Group gap="sm" wrap="wrap" align="center">
                <Select
                  ref={boardRef}
                  data={categories}
                  value={guess?.category ?? null}
                  onChange={(category) => {
                    if (category) dispatch(chooseBoard({ videoId: current.videoId, category }));
                    boardRef.current?.blur();
                  }}
                  searchable
                  allowDeselect={false}
                  w={220}
                  aria-label="Board"
                  leftSection={<Text fz={11} fw={700} c="dimmed">BOARD</Text>}
                  leftSectionWidth={60}
                  rightSection={<Kbd size="xs">b</Kbd>}
                />
                {guess?.reason && (
                  <Text fz="xs" c="dimmed">
                    {guess.reason}
                  </Text>
                )}
              </Group>

              <Group gap="sm" wrap="nowrap">
                {rankedTiers.map((tier, i) => (
                  <TierTarget
                    key={tier}
                    tier={tier}
                    label={tier}
                    hotkey={i + 1}
                    disabled={!board[tier]}
                    onClick={() => actions.file(current, guess.category, tier)}
                  />
                ))}
                {hasTodo && (
                  <TierTarget
                    tier={TODO_TIER}
                    label="TODO"
                    hotkey="t"
                    onClick={() => actions.file(current, guess.category, TODO_TIER)}
                  />
                )}
              </Group>

              <Group gap="xs" wrap="wrap">
                <Button variant="default" leftSection={<SkipForward size={15} />} rightSection={<Kbd size="xs">s</Kbd>} onClick={() => actions.skip(current)}>
                  Skip
                </Button>
                <Button variant="subtle" color="gray" leftSection={<EyeOff size={15} />} rightSection={<Kbd size="xs">x</Kbd>} onClick={() => actions.dismiss(current)}>
                  Not a song
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  leftSection={<Undo2 size={15} />}
                  rightSection={<Kbd size="xs">u</Kbd>}
                  disabled={!inbox.history.length}
                  onClick={() => actions.undo()}
                >
                  Undo
                </Button>
                <Tooltip label="Open on YouTube" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    component="a"
                    href={youtubeUrl(current.videoId)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open on YouTube"
                  >
                    <ExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Stack>
          </Flex>
        </Paper>
      )}

      {!loading && upNext.length > 0 && (
        <Stack gap="xs">
          <Group gap={8}>
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
              Up next
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {list.length - 1}
            </Badge>
          </Group>
          <ScrollArea type="hover" offsetScrollbars>
            <Group gap="sm" wrap="nowrap">
              {upNext.map((v) => {
                const l = songLabel(v);
                return (
                  <UnstyledButton key={v.videoId} w={150} onClick={() => dispatch(setCurrent(v.videoId))} style={{ flex: 'none' }}>
                    <Image src={v.thumbnail} alt="" radius="sm" style={{ aspectRatio: '16 / 9' }} fit="cover" />
                    <Text fz="xs" fw={600} mt={6} truncate="end" title={v.title}>
                      {l.song}
                    </Text>
                    <Text fz={11} c="dimmed" truncate="end">
                      {l.artist}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Group>
          </ScrollArea>
        </Stack>
      )}
    </Stack>
  );
}
