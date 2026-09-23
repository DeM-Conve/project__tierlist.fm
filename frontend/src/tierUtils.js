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


// Bracketed noise YouTube titles carry: "(Official Music Video)", "[Lyrics]",
// "(Audio)", "(prod. X)", "| Album name" ...
const TITLE_NOISE =
  /\s*[([{][^)\]}]*\b(official|video|audio|lyrics?|lyrical|visuali[sz]er|mv|m\/v|hd|4k|prod\.?|full song|explicit)\b[^)\]}]*[)\]}]/gi;
const CHANNEL_NOISE = /\s*(-\s*topic|vevo|official)\s*$/i;

// What a tile shows: the song name and who it's by, from the video's own
// metadata. Handles the common "Artist - Song (Official Video)" shape; any
// other title is the song, with the channel as the artist.
export function songLabel(video) {
  const clean = (video.title || '').replace(TITLE_NOISE, '').split(/\s[|｜]\s/)[0].trim();
  const dash = clean.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dash) return { song: dash[2].trim(), artist: dash[1].trim() };
  return { song: clean || video.title || '', artist: (video.channelTitle || '').replace(CHANNEL_NOISE, '').trim() };
}

const fold = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Who a video is by, normalised for matching ("KR$NA - Topic" and "Kr$na"
// are the same artist) - the Inbox guesses a song's board from this.
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
