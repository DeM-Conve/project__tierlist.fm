import { createStore, del, get, set } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { queryKeys } from './queryKeys';

// The board cache: a copy of the playlists list and each playlist's items,
// kept in this browser's IndexedDB by TanStack Query's persister, so a big
// board (hundreds of songs - YouTube's playlist-items reads are slow) opens
// at once from the last copy while the fresh one loads in the background.
//
// Only YouTube *reads* are kept. Never mutations, settings (the account's row
// wins, see useSettingsSync), duel analysis / sessions (they live in Postgres
// and must be fresh) or auth status (who is logged in is always asked).
const PERSISTED_ROOTS = new Set([
  queryKeys.playlists[0],
  queryKeys.playlistItemsRoot[0],
  queryKeys.cacheOwner[0],
]);

// Bump when the shape of a cached playlist / item changes: a cache written by
// an older build is then dropped instead of being read wrongly.
export const BOARD_CACHE_SCHEMA = 1;
export const BOARD_CACHE_BUSTER = `board-cache-v${BOARD_CACHE_SCHEMA}`;
export const BOARD_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function isPersistedKey(queryKey) {
  return PERSISTED_ROOTS.has(queryKey?.[0]);
}

export function shouldPersistQuery(query) {
  return query.state.status === 'success' && isPersistedKey(query.queryKey);
}

// When this page loaded. Data older than this can only have come from the
// board cache, so it's shown at once but still refetched (staleTime 0) -
// everything fetched this session stays fresh (Infinity, quota - see main.jsx).
export const SESSION_START = Date.now();
export const staleUnlessFromCache = (query) => (query.state.dataUpdatedAt < SESSION_START ? 0 : Infinity);

// Gives the persisted queries a gcTime that outlives maxAge (else they'd be
// garbage-collected from memory - and so from the next save - long before
// the cache expires), and the owner marker no gc at all.
export function configureBoardCache(queryClient) {
  queryClient.setQueryDefaults(queryKeys.playlists, { gcTime: BOARD_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(queryKeys.playlistItemsRoot, { gcTime: BOARD_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(queryKeys.cacheOwner, { gcTime: Infinity });
  return queryClient;
}

// The cache belongs to one account: its id is kept beside the data (the
// cacheOwner query, persisted with it). Called with the signed-in user's id
// before anything reads the cached playlists - a different (or unknown)
// account drops every cached YouTube read first.
export function claimBoardCache(queryClient, userId) {
  const owner = queryClient.getQueryData(queryKeys.cacheOwner);
  if (owner === userId && userId) return;
  queryClient.removeQueries({ predicate: (q) => isPersistedKey(q.queryKey) });
  if (userId) queryClient.setQueryData(queryKeys.cacheOwner, userId);
}

// IndexedDB through idb-keyval, every call allowed to fail: private mode,
// a blocked or full store, no IndexedDB at all. A failed read is "no cache",
// a failed write is skipped - the app then just works as it did without one.
function safeStorage() {
  let store;
  const db = () => (store ??= createStore('tierlistfm', 'query-cache'));
  return {
    getItem: async (key) => {
      try { return await get(key, db()); } catch { return undefined; }
    },
    setItem: async (key, value) => {
      try { await set(key, value, db()); } catch { /* no cache this time */ }
    },
    removeItem: async (key) => {
      try { await del(key, db()); } catch { /* nothing to remove */ }
    },
  };
}

export function hasIndexedDb() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

// null when this browser has no IndexedDB - main.jsx then uses a plain
// QueryClientProvider, exactly as before the cache existed.
export function createBoardCachePersister(storage = hasIndexedDb() ? safeStorage() : null) {
  if (!storage) return null;
  return createAsyncStoragePersister({
    storage,
    key: 'board-cache',
    // IndexedDB stores structured clones: no JSON round trip needed.
    serialize: (client) => client,
    deserialize: (client) => client,
  });
}

export const boardCachePersister = createBoardCachePersister();

export function boardCachePersistOptions(persister = boardCachePersister) {
  return {
    persister,
    maxAge: BOARD_CACHE_MAX_AGE,
    buster: BOARD_CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery, shouldDehydrateMutation: () => false },
  };
}

// Logout: forget this account's copy on this device.
export async function clearBoardCache(persister = boardCachePersister) {
  await persister?.removeClient();
}
