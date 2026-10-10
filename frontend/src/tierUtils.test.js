import { describe, expect, it } from 'vitest';
import {
  TIER_INK,
  artistKey,
  indexForPointInFlow,
  dropIndexAtOffset,
  playlistThumbnail,
  songLabel,
  videoMatches,
  youtubeUrl,
} from './tierUtils';

describe('TIER_INK / youtubeUrl', () => {
  it('TIER_INK is a CSS variable', () => {
    expect(TIER_INK).toBe('var(--tier-ink)');
  });

  it('youtubeUrl builds a watch link', () => {
    expect(youtubeUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
  });
});

describe('songLabel', () => {
  it('splits "Artist - Song"', () => {
    expect(songLabel({ title: 'Some Artist - Great Song', channelTitle: 'X' })).toEqual({ song: 'Great Song', artist: 'Some Artist' });
  });

  it('strips bracketed noise', () => {
    expect(songLabel({ title: 'Band - Tune (Official Music Video)' })).toEqual({ song: 'Tune', artist: 'Band' });
    expect(songLabel({ title: 'Band - Tune [Lyrics]' }).song).toBe('Tune');
    expect(songLabel({ title: 'Band - Tune (Audio) [HD]' }).song).toBe('Tune');
    expect(songLabel({ title: 'Band - Tune (prod. Someone)' }).song).toBe('Tune');
    expect(songLabel({ title: 'Band - Tune {4K Visualizer}' }).song).toBe('Tune');
  });

  it('keeps non-noise brackets', () => {
    expect(songLabel({ title: 'Band - Tune (Remix)' }).song).toBe('Tune (Remix)');
  });

  it('drops a trailing "| album" section', () => {
    expect(songLabel({ title: 'Band - Tune | The Album' }).song).toBe('Tune');
    expect(songLabel({ title: 'Band - Tune ｜ Full-width bar' }).song).toBe('Tune');
  });

  it('accepts en/em dashes', () => {
    expect(songLabel({ title: 'Band – Tune' })).toEqual({ song: 'Tune', artist: 'Band' });
    expect(songLabel({ title: 'Band — Tune' })).toEqual({ song: 'Tune', artist: 'Band' });
  });

  it('splits on the first " - " only', () => {
    expect(songLabel({ title: 'A - B - C' })).toEqual({ song: 'B - C', artist: 'A' });
  });

  it('a hyphen without spaces is not a separator', () => {
    expect(songLabel({ title: 'Lo-fi Song', channelTitle: 'Chan' })).toEqual({ song: 'Lo-fi Song', artist: 'Chan' });
  });

  it('falls back to the channel as artist, without " - Topic" / VEVO / Official', () => {
    expect(songLabel({ title: 'Tune', channelTitle: 'Band - Topic' })).toEqual({ song: 'Tune', artist: 'Band' });
    expect(songLabel({ title: 'Tune', channelTitle: 'BandVEVO' }).artist).toBe('Band');
    expect(songLabel({ title: 'Tune', channelTitle: 'Band Official' }).artist).toBe('Band');
  });

  it('a "- Topic" channel names the song itself: the whole title is the song, the first part kept', () => {
    expect(songLabel({ title: 'Sparkle - movie ver.', channelTitle: 'Radwimps - Topic' })).toEqual({
      song: 'Sparkle - movie ver.',
      artist: 'Radwimps',
    });
    expect(songLabel({ title: 'Nandemonaiya - movie ver.', channelTitle: 'RADWIMPS - Topic' }).song).toBe('Nandemonaiya - movie ver.');
    expect(songLabel({ title: 'Zenzenzense - movie ver. (Official Audio)', channelTitle: 'Radwimps - Topic' }).song).toBe(
      'Zenzenzense - movie ver.'
    );
  });

  it('"Song - Artist" (the part after the dash is the channel) keeps the song first', () => {
    expect(songLabel({ title: 'Sparkle - RADWIMPS', channelTitle: 'RADWIMPS' })).toEqual({ song: 'Sparkle', artist: 'RADWIMPS' });
    expect(songLabel({ title: 'Tune – Band', channelTitle: 'BandVEVO' })).toEqual({ song: 'Tune', artist: 'Band' });
    expect(songLabel({ title: 'Canción - Beyonce', channelTitle: 'Beyoncé' })).toEqual({ song: 'Canción', artist: 'Beyonce' });
  });

  it('"Artist - Song" from the artist\'s own channel still splits as before', () => {
    expect(songLabel({ title: 'RADWIMPS - Sparkle (Official Video)', channelTitle: 'RADWIMPS' })).toEqual({
      song: 'Sparkle',
      artist: 'RADWIMPS',
    });
  });

  it('missing title / channel', () => {
    expect(songLabel({})).toEqual({ song: '', artist: '' });
    expect(songLabel({ title: 'Only' })).toEqual({ song: 'Only', artist: '' });
  });

  it('a title that is all noise falls back to the raw title', () => {
    expect(songLabel({ title: '(Official Video)', channelTitle: 'C' })).toEqual({ song: '(Official Video)', artist: 'C' });
  });

  it('unicode titles', () => {
    expect(songLabel({ title: 'Beyoncé - Canción (Lyrics)' })).toEqual({ song: 'Canción', artist: 'Beyoncé' });
    expect(songLabel({ title: '歌手 - 曲名' })).toEqual({ song: '曲名', artist: '歌手' });
  });
});

describe('artistKey', () => {
  it('normalises case, accents, whitespace and channel suffixes', () => {
    expect(artistKey({ title: 'Tune', channelTitle: 'Beyoncé - Topic' })).toBe('beyonce');
    expect(artistKey({ title: 'BEYONCE  - Tune' })).toBe('beyonce');
  });

  it('collapses internal whitespace', () => {
    expect(artistKey({ title: 'Tune', channelTitle: 'The   Band' })).toBe('the band');
  });

  it('empty when unknown', () => {
    expect(artistKey({ title: 'Tune' })).toBe('');
  });
});

describe('videoMatches', () => {
  const video = { title: 'Beyoncé - Halo (Official Video)', channelTitle: 'Beyoncé VEVO' };

  it('empty or whitespace query matches everything', () => {
    expect(videoMatches(video, '')).toBe(true);
    expect(videoMatches(video, '   ')).toBe(true);
  });

  it('is case- and accent-insensitive', () => {
    expect(videoMatches(video, 'beyonce')).toBe(true);
    expect(videoMatches(video, 'HALO')).toBe(true);
    expect(videoMatches({ title: 'beyonce' }, 'Beyoncé')).toBe(true);
  });

  it('every word must appear, in any order', () => {
    expect(videoMatches(video, 'halo beyonce')).toBe(true);
    expect(videoMatches(video, 'halo metallica')).toBe(false);
  });

  it('matches the channel too', () => {
    expect(videoMatches(video, 'vevo')).toBe(true);
  });

  it('matches substrings', () => {
    expect(videoMatches(video, 'hal')).toBe(true);
  });

  it('works with missing fields', () => {
    expect(videoMatches({}, 'x')).toBe(false);
    expect(videoMatches({ channelTitle: 'Chan' }, 'chan')).toBe(true);
  });
});

describe('playlistThumbnail', () => {
  it('returns the thumbnail url', () => {
    expect(playlistThumbnail({ thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg' })).toBe('https://i.ytimg.com/vi/x/hq.jpg');
  });

  it('treats YouTube’s no_thumbnail placeholder as none', () => {
    expect(playlistThumbnail({ thumbnail: 'https://i.ytimg.com/img/no_thumbnail.jpg' })).toBeNull();
  });

  it('null for missing playlist / thumbnail', () => {
    expect(playlistThumbnail(null)).toBeNull();
    expect(playlistThumbnail(undefined)).toBeNull();
    expect(playlistThumbnail({})).toBeNull();
    expect(playlistThumbnail({ thumbnail: '' })).toBeNull();
  });
});

// jsdom has no layout, so give each tile a fake bounding box.
function container(rects) {
  const el = document.createElement('div');
  rects.forEach((r, i) => {
    const tile = document.createElement('div');
    tile.setAttribute('data-video-id', `v${i}`);
    tile.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height });
    el.appendChild(tile);
  });
  // A non-tile child must be ignored.
  el.appendChild(document.createElement('span'));
  return el;
}

describe('indexForPointInFlow', () => {
  // Two rows of two 100x100 tiles.
  const grid = () =>
    container([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 100, top: 0, width: 100, height: 100 },
      { left: 0, top: 100, width: 100, height: 100 },
      { left: 100, top: 100, width: 100, height: 100 },
    ]);

  it('no container -> 0', () => {
    expect(indexForPointInFlow(null, 0, 0)).toBe(0);
  });

  it('empty container -> 0', () => {
    expect(indexForPointInFlow(container([]), 10, 10)).toBe(0);
  });

  it('left half of a tile -> before it', () => {
    expect(indexForPointInFlow(grid(), 10, 50)).toBe(0);
    expect(indexForPointInFlow(grid(), 110, 50)).toBe(1);
    expect(indexForPointInFlow(grid(), 110, 150)).toBe(3);
  });

  it('right half of the last tile in a row -> start of next row', () => {
    expect(indexForPointInFlow(grid(), 190, 50)).toBe(2);
  });

  it('above everything -> 0', () => {
    expect(indexForPointInFlow(grid(), 500, -10)).toBe(0);
  });

  it('past the end -> length', () => {
    expect(indexForPointInFlow(grid(), 190, 150)).toBe(4);
    expect(indexForPointInFlow(grid(), 0, 999)).toBe(4);
  });
});

describe('dropIndexAtOffset', () => {
  // Three 40px rows starting 100px down (the list's scrollMargin), with the
  // virtualizer's nearest-start lookup.
  const rows = [0, 1, 2].map((index) => ({ index, start: 100 + index * 40, size: 40 }));
  const virtualizer = (items) => ({
    getVirtualItemForOffset: (offset) => (items.length ? [...items].reverse().find((r) => r.start <= offset) ?? items[0] : undefined),
  });

  it('an empty list -> 0', () => {
    expect(dropIndexAtOffset(virtualizer([]), 10)).toBe(0);
  });

  it('above a row’s midpoint -> before it, below -> after it', () => {
    expect(dropIndexAtOffset(virtualizer(rows), 50)).toBe(0);
    expect(dropIndexAtOffset(virtualizer(rows), 105)).toBe(0);
    expect(dropIndexAtOffset(virtualizer(rows), 125)).toBe(1);
    expect(dropIndexAtOffset(virtualizer(rows), 159)).toBe(1);
    expect(dropIndexAtOffset(virtualizer(rows), 161)).toBe(2);
  });

  it('below the last midpoint -> length', () => {
    expect(dropIndexAtOffset(virtualizer(rows), 999)).toBe(3);
  });
});
