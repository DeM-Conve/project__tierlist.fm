import { useMemo, useState } from 'react';
import { Box, Group, Image, Paper, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { Music } from 'lucide-react';
import { TIER_COLORS, TIER_ORDER } from '../../tiers';
import { useTierName } from '../../tierLabels';
import { TierChip } from '../TierBits';
import { pct, score } from '../../duel/duelText';

// Pieces shared by the duel screens (hub, matchup, moves, summary).

export function SongArt({ video, size = 44 }) {
  if (video?.thumbnail) return <Image src={video.thumbnail} w={size} h={size} radius="sm" fit="cover" style={{ flexShrink: 0 }} />;
  return (
    <ThemeIcon size={size} radius="sm" variant="light" color="gray" style={{ flexShrink: 0 }}>
      <Music size={size * 0.4} />
    </ThemeIcon>
  );
}

export function SectionLabel({ children }) {
  return (
    <Text fz="sm" fw={800} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.1em' }}>
      {children}
    </Text>
  );
}

// "Where it belongs": one bar per tier in the tier's colour, with its probability.
export function ProbabilityBars({ song, tiers }) {
  const list = tiers ?? TIER_ORDER.filter((t) => song?.probabilities?.[t] != null);
  return (
    <Stack gap="2xs">
      {list.map((t) => {
        const p = song?.probabilities?.[t] ?? 0;
        return (
          <Group key={t} gap="xs" wrap="nowrap">
            <TierChip tier={t} size={22} />
            <Box h={10} style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 5, overflow: 'hidden' }}>
              <Box h="100%" w={pct(p)} style={{ background: TIER_COLORS[t], borderRadius: 5, transition: 'width 300ms ease' }} />
            </Box>
            <Text ff="monospace" fz="md" w={40} ta="right">{pct(p)}</Text>
          </Group>
        );
      })}
    </Stack>
  );
}

