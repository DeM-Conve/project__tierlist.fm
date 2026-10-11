import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  BOARD_CACHE_MAX_AGE,
  boardCachePersistOptions,
  claimBoardCache,
  clearBoardCache,
  createBoardCachePersister,
} from './boardCache';
import { createQueryClient } from './queryClient';
import QueryProvider from './QueryProvider';
import { queryKeys } from './queryKeys';
import { duelKeys, useAuthStatusQuery, useTierBoardQueries } from './queries';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./client', () => ({ api }));

const PLAYLISTS = [{ id: 'PLs', title: 'Rock S' }];
const CACHED_ITEMS = [{ videoId: 'cached00001', title: 'From the cache' }];
const FRESH_ITEMS = [{ videoId: 'fresh000001', title: 'From YouTube' }];
const EARLIER = Date.now() - 60 * 60 * 1000; // an hour ago: a previous visit

// A persister over the real idb-keyval storage (fake-indexeddb here),
// cleared between tests.
let persister;
beforeEach(async () => {
  persister = createBoardCachePersister();
  await clearBoardCache(persister);
  api.get.mockReset();
  api.post.mockReset();
});
afterEach(() => vi.restoreAllMocks());

// Fills a client as an earlier visit by `owner` left it, and saves it.
async function seedCache(owner = 'alice') {
  const client = createQueryClient();
  client.setQueryData(queryKeys.cacheOwner, owner, { updatedAt: EARLIER });
  client.setQueryData(queryKeys.playlists, PLAYLISTS, { updatedAt: EARLIER });
  client.setQueryData(queryKeys.playlistItems('PLs'), CACHED_ITEMS, { updatedAt: EARLIER });
  await persistQueryClientSave({ queryClient: client, ...boardCachePersistOptions(persister) });
  // the async persister throttles writes; wait for this one to reach IndexedDB
  await waitFor(async () => expect(await persister.restoreClient()).toBeTruthy());
}

async function restoreInto(client = createQueryClient()) {
  await persistQueryClientRestore({ queryClient: client, ...boardCachePersistOptions(persister) });
  return client;
}

describe('what the board cache keeps', () => {
  it('only the playlists list, playlist items and whose they are - never settings, duels, auth or mutations', async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.playlists, PLAYLISTS);
    client.setQueryData(queryKeys.playlistItems('PLs'), CACHED_ITEMS);
    client.setQueryData(queryKeys.cacheOwner, 'alice');
    client.setQueryData(queryKeys.authStatus, { loggedIn: true, userId: 'alice' });
    client.setQueryData(['settings'], { settings: {}, etag: '"1"' });
    client.setQueryData(duelKeys.analysis('Rock', 'k'), { scores: {} });
    client.setQueryData(duelKeys.session('Rock', 's1'), { id: 's1' });
    client.setQueryData(['video', 'abc'], { videoId: 'abc' });
    const { result } = renderHook(
      () => useMutation({ mutationKey: ['tier-sync'], mutationFn: async () => 'ok' }),
      { wrapper: ({ children }) => <QueryProvider client={client} persister={null}>{children}</QueryProvider> }
    );
    await result.current.mutateAsync();

    await persistQueryClientSave({ queryClient: client, ...boardCachePersistOptions(persister) });
    await waitFor(async () => expect(await persister.restoreClient()).toBeTruthy());
    const saved = await persister.restoreClient();
    expect(saved.clientState.queries.map((q) => q.queryKey)).toEqual([
      ['playlists'],
      ['playlist-items', 'PLs'],
      ['cache-owner'],
    ]);
    expect(saved.clientState.mutations).toEqual([]);
  });

  it('never a failed read', async () => {
    const client = createQueryClient();
    await client.prefetchQuery({
      queryKey: queryKeys.playlistItems('PLx'),
      queryFn: () => Promise.reject(new Error('quota')),
      retry: false,
    });
    client.setQueryData(queryKeys.playlists, PLAYLISTS);
    await persistQueryClientSave({ queryClient: client, ...boardCachePersistOptions(persister) });
    await waitFor(async () => expect(await persister.restoreClient()).toBeTruthy());
    const saved = await persister.restoreClient();
    expect(saved.clientState.queries.map((q) => q.queryKey)).toEqual([['playlists']]);
  });

  it('outlives a week in memory, so restored queries are not garbage-collected before they expire', () => {
    const client = createQueryClient();
    expect(client.getQueryDefaults(queryKeys.playlistItems('PLs')).gcTime).toBeGreaterThanOrEqual(BOARD_CACHE_MAX_AGE);
    expect(client.getQueryDefaults(queryKeys.playlists).gcTime).toBeGreaterThanOrEqual(BOARD_CACHE_MAX_AGE);
    expect(boardCachePersistOptions(persister).maxAge).toBe(BOARD_CACHE_MAX_AGE);
  });
});

