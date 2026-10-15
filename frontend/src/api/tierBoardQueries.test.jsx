import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePrefetchBoard, useTierBoardQueries } from './queries';
import { createQueryClient } from './queryClient';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({ api }));

const tiers = { S: { id: 'PLs' }, B: { id: 'PLb' } };
let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.get.mockReset();
});

describe('useTierBoardQueries', () => {
  it('gives each present tier its playlist items', async () => {
    api.get.mockImplementation(async (url) => ({ data: [{ videoId: url.includes('PLs') ? 'sssssssssss' : 'bbbbbbbbbbb' }] }));
    const { result } = renderHook(() => useTierBoardQueries('Indie', tiers), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ S: [{ videoId: 'sssssssssss' }], B: [{ videoId: 'bbbbbbbbbbb' }] });
    expect(result.current.error).toBeNull();
  });

  // A failed playlist read used to come back as an empty tier: the board then
  // "loaded" with no songs and the duel hub analysed an empty layout - an
  // empty score map at 0% certainty with "9 duels so far".
  it('a failed playlist read is an error, never an empty tier', async () => {
    const quota = Object.assign(new Error('429'), { response: { status: 429, data: { detail: 'Quota used up' } } });
    api.get.mockImplementation(async (url) => {
      if (url.includes('PLb')) throw quota;
      return { data: [{ videoId: 'sssssssssss' }] };
    });
    const { result } = renderHook(() => useTierBoardQueries('Indie', tiers), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(quota));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);

    api.get.mockResolvedValue({ data: [{ videoId: 'bbbbbbbbbbb' }] });
    result.current.retry();
    await waitFor(() => expect(result.current.data?.B).toEqual([{ videoId: 'bbbbbbbbbbb' }]));
    expect(result.current.error).toBeNull();
  });
});

describe('usePrefetchBoard', () => {
  // The app's own rules (createQueryClient): data fetched this session never
  // goes stale, so a prefetched board opens from cache without a second read.
  it('loads every tier playlist once, and opening the board then reads none again', async () => {
    client = createQueryClient();
    api.get.mockImplementation(async (url) => ({ data: [{ videoId: url.includes('PLs') ? 'sssssssssss' : 'bbbbbbbbbbb' }] }));
    const { result: prefetch } = renderHook(() => usePrefetchBoard(), { wrapper });

    prefetch.current(tiers);
    prefetch.current(tiers); // resting on it again: nothing new
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls.map(([url]) => url).sort()).toEqual(['/api/playlists/PLb/items', '/api/playlists/PLs/items']);

    const { result } = renderHook(() => useTierBoardQueries('Indie', tiers), { wrapper });
    expect(result.current.data).toEqual({ S: [{ videoId: 'sssssssssss' }], B: [{ videoId: 'bbbbbbbbbbb' }] });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('a board with no playlists yet loads nothing', () => {
    const { result } = renderHook(() => usePrefetchBoard(), { wrapper });
    result.current(undefined);
    result.current({});
    expect(api.get).not.toHaveBeenCalled();
  });
});