// Score map: every placed song as a dot along the score axis (low left, high
// right), coloured by its tier, over bands at the learned borders. Ringed =
// near a neighbouring tier. Hover a dot for the song.
export function ScoreMap({ analysis, nameOf, height = 150 }) {
  const tierName = useTierName();
  const [hover, setHover] = useState(null);
  const { dots, bands, lo, hi } = useMemo(() => {
    const ranked = analysis.songs.filter((s) => s.tier);
    if (!ranked.length) return { dots: [], bands: [], lo: 0, hi: 1 };
    const mus = ranked.map((s) => s.mu);
    const lo = Math.min(...mus, ...analysis.borders.map((b) => b.score)) - 2;
    const hi = Math.max(...mus, ...analysis.borders.map((b) => b.score)) + 2;
    const x = (mu) => ((mu - lo) / (hi - lo)) * 100;
    // Lowest tier on the left: borders sorted ascending.
    const cuts = [...analysis.borders].sort((a, b) => a.score - b.score);
    const tiersLowFirst = [cuts[0]?.lower, ...cuts.map((c) => c.upper)].filter(Boolean);
    const edges = [0, ...cuts.map((c) => x(c.score)), 100];
    const bands = tiersLowFirst.map((t, i) => ({ tier: t, from: edges[i], to: edges[i + 1], count: ranked.filter((s) => s.tier === t).length }));
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const dots = ranked.map((s) => ({ ...s, left: x(s.mu), top: 12 + rnd() * (height - 64) }));
    return { dots, bands, lo, hi };
  }, [analysis, height]);

  return (
    <Box pos="relative" h={height}>
      {/* Bands: a CSS flex row has no Mantine prop equivalent for percentage-positioned stripes. */}
      <Box pos="absolute" top={0} left={0} right={0} bottom={34} style={{ borderRadius: 10, overflow: 'hidden' }}>
        {bands.map((b) => (
          <Box key={b.tier} pos="absolute" top={0} bottom={0} left={`${b.from}%`} w={`${b.to - b.from}%`}
            style={{ background: `color-mix(in srgb, ${TIER_COLORS[b.tier]} 13%, transparent)`, borderRight: '1px dashed var(--border)' }} />
        ))}
      </Box>
      {dots.map((d) => (
        <Box
          key={d.id}
          pos="absolute"
          left={`${d.left}%`}
          top={d.top}
          w={10}
          h={10}
          onMouseEnter={() => setHover(d)}
          onMouseLeave={() => setHover(null)}
          style={{
            marginLeft: -5,
            borderRadius: '50%',
            background: TIER_COLORS[d.tier],
            boxShadow: d.onFence ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)' : '0 0 0 2px var(--surface)',
            cursor: 'default',
          }}
        />
      ))}
      {hover && (
        <Paper pos="absolute" left={`${hover.left}%`} top={Math.max(0, hover.top - 34)} px="2xs" py="4xs" shadow="sm" withBorder
          style={{ transform: 'translateX(-50%)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
          <Text fz="sm" fw={700}>
            {nameOf(hover.id)} · {pct(hover.bestProbability)} {tierName(hover.bestTier)} · score {score(hover.mu)}
          </Text>
        </Paper>
      )}
      <Box pos="absolute" left={0} right={0} bottom={0} h={28}>
        {bands.map((b) => (
          <Text key={b.tier} pos="absolute" left={`${b.from}%`} w={`${b.to - b.from}%`} ff="var(--font-display)" fw={900} fz="md" ta="center"
            c="dimmed">
            {tierName(b.tier)} · {b.count}
          </Text>
        ))}
      </Box>
      <Text pos="absolute" bottom={-22} left={0} fz="sm" c="dimmed" aria-hidden>
        {score(lo)}
      </Text>
      <Text pos="absolute" bottom={-22} right={0} fz="sm" c="dimmed" aria-hidden>
        {score(hi)}
      </Text>
    </Box>
  );
}

// A song's score over its duels (2px line), the nearest border dashed. Hover for each point.
export function ScoreTrend({ trend, border, height = 80 }) {
  const [hover, setHover] = useState(null);
  if (!trend?.length) return null;
  const values = border == null ? trend : [...trend, border];
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const w = 300;
  const y = (v) => height - 6 - ((v - min) / (max - min)) * (height - 12);
  const x = (i) => (trend.length === 1 ? w / 2 : 4 + (i / (trend.length - 1)) * (w - 8));
  const pts = trend.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <Box pos="relative">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label="Score over duels"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (trend.length - 1));
          setHover(Math.max(0, Math.min(trend.length - 1, i)));
        }}
        style={{ color: 'var(--accent)', display: 'block' }}>
        {border != null && <line x1="0" x2={w} y1={y(border)} y2={y(border)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 4" style={{ color: 'var(--text-faint)' }} />}
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        {hover != null && <circle cx={x(hover)} cy={y(trend[hover])} r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="2" />}
      </svg>
      {hover != null && (
        <Text fz="sm" c="dimmed" mt="4xs">
          {hover === 0 ? 'Start' : `After duel ${hover}`}: score {score(trend[hover])}
        </Text>
      )}
    </Box>
  );
}

// `loading`: the same card with the number (and its aside, when there is one)
// as Skeleton blocks of the same size, so the hub doesn't jump when data lands.
export function StatCard({ label, value, aside, children, highlight, onClick, loading }) {
  return (
    <Paper withBorder radius="md" p="md" onClick={onClick}
      className={onClick ? 'duel-card' : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined, borderColor: highlight ? 'var(--accent)' : undefined }}>
      <Stack gap="3xs">
        <Text fz="md" fw={700} c={highlight ? 'accent' : 'dimmed'} tt="uppercase" style={{ letterSpacing: '0.08em' }}>{label}</Text>
        <Group gap="xs" align="baseline">
          {loading ? <Skeleton h={44} w={96} radius="sm" /> : <Text ff="var(--font-display)" fw={900} fz="3xl" lh={1}>{value}</Text>}
          {loading ? aside != null && <Skeleton h={14} w={120} /> : aside && <Text fz="md" c="dimmed">{aside}</Text>}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}
