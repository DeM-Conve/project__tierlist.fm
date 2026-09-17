import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Container, Group, Progress, Select, Stack, Text, Title } from '@mantine/core';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from '../duel';
import { SETTINGS, getSetting, setSetting } from '../settings';
import { TIER_COLORS } from '../tiers';
import EmbeddedPlayer from './EmbeddedPlayer';

function DuelCard({ video, tier, isPreviewing, onTogglePreview, onChoose }) {
  return (
    <Card className="duel-card" padding={0} radius="md" withBorder onClick={onChoose}>
      <Card.Section className="duel-card-media">
        {tier && (
          <Badge className="duel-card-tier" style={{ background: TIER_COLORS[tier], color: '#1a1509' }}>
            {tier}
          </Badge>
        )}
        {isPreviewing ? (
          <EmbeddedPlayer videoId={video.videoId} autoplay />
        ) : (
          <img src={video.thumbnail || ''} alt={video.title} />
        )}
        <Button
          className="duel-card-preview-btn"
          size="xs"
          variant="filled"
          color="dark"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePreview();
          }}
        >
          {isPreviewing ? '✕ Stop' : '▶ Preview'}
        </Button>
      </Card.Section>
      <Text fw={600} size="sm" lineClamp={2} mx={14} mt={10} mb={4}>
        {video.title}
      </Text>
      <Text c="dimmed" size="sm" mx={14} mb={14}>
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

  return (
    <Container className="duel-view" size={980} pt={24} ta="center">
      <Group justify="space-between" wrap="wrap" mb={48} ta="left">
        <Button variant="default" onClick={onCancel}>
          &larr; Cancel
        </Button>

        <Stack gap={6} style={{ flex: 1, maxWidth: 320 }}>
          <Progress value={pct} size="sm" radius="xl" />
          <Text size="sm" c="dimmed">
            {spine
              ? 'All duels settled'
              : `${progress.completed} of ${progress.total} duels · ${pct}% settled`}
          </Text>
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
          <Title order={1} fz={26} fw={800} mb={32}>
            Which one deserves the higher tier?
          </Title>
          <Group justify="center" gap="lg" wrap="wrap" align="stretch">
            <DuelCard
              video={a}
              tier={tierOfId[a.videoId]}
              isPreviewing={previewing === a.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === a.videoId ? null : a.videoId))}
              onChoose={() => chooseWinner(a.videoId)}
            />
            <Text c="dimmed" size="sm" tt="lowercase">
              or
            </Text>
            <DuelCard
              video={b}
              tier={tierOfId[b.videoId]}
              isPreviewing={previewing === b.videoId}
              onTogglePreview={() => setPreviewing((p) => (p === b.videoId ? null : b.videoId))}
              onChoose={() => chooseWinner(b.videoId)}
            />
          </Group>
          <p className="focus-hint">
            ← left wins · → right wins{strategy?.supportsSkip ? ' · space too close to call' : ''} · u undo
          </p>
        </>
      )}

      {spine && (
        <Stack align="center" gap="sm" py={40}>
          <Title order={2} fz={22}>
            All set.
          </Title>
          <Text c="dimmed" size="sm" maw={440}>
            Apply this order to your tiers — each tier keeps its current number of videos, just
            re-filled from the new ranking.
          </Text>
          <Button onClick={finish}>Apply to tiers</Button>
        </Stack>
      )}
    </Container>
  );
}
