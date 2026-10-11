import { describe, expect, it } from 'vitest';
import { filterPickerSongs, pickerTiers, sortPickerSongs } from './songPicker';

const s = (id, tier, title, channelTitle = 'Band') => ({ id, tier, video: { videoId: id, title, channelTitle } });
const songs = [s('a1', 'A', 'Middle Song'), s('t1', 'TODO', 'New Song'), s('s1', 'S', 'Beyoncé - Halo', 'Beyoncé'), s('a2', 'A', 'Other Song', 'Crew')];

describe('songPicker', () => {
  it('sorts best tier first, keeping the order inside a tier', () => {
    expect(sortPickerSongs(songs).map((x) => x.id)).toEqual(['s1', 'a1', 'a2', 't1']);
  });

  it('offers a chip only for tiers that hold a song, TODO included, in board order', () => {
    expect(pickerTiers(songs)).toEqual(['S', 'A', 'TODO']);
  });

  it('matches every word in any order on title or channel, accent-insensitive', () => {
    expect(filterPickerSongs(songs, 'song other', null).map((x) => x.id)).toEqual(['a2']);
    expect(filterPickerSongs(songs, 'crew', null).map((x) => x.id)).toEqual(['a2']);
    expect(filterPickerSongs(songs, 'beyonce', null).map((x) => x.id)).toEqual(['s1']);
    expect(filterPickerSongs(songs, '', null)).toHaveLength(4);
  });

  it('narrows to one tier, together with the search', () => {
    expect(filterPickerSongs(songs, '', 'A').map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(filterPickerSongs(songs, 'middle', 'A').map((x) => x.id)).toEqual(['a1']);
    expect(filterPickerSongs(songs, 'middle', 'S')).toEqual([]);
  });

  it('copes with a song no longer on the board (no video)', () => {
    expect(filterPickerSongs([{ id: 'x', tier: 'S' }], '', null)).toHaveLength(1);
    expect(filterPickerSongs([{ id: 'x', tier: 'S' }], 'halo', null)).toHaveLength(0);
  });
});
