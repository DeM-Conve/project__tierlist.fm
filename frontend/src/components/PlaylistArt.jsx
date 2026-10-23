import { Center, Image } from '@mantine/core';
import { ListMusic } from 'lucide-react';
import { TIER_COLORS } from '../tiers';
import { playlistThumbnail } from '../tierUtils';

// A playlist's cover art. With no real cover (empty playlist), a soft wash of
// its tier's color with a playlist glyph instead of YouTube's grey "•••".
export default function PlaylistArt({ playlist, tier, w, h, radius, iconSize = 28, style }) {
  const src = playlistThumbnail(playlist);
  // Lazy: Home draws a cover for every playlist, most of them below the fold.
  if (src) return <Image src={src} w={w} h={h} radius={radius} fit="cover" bg="var(--surface-2)" alt="" loading="lazy" decoding="async" style={style} />;
  const color = TIER_COLORS[tier] ?? 'var(--text-faint)';
  return (
    <Center
      w={w}
      h={h}
      style={{
        borderRadius: radius,
        color,
        background: `color-mix(in srgb, ${color} 16%, var(--surface-2))`,
        ...style,
      }}
    >
      <ListMusic size={iconSize} strokeWidth={1.75} style={{ opacity: 0.85 }} />
    </Center>
  );
}
