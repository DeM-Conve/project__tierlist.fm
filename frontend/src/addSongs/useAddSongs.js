import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useAllTierItemsQueries } from '../api/queries';
import { selectTierCategories, selectTierPlaylists } from '../store/selectors';
import { TODO_TIER } from '../tiers';
import { artistKey } from '../tierUtils';

// "Add songs": the songs you picked (pasted links, search results) that are
// waiting for a tier, plus what's needed to file them - where each song
// already is and which board its artist lives on, learnt from every tier
// playlist's items. Those are only fetched once `enabled` (the page is open
// or something was picked), since that's one request per tier playlist.
export function useAddSongs(enabled) {
  const tierPlaylists = useSelector(selectTierPlaylists);
  const categories = useSelector(selectTierCategories);
  const session = useSelector((s) => s.addSongs);
  const all = useAllTierItemsQueries(enabled ? tierPlaylists : null);

  const index = useMemo(() => {
    // videoId -> [{ category, tier }]: where a song already is.
    const placed = new Map();
    // artist -> { category: songs by them on that board (ranked tiers only) }.
    const artistBoards = new Map();
    for (const p of tierPlaylists ?? []) {
      const { category, tier } = p.parsed;
      for (const v of all.itemsByPlaylist[p.id] ?? []) {
        placed.set(v.videoId, [...(placed.get(v.videoId) ?? []), { category, tier }]);
        if (tier === TODO_TIER) continue;
        const key = artistKey(v);
        if (!key) continue;
        const counts = artistBoards.get(key) ?? {};
        counts[category] = (counts[category] ?? 0) + 1;
        artistBoards.set(key, counts);
      }
    }
    return { placed, artistBoards };
  }, [tierPlaylists, all.itemsByPlaylist]);

  return useMemo(() => {
    const { placed, artistBoards } = index;
    const hidden = new Set(session.hidden);
    const waiting = session.queue.filter((v) => !hidden.has(v.videoId));
    // Skipped songs go to the back, in the order they were skipped.
    const skipOrder = new Map(session.skipped.map((id, i) => [id, i]));
    const list = [
      ...waiting.filter((v) => !skipOrder.has(v.videoId)),
      ...waiting
        .filter((v) => skipOrder.has(v.videoId))
        .sort((a, b) => skipOrder.get(a.videoId) - skipOrder.get(b.videoId)),
    ];
    const current = (session.currentId && list.find((v) => v.videoId === session.currentId)) || list[0] || null;

    // Which board a song most likely belongs on, and why: picked by hand,
    // else the board with the most songs by the same artist, else the board
    // the last song went to.
    function guessBoard(video) {
      if (!video || !categories.length) return null;
      const picked = session.boardFor[video.videoId];
      if (picked && categories.includes(picked)) return { category: picked, reason: null };
      const counts = artistBoards.get(artistKey(video));
      if (counts) {
        const [category, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { category, reason: `${n} ${n === 1 ? 'song' : 'songs'} by this artist here` };
      }
      if (session.lastBoard && categories.includes(session.lastBoard)) {
        return { category: session.lastBoard, reason: 'where the last one went' };
      }
      return { category: categories[0], reason: null };
    }

    // The card after `video` once it leaves the list.
    function nextAfter(video) {
      const i = list.findIndex((v) => v.videoId === video.videoId);
      const rest = list.filter((v) => v.videoId !== video.videoId);
      return rest[Math.min(i, rest.length - 1)]?.videoId ?? null;
    }

    return {
      loading: enabled && all.isLoading,
      progress: { loaded: all.loaded, total: all.total },
      list,
      current,
      placed,
      guessBoard,
      nextAfter,
      history: session.history,
    };
  }, [index, session, categories, enabled, all.isLoading, all.loaded, all.total]);
}
