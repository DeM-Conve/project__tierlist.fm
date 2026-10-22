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

// Where to draw the insertion bar for slot `index` of a tile flow, relative
// to `container`'s box -> { left, top, height } or null (no tiles). The bar
// sits in the gap `gap` px wide beside a tile: after the tile before the
// slot when the pointer is on that tile's line (the right half of a line's
// last tile reads "after it", not "first on the next line"), else before
// the tile at the slot. Drawn absolutely, so showing it never shifts the
// tiles under the pointer (an inline bar did, and the slot flickered).
export function flowDropBar(container, index, clientY, gap) {
  if (!container) return null;
  const tiles = container.querySelectorAll('[data-video-id]');
  if (!tiles.length) return null;
  const box = container.getBoundingClientRect();
  const prev = index > 0 ? tiles[index - 1].getBoundingClientRect() : null;
  const next = index < tiles.length ? tiles[index].getBoundingClientRect() : null;
  const onPrevLine = prev && clientY >= prev.top && clientY <= prev.bottom;
  if (prev && (onPrevLine || !next)) {
    return { left: prev.right + gap / 2 - box.left, top: prev.top - box.top, height: prev.height };
  }
  return { left: next.left - gap / 2 - box.left, top: next.top - box.top, height: next.height };
}

// A drop slot among the tiles a row *shows* -> the index in the whole tier
// (tiersSlice applyMove's dropIndex). They differ while searching (only the
// matches show) and when the playing song is pulled forward past "+N": a
// drop before a shown song lands before it in the tier, one after the last
// shown song lands right after it. null (the "+N" tile) stays null: append.
export function tierDropIndex(items, shown, slot) {
  if (slot == null) return null;
  if (shown === items) return slot;
  if (!shown.length) return items.length;
  const at = (v) => items.findIndex((x) => x.videoId === v.videoId);
  if (slot < shown.length) return at(shown[slot]);
  return at(shown[shown.length - 1]) + 1;
}

// Vertical virtualized list: the slot a drop at `offset` (in the
// virtualizer's coordinates, scrollMargin included) lands in - before the
// row under the pointer if it's in that row's top half, else after it.
// Reads the virtualizer's own row offsets, so no row's DOM rect is queried
// (and rows outside the rendered window count too).
export function dropIndexAtOffset(virtualizer, offset) {
  const row = virtualizer.getVirtualItemForOffset(offset);
  if (!row) return 0;
  return offset < row.start + row.size / 2 ? row.index : row.index + 1;
}

// Bracketed noise YouTube titles carry: "(Official Music Video)", "[Lyrics]",
// "(Audio)", "(prod. X)", "| Album name" ...
const TITLE_NOISE =
  /\s*[([{][^)\]}]*\b(official|video|audio|lyrics?|lyrical|visuali[sz]er|mv|m\/v|hd|4k|prod\.?|full song|explicit)\b[^)\]}]*[)\]}]/gi;
const CHANNEL_NOISE = /\s*(-\s*topic|vevo|official)\s*$/i;

// What a tile shows: the song name and who it's by, from the video's own
// metadata. "A - B" is read as:
//   - on an auto-generated "Artist - Topic" channel: the whole title is the
//     song ("Sparkle - movie ver."), the channel is the artist;
//   - B is the channel ("Song - Artist"): A is the song;
//   - otherwise the common "Artist - Song (Official Video)" shape.
// Any other title is the song, with the channel as the artist.
export function songLabel(video) {
  const clean = (video.title || '').replace(TITLE_NOISE, '').split(/\s[|｜]\s/)[0].trim();
  const channel = video.channelTitle || '';
  const channelArtist = channel.replace(CHANNEL_NOISE, '').trim();
  const fallback = { song: clean || video.title || '', artist: channelArtist };
  if (/-\s*topic\s*$/i.test(channel)) return fallback;
  const dash = clean.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (!dash) return fallback;
  const [first, rest] = [dash[1].trim(), dash[2].trim()];
  if (channelArtist && fold(rest) === fold(channelArtist)) return { song: first, artist: rest };
  return { song: rest, artist: first };
}

const fold = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Who a video is by, normalised for matching ("KR$NA - Topic" and "Kr$na"
// are the same artist) - Add songs guesses a song's board from this.
export function artistKey(video) {
  return fold(songLabel(video).artist).replace(/\s+/g, ' ').trim();
}

// Search used by the board's Find and the tier page's filter: every word of
// the query must appear (any order) in the video's title, channel or the
// artist shown on its tile. Case- and accent-insensitive ("beyonce" finds
// "Beyoncé").
export function videoMatches(video, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([video.title, video.channelTitle, songLabel(video).artist].filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}

// A playlist's cover, or null when it has none. YouTube never omits the
// thumbnail - an empty playlist (or one whose first video is gone) gets its
// grey "•••" placeholder `/img/no_thumbnail.jpg`, which we treat as no art.
export function playlistThumbnail(playlist) {
  const url = playlist?.thumbnail;
  return url && !url.includes('/no_thumbnail') ? url : null;
}
