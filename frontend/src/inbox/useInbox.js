import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useAllTierItemsQueries, useDismissedQuery, useLikesQuery } from '../api/queries';
import { selectTierCategories, selectTierPlaylists } from '../store/selectors';
import { TODO_TIER } from '../tiers';
import { artistKey } from '../tierUtils';

// The Inbox: songs you liked on YouTube (or pasted a link to) that aren't on
// any board yet. Built from server state - the likes, the "not a song" list
// and every tier playlist's items (which also teach it which board each
// artist lives on) - plus this session's inbox slice (skips, filed, picks).
export function useInbox() {
  const tierPlaylists = useSelector(selectTierPlaylists);
  const categories = useSelector(selectTierCategories);
  const inbox = useSelector((s) => s.inbox);
  const likes = useLikesQuery(!!tierPlaylists);
  const dismissed = useDismissedQuery(!!tierPlaylists);
  const all = useAllTierItemsQueries(tierPlaylists);

  const loading = !tierPlaylists || likes.isLoading || dismissed.isLoading || all.isLoading;

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
    const dismissedIds = new Set(dismissed.data ?? []);
    const hidden = new Set(inbox.hidden);
    const pastedIds = new Set(inbox.pasted.map((v) => v.videoId));
    const seen = new Set();
    const fresh = [];
    for (const v of [...inbox.pasted, ...(likes.data ?? [])]) {
      if (seen.has(v.videoId) || placed.has(v.videoId) || hidden.has(v.videoId)) continue;
      // An explicit paste wins over an earlier "not a song".
      if (dismissedIds.has(v.videoId) && !pastedIds.has(v.videoId)) continue;
      seen.add(v.videoId);
      fresh.push(v);
    }
    // Skipped songs go to the back, in the order they were skipped.
    const skipOrder = new Map(inbox.skipped.map((id, i) => [id, i]));
    const list = [
      ...fresh.filter((v) => !skipOrder.has(v.videoId)),
      ...fresh.filter((v) => skipOrder.has(v.videoId)).sort((a, b) => skipOrder.get(a.videoId) - skipOrder.get(b.videoId)),
    ];
    const current = (inbox.currentId && list.find((v) => v.videoId === inbox.currentId)) || list[0] || null;

    // Which board a song most likely belongs on, and why - picked by hand,
    // else the board with the most songs by the same artist, else the board
    // the last song went to.
    function guessBoard(video) {
      if (!video || !categories.length) return null;
      const picked = inbox.boardFor[video.videoId];
      if (picked && categories.includes(picked)) return { category: picked, reason: null };
      const counts = artistBoards.get(artistKey(video));
      if (counts) {
        const [category, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { category, reason: `${n} ${n === 1 ? 'song' : 'songs'} by this artist here` };
      }
      if (inbox.lastBoard && categories.includes(inbox.lastBoard)) return { category: inbox.lastBoard, reason: 'where the last one went' };
      return { category: categories[0], reason: null };
    }

    // The card after `video` once it leaves the list.
    function nextAfter(video) {
      const i = list.findIndex((v) => v.videoId === video.videoId);
      return list[i + 1]?.videoId ?? (i > 0 ? list[0].videoId : null);
    }

    return {
      loading,
      progress: { loaded: all.loaded, total: all.total },
      list,
      current,
      placed,
      guessBoard,
      nextAfter,
      history: inbox.history,
    };
  }, [index, dismissed.data, likes.data, inbox, categories, loading, all.loaded, all.total]);
}
