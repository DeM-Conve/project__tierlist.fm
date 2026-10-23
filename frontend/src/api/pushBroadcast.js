import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

// Another tab of this browser (same account - the login is the browser's)
// can write to the same playlists. Its push deletes item ids this tab still
// holds, and pushing one of those from here inserted the song into its new
// tier, then "deleted" an item that was already gone: the song ended up in
// two tiers (or a song removed there came back). So every write to a
// playlist is announced to the other tabs (BroadcastChannel), and each one
// marks those playlists' cached items invalidated - without refetching
// (quota): the next push re-reads them first and settles what the other tab
// changed (syncCache.js preparePush), with the reason shown.
const CHANNEL = 'tierlist-playlist-writes';

// Which tab a message came from: one query client per tab.
const tabIds = new WeakMap();
const tabId = (queryClient) => {
  if (!tabIds.has(queryClient)) tabIds.set(queryClient, `${Date.now()}-${Math.random()}`);
  return tabIds.get(queryClient);
};

let sender = null;
const channel = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!sender) {
    sender = new BroadcastChannel(CHANNEL);
    sender.unref?.(); // Node (tests): never keeps the process alive
  }
  return sender;
};

// This tab (`queryClient`) wrote to these playlists.
export function announceWrites(queryClient, playlistIds) {
  const ids = [...new Set(playlistIds)].filter(Boolean);
  if (ids.length) channel()?.postMessage({ from: tabId(queryClient), playlistIds: ids });
}

// Mounted once per tab (App).
export function useOtherTabWrites() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(CHANNEL);
    const me = tabId(queryClient);
    ch.onmessage = ({ data }) => {
      if (!data || data.from === me || !Array.isArray(data.playlistIds)) return;
      for (const id of data.playlistIds) {
        queryClient.invalidateQueries({ queryKey: queryKeys.playlistItems(id), refetchType: 'none' });
      }
    };
    return () => ch.close();
  }, [queryClient]);
}
