import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Image,
  Kbd,
  Progress,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Play, Square } from 'lucide-react';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from '../duel';
import { SETTINGS, getSetting, setSetting } from '../settings';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

function DuelCard({ video, tier, arrowKey, isPreviewing, onTogglePreview, onChoose, width }) {
  return (
    <Card
      className="duel-card"
      padding={0}
      radius="md"
      withBorder
      onClick={onChoose}
      style={{ width }}
    >
      <Card.Section style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: '#000' }}>
        {tier && (
          <Badge
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 2,
              background: TIER_COLORS[tier],
              color: '#101114',
            }}
          >
            {tier}
          </Badge>
        )}
        <Kbd style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>{arrowKey}</Kbd>
        {isPreviewing ? (
          <EmbeddedPlayer videoId={video.videoId} autoplay />
        ) : (
          <Image src={video.thumbnail || ''} alt={video.title} fit="cover" h="100%" w="100%" />
        )}
        <Button
          style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 2 }}
          size="xs"
          variant="filled"
          color="dark"
          leftSection={isPreviewing ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePreview();
          }}
        >
          {isPreviewing ? 'Stop' : 'Preview'}
        </Button>
      </Card.Section>
      <Text fw={600} size="sm" lineClamp={2} mx={16} mt={12} mb={4}>
        {video.title}
      </Text>
      <Text c="dimmed" size="sm" mx={16} mb={16}>
        {video.channelTitle}
      </Text>
    </Card>
  );
}

export default function DuelView({ videos, runs, tierSizes, onComplete, onCancel }) {
  const [strategyKey, setStrategyKeyState] = useState(() =>
    getSetting(SETTINGS.duelStrategy, DEFAULT_DUEL_STRATEGY)
  );
  const [currentPair, setCurrentPair] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [spine, setSpine] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  const strategyRef = useRef(null);
  const videoMapRef = useRef(new Map());
  videoMapRef.current = new Map(videos.map((v) => [v.videoId, v]));

  const tierOfId = useMemo(() => {
    const map = {};
    tierSizes.forEach((entry, i) => {
      (runs[i] || []).forEach((id) => {
        map[id] = entry.tier;
      });
    });
    return map;
  }, [runs, tierSizes]);

  // Picking a strategy here also updates the persisted default, so Settings
  // and the in-session dropdown always agree on "what happens next time."
  function setStrategyKey(key) {
    setStrategyKeyState(key);
    setSetting(SETTINGS.duelStrategy, key);
  }

  function advance(strategy) {
    const pair = strategy.nextPair();
    setProgress(strategy.getProgress());
    setPreviewing(null);
    if (!pair) {
      setCurrentPair(null);
      setSpine(strategy.getSpine());
    } else {
      setCurrentPair(pair);
    }
  }

  useEffect(() => {
    const ids = videos.map((v) => v.videoId);
    const strategy = DUEL_STRATEGIES[strategyKey]({ ids, runs });
    strategyRef.current = strategy;
    setSpine(null);
    advance(strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyKey]);

  function chooseWinner(winnerId) {
    const strategy = strategyRef.current;
    strategy.reportResult(winnerId);
    advance(strategy);
  }

  function skip() {
    const strategy = strategyRef.current;
    if (!strategy?.supportsSkip) return;
    strategy.skip();
    advance(strategy);
  }

  function undo() {
    const strategy = strategyRef.current;
    if (!strategy?.undoLast) return;
    strategy.undoLast();
    setSpine(null);
    advance(strategy);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (spine || !currentPair) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        chooseWinner(currentPair.a);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        chooseWinner(currentPair.b);
      } else if (e.key === ' ') {
        e.preventDefault();
        skip();
      } else if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPair, spine]);

  function finish() {
    if (!spine) return;
    const result = {};
    let cursor = 0;
    for (const { tier, count } of tierSizes) {
      result[tier] = spine.slice(cursor, cursor + count).map((id) => videoMapRef.current.get(id));
      cursor += count;
    }
    onComplete(result);
  }

  const strategy = strategyRef.current;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const a = currentPair ? videoMapRef.current.get(currentPair.a) : null;
  const b = currentPair ? videoMapRef.current.get(currentPair.b) : null;
  // Mantine has no responsive-numeric-prop story for "fluid up to a cap, then
  // full-width below a breakpoint" - useMediaQuery covers that in JS instead
  // of a hand-written @media rule.
  const isNarrow = useMediaQuery('(max-width: 720px)');
  const cardWidth = isNarrow ? '100%' : 'min(440px, 42vw)';

  return (
    <Container className="duel-view" size={1100} pt={24} ta="center">
      <Group justify="space-between" wrap="wrap" mb={36} ta="left">
        <Button variant="default" onClick={onCancel}>
          &larr; Cancel
        </Button>

        <Stack gap={6} style={{ flex: 1, maxWidth: 320 }}>
          <Group justify="space-between" gap={8}>
            <Text size="xs" c="dimmed" fw={600}>
              {spine
                ? 'All duels settled'
                : `${progress.completed} of ${progress.total} duels`}
            </Text>
            <Text size="xs" c="dimmed" fw={600}>
              {pct}%
            </Text>
          </Group>
          <Progress value={pct} size="sm" radius="xl" />
        </Stack>

        <Select
          value={strategyKey}
          onChange={(value) => value && setStrategyKey(value)}
          allowDeselect={false}
          data={Object.keys(DUEL_STRATEGIES).map((key) => ({
            value: key,
            label: DUEL_STRATEGY_LABELS[key],
          }))}
        />
      </Group>

      {!spine && a && b && (
        <>
          <Title order={1} fz={28} fw={800} mb={40}>
            Which one deserves the higher tier?
          </Title>
          <Group justify="center" wrap="wrap" align="center" gap={28}>
            <DuelCard
              video={a}
              tier={tierOfId[a.videoId]}
              arrowKey="←"
              width={cardWidth}
              isPreviewing={previewing === a.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === a.videoId ? null : a.videoId))}
              onChoose={() => chooseWinner(a.videoId)}
            />
            <ThemeIcon size={52} radius={100} variant="outline" color="accent" fw={800} fz={14}>
              VS
            </ThemeIcon>
            <DuelCard
              video={b}
              tier={tierOfId[b.videoId]}
              arrowKey="→"
              width={cardWidth}
              isPreviewing={previewing === b.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === b.videoId ? null : b.videoId))}
              onChoose={() => chooseWinner(b.videoId)}
            />
          </Group>
          <Group justify="center" gap={20} mt={32}>
            <Group gap={6}>
              <Kbd>←</Kbd>
              <Text size="sm" c="dimmed">left wins</Text>
            </Group>
            <Group gap={6}>
              <Kbd>→</Kbd>
              <Text size="sm" c="dimmed">right wins</Text>
            </Group>
            {strategy?.supportsSkip && (
              <Group gap={6}>
                <Kbd>Space</Kbd>
                <Text size="sm" c="dimmed">too close to call</Text>
              </Group>
            )}
            <Group gap={6}>
              <Kbd>U</Kbd>
              <Text size="sm" c="dimmed">undo</Text>
            </Group>
          </Group>
        </>
      )}

      {spine && (
        <Stack align="center" gap="sm" py={64}>
          <Title order={2} fz={24}>
            All set.
          </Title>
          <Text c="dimmed" size="sm" maw={440}>
            Apply this order to your tiers — each tier keeps its current number of videos, just
            re-filled from the new ranking.
          </Text>
          <Button onClick={finish} size="md" mt={8}>
            Apply to tiers
          </Button>
        </Stack>
      )}
    </Container>
  );
}
