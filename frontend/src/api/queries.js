import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { BOARD_TIERS } from '../tiers';

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
  const presentTiers = tiers ? BOARD_TIERS.filter((t) => tiers[t]) : [];

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

// ---- Add songs -----------------------------------------------------------

// Music-only YouTube search. Each query is cached for the session - a search
// costs 100 quota units, so the same words never hit YouTube twice.
export function useSongSearchQuery(q) {
  return useQuery({
    queryKey: ['song-search', q],
    queryFn: async () => (await api.get('/api/search', { params: { q } })).data,
    enabled: !!q,
    staleTime: Infinity,
    retry: false,
  });
}

// Every tier playlist's items, across all boards - what "Add songs" checks a
// song against ("already in a tier?") and learns artist -> board from. Same
// query keys as the boards' own, so opening a board afterwards is instant.
// Pass null to hold off (it's ~one request per tier playlist).
export function useAllTierItemsQueries(tierPlaylists) {
  const results = useQueries({
    queries: (tierPlaylists ?? []).map((p) => ({
      queryKey: ['playlist-items', p.id],
      queryFn: async () => (await api.get(`/api/playlists/${p.id}/items`)).data,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const loaded = results.filter((r) => r.data).length;
  return {
    total: tierPlaylists?.length ?? 0,
    loaded,
    isLoading: !tierPlaylists || loaded < tierPlaylists.length,
    itemsByPlaylist: Object.fromEntries((tierPlaylists ?? []).map((p, i) => [p.id, results[i]?.data])),
  };
}

// One video's details for a pasted link; cached per id.
export function useFetchVideo() {
  const queryClient = useQueryClient();
  return (videoId) =>
    queryClient.fetchQuery({
      queryKey: ['video', videoId],
      queryFn: async () => (await api.get(`/api/videos/${videoId}`)).data,
      staleTime: Infinity,
    });
}

// Files a video straight into a tier playlist on YouTube; resolves to the new
// item (with its playlistItem `id`, which undo deletes). Patches that
// playlist's cached items in place instead of refetching all of it.
export function useAddToPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playlistId, videoId }) =>
      (await api.post(`/api/playlists/${playlistId}/items`, { videoId })).data,
    onSuccess: (item, { playlistId, video }) => {
      queryClient.setQueryData(['playlist-items', playlistId], (old) =>
        old ? [...old, { ...video, ...item, channelTitle: item.channelTitle ?? video.channelTitle }] : old
      );
      queryClient.invalidateQueries({ queryKey: ['playlists'] }); // item counts
    },
  });
}

export function useRemovePlaylistItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }) => (await api.delete(`/api/playlist-items/${itemId}`)).data,
    onSuccess: (_, { playlistId, itemId }) => {
      queryClient.setQueryData(['playlist-items', playlistId], (old) => old?.filter((v) => v.id !== itemId));
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}
