// Query keys shared between the query hooks (queries.js) and the board
// cache (boardCache.js), which persists some of them by key.
export const queryKeys = {
  authStatus: ['auth-status'],
  playlists: ['playlists'],
  playlistItemsRoot: ['playlist-items'],
  playlistItems: (playlistId) => ['playlist-items', playlistId],
  // Whose YouTube data the board cache holds (see claimBoardCache).
  cacheOwner: ['cache-owner'],
};
