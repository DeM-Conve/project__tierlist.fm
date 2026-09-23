import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { TIER_ORDER } from '../tiers';

export function useAuthStatusQuery() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => (await api.get('/api/auth/status')).data,
    retry: false,
    staleTime: Infinity,
  });
}

export function usePlaylistsQuery(enabled) {
  return useQuery({
    queryKey: ['playlists'],
    queryFn: async () => (await api.get('/api/playlists')).data,
    enabled,
  });
}

export function usePlaylistItemsQuery(playlistId) {
  return useQuery({
    queryKey: ['playlist-items', playlistId],
    queryFn: async () => (await api.get(`/api/playlists/${playlistId}/items`)).data,
    enabled: !!playlistId,
  });
}

// One query per tier's underlying playlist, run in parallel and combined -
// a tier board is really N independent playlists rendered as one page.
// Each is cached by playlist id, so re-visiting a board (or a duel) that's
// still fresh serves instantly from cache instead of refetching.
export function useTierBoardQueries(category, tiers) {
  const presentTiers = tiers ? TIER_ORDER.filter((t) => tiers[t]) : [];

  const results = useQueries({
    queries: presentTiers.map((t) => ({
      queryKey: ['playlist-items', tiers[t].id],
      queryFn: async () => (await api.get(`/api/playlists/${tiers[t].id}/items`)).data,
    })),
  });

  const isLoading = presentTiers.length > 0 && results.some((r) => r.isLoading);
  const data = isLoading
    ? null
    : Object.fromEntries(presentTiers.map((t, i) => [t, results[i]?.data || []]));

  return { data, isLoading, presentTiers };
}

export function useTierSyncMutation() {
  return useMutation({
    mutationFn: async (payload) => (await api.post('/api/tier-sync', payload)).data,
  });
}

// Invalidates every playlist-items query for a board's underlying
// playlists, so the next mount/refetch pulls fresh data after a sync
// actually changed what's on YouTube.
export function useInvalidatePlaylistItems() {
  const queryClient = useQueryClient();
  return (playlistIds) =>
    Promise.all(
      playlistIds.map((id) => queryClient.invalidateQueries({ queryKey: ['playlist-items', id] }))
    );
}

// Naming-template migration job: [{ id, title }] -> per-item results.
// Refetches the playlist list afterwards so boards regroup under new names.
// (The job runs this in batches for progress, then refreshes the list once
// via useInvalidatePlaylists.)
export function useRenamePlaylistsMutation() {
  return useMutation({
    mutationFn: async (renames) => (await api.post('/api/playlists/rename', renames)).data,
  });
}

export function useInvalidatePlaylists() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['playlists'] });
}

// New tier list / missing tiers: [{ title, privacyStatus? }] -> per-item results.
export function useCreatePlaylistsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (playlists) => (await api.post('/api/playlists/create', playlists)).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['playlists'] }),
  });
}

// The account's saved settings (Postgres `user_settings` row) as
// `{ settings, etag }`: settings is `{ appearance, naming, prefs }` (backend
// SettingsDto) or null if the account has never saved (204); etag is the
// row's version, which every save must quote back (see useSettingsSync).
export function useSettingsQuery(enabled) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/api/settings');
      return { settings: res.status === 204 ? null : res.data, etag: res.headers.etag ?? null };
    },
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

// Conditional save: `If-Match: <etag>` updates the version we last saw,
// `If-None-Match: *` creates the account's first row. Fails with 412 when
// someone else saved in between - the caller merges and retries.
export function useSaveSettingsMutation() {
  return useMutation({
    mutationFn: async ({ settings, etag }) => {
      const headers = etag ? { 'If-Match': etag } : { 'If-None-Match': '*' };
      const res = await api.put('/api/settings', settings, { headers });
      return { settings: res.data, etag: res.headers.etag ?? null };
    },
  });
}