describe('opening a board from the cache', () => {
  function Board({ onData }) {
    const { data, isFetching } = useTierBoardQueries('Rock', { S: { id: 'PLs' } });
    useEffect(() => { if (data) onData(data); }, [data, onData]);
    return <p>{data ? `${data.S[0].title}${isFetching ? ' (refreshing)' : ''}` : 'loading'}</p>;
  }

  it('renders the cached board at once, then refreshes it from YouTube in the background', async () => {
    await seedCache();
    let answer;
    api.get.mockReturnValue(new Promise((resolve) => { answer = resolve; })); // YouTube is slow
    const client = createQueryClient();
    render(<QueryProvider client={client} persister={persister}><Board onData={() => {}} /></QueryProvider>);

    expect(await screen.findByText('From the cache (refreshing)')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/playlists/PLs/items');

    answer({ data: FRESH_ITEMS });
    expect(await screen.findByText('From YouTube')).toBeInTheDocument();
  });

  it('never shows an empty board while the cache is being restored', async () => {
    await seedCache();
    api.get.mockReturnValue(new Promise(() => {}));
    const seen = [];
    render(<QueryProvider client={createQueryClient()} persister={persister}><Board onData={(d) => seen.push(d)} /></QueryProvider>);
    await screen.findByText('From the cache (refreshing)');
    expect(seen.every((d) => d.S.length > 0)).toBe(true);
  });

  it('keeps the cached board when the refresh fails', async () => {
    await seedCache();
    const quota = Object.assign(new Error('429'), { response: { status: 429, data: { detail: 'Quota used up' } } });
    api.get.mockRejectedValue(quota);
    const client = await restoreInto();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    const wrapper = ({ children }) => <QueryProvider client={client} persister={null}>{children}</QueryProvider>;
    const { result } = renderHook(() => useTierBoardQueries('Rock', { S: { id: 'PLs' } }), { wrapper });

    await waitFor(() => expect(result.current.refreshError).toBe(quota));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({ S: CACHED_ITEMS });
  });
});

describe('whose cache it is', () => {
  it('the same account keeps its cache', async () => {
    await seedCache('alice');
    const client = await restoreInto();
    claimBoardCache(client, 'alice');
    expect(client.getQueryData(queryKeys.playlists)).toEqual(PLAYLISTS);
  });

  it('another account never sees it: every cached read is dropped before auth resolves', async () => {
    await seedCache('alice');
    const client = await restoreInto();
    api.get.mockResolvedValue({ data: { loggedIn: true, userId: 'bob' } });
    const wrapper = ({ children }) => <QueryProvider client={client} persister={null}>{children}</QueryProvider>;
    const { result } = renderHook(() => ({ auth: useAuthStatusQuery(), client: useQueryClient() }), { wrapper });

    await waitFor(() => expect(result.current.auth.data?.userId).toBe('bob'));
    expect(client.getQueryData(queryKeys.playlists)).toBeUndefined();
    expect(client.getQueryData(queryKeys.playlistItems('PLs'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.cacheOwner)).toBe('bob');
  });

  it('an account the server does not name (no userId) never sees it either', async () => {
    await seedCache('alice');
    const client = await restoreInto();
    claimBoardCache(client, undefined);
    expect(client.getQueryData(queryKeys.playlists)).toBeUndefined();
  });

  it('logout wipes it from the device', async () => {
    await seedCache();
    await clearBoardCache(persister);
    expect(await persister.restoreClient()).toBeUndefined();
    const client = await restoreInto();
    expect(client.getQueryData(queryKeys.playlists)).toBeUndefined();
  });

  it('a cache from an older build schema is dropped', async () => {
    await seedCache();
    const client = createQueryClient();
    await persistQueryClientRestore({ queryClient: client, ...boardCachePersistOptions(persister), buster: 'board-cache-v0' });
    expect(client.getQueryData(queryKeys.playlists)).toBeUndefined();
  });
});

describe('without a usable IndexedDB', () => {
  it('no IndexedDB: no persister, and the app runs on a plain query client', async () => {
    expect(createBoardCachePersister(null)).toBeNull();
    api.get.mockResolvedValue({ data: FRESH_ITEMS });
    const client = createQueryClient();
    const wrapper = ({ children }) => <QueryProvider client={client} persister={null}>{children}</QueryProvider>;
    const { result } = renderHook(() => useTierBoardQueries('Rock', { S: { id: 'PLs' } }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ S: FRESH_ITEMS }));
  });

  it('IndexedDB that refuses to open (private mode): reads are "no cache", writes are skipped', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('blocked'); });
    const blocked = createBoardCachePersister();
    expect(await blocked.restoreClient()).toBeUndefined();
    await expect(blocked.removeClient()).resolves.toBeUndefined();

    api.get.mockResolvedValue({ data: FRESH_ITEMS });
    const client = createQueryClient();
    const wrapper = ({ children }) => <QueryProvider client={client} persister={blocked}>{children}</QueryProvider>;
    const { result } = renderHook(() => useTierBoardQueries('Rock', { S: { id: 'PLs' } }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ S: FRESH_ITEMS }));
  });

  it('a cache that fails to restore still lets the app load', async () => {
    const broken = { restoreClient: () => Promise.reject(new Error('corrupt')), persistClient: async () => {}, removeClient: async () => {} };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.get.mockResolvedValue({ data: FRESH_ITEMS });
    const wrapper = ({ children }) => <QueryProvider client={createQueryClient()} persister={broken}>{children}</QueryProvider>;
    const { result } = renderHook(() => useTierBoardQueries('Rock', { S: { id: 'PLs' } }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ S: FRESH_ITEMS }));
  });
});
