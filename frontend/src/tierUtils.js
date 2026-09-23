// Dark "ink" used for text/icons sitting on a tier's own color.
export const TIER_INK = 'var(--tier-ink)';

export function youtubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Which slot does the pointer fall in? Horizontal flow (tiles in a row,
// possibly wrapped): first tile whose row the pointer is above, or on that
// row and left of its midpoint.
export function indexForPointInFlow(container, clientX, clientY) {
  if (!container) return 0;
  const tiles = Array.from(container.querySelectorAll('[data-video-id]'));
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (clientY < r.top) return i;
    if (clientY <= r.bottom && clientX < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

// Vertical list: first row whose vertical midpoint is below the pointer.
export function indexForPointInList(container, clientY) {
  if (!container) return 0;
  const rows = Array.from(container.querySelectorAll('[data-video-id]'));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length;
}

