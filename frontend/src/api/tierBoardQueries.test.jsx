import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTierBoardQueries } from './queries';

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
