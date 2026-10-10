import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  duelKeys, useDuelAnalysisQuery, useDuelDecisionMutation, useDuelLockMutation, useDuelSessionQuery, useDuelSummaryQuery,
  useDuelVerdictMutation, useEndDuelMutation, useRenameDuelBoardMutation, useStartDuelMutation,
} from './queries';

const api = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock('./client', () => ({ api, errorMessage: (e, f) => f }));

const layout = { tiers: { S: ['sssssssssss'] } };
let client;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  Object.values(api).forEach((f) => f.mockReset());
});

describe('duel API hooks', () => {
  it('analysis posts the board layout to the board (name URL-encoded)', async () => {
    api.post.mockResolvedValue({ data: { certainty: 0.5 } });
    const { result } = renderHook(() => useDuelAnalysisQuery('Indie Indian', { layout, key: 'k1' }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ certainty: 0.5 }));
    expect(api.post).toHaveBeenCalledWith('/api/duels/Indie%20Indian/analysis', { layout });
  });

  it('a session read resumes it; start / verdict replace the cached session', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 's1', duels: [] } });
    const start = renderHook(() => useStartDuelMutation('Rock'), { wrapper });
    await act(() => start.result.current.mutateAsync({ layout, focus: 'SMART_MIX', songId: null, minutes: 5 }));
    expect(api.post).toHaveBeenLastCalledWith('/api/duels/Rock/sessions', { layout, focus: 'SMART_MIX', songId: null, minutes: 5 });
    expect(client.getQueryData(duelKeys.session('Rock', 's1'))).toEqual({ id: 's1', duels: [] });

    api.post.mockResolvedValueOnce({ data: { id: 's1', duels: [{ id: 1 }] } });
    const verdict = renderHook(() => useDuelVerdictMutation('Rock', 's1'), { wrapper });
    await act(() => verdict.result.current.mutateAsync({ layout, a: 'x', b: 'y', verdict: 'A' }));
    expect(api.post).toHaveBeenLastCalledWith('/api/duels/Rock/sessions/s1/verdicts', { layout, a: 'x', b: 'y', verdict: 'A' });
    expect(client.getQueryData(duelKeys.session('Rock', 's1')).duels).toHaveLength(1);

    const read = renderHook(() => useDuelSessionQuery('Rock', 's1', { layout }), { wrapper });
    expect(read.result.current.data.duels).toHaveLength(1); // served from the cache, not refetched
  });

  it('ending a session caches its summary and drops the session', async () => {
    client.setQueryData(duelKeys.session('Rock', 's1'), { id: 's1' });
    api.post.mockResolvedValue({ data: { duels: 3 } });
    const end = renderHook(() => useEndDuelMutation('Rock', 's1'), { wrapper });
    await act(() => end.result.current.mutateAsync({ layout }));
    expect(api.post).toHaveBeenCalledWith('/api/duels/Rock/sessions/s1/end', { layout });
    expect(client.getQueryData(duelKeys.summary('Rock', 's1'))).toEqual({ duels: 3 });
    expect(client.getQueryData(duelKeys.session('Rock', 's1'))).toBeUndefined();
    const summary = renderHook(() => useDuelSummaryQuery('Rock', 's1', { layout }), { wrapper });
    expect(summary.result.current.data).toEqual({ duels: 3 });
  });

  it('decisions and locks: PUT to record, DELETE to take back', async () => {
    api.put.mockResolvedValue({});
    api.delete.mockResolvedValue({});
    const decision = renderHook(() => useDuelDecisionMutation('Rock'), { wrapper });
    await act(() => decision.result.current.mutateAsync({ videoId: 'v', decision: 'KEPT', from: 'A', to: 'S', confidence: 0.9 }));
    expect(api.put).toHaveBeenCalledWith('/api/duels/Rock/decisions/v', { decision: 'KEPT', from: 'A', to: 'S', confidence: 0.9 });
    await act(() => decision.result.current.mutateAsync({ videoId: 'v', decision: null }));
    expect(api.delete).toHaveBeenCalledWith('/api/duels/Rock/decisions/v');
    const lock = renderHook(() => useDuelLockMutation('Rock'), { wrapper });
    await act(() => lock.result.current.mutateAsync({ videoId: 'v', locked: true }));
    expect(api.put).toHaveBeenLastCalledWith('/api/duels/Rock/locks/v');
    await act(() => lock.result.current.mutateAsync({ videoId: 'v', locked: false }));
    expect(api.delete).toHaveBeenLastCalledWith('/api/duels/Rock/locks/v');
  });

  it('a board rename moves its duel history to the new name', async () => {
    api.post.mockResolvedValue({});
    const rename = renderHook(() => useRenameDuelBoardMutation(), { wrapper });
    await act(() => rename.result.current.mutateAsync({ from: 'Old Name', to: 'New' }));
    expect(api.post).toHaveBeenCalledWith('/api/duels/Old%20Name/rename', { to: 'New' });
  });
});
