import { QueryClient } from '@tanstack/react-query';
import { configureBoardCache, staleUnlessFromCache } from './boardCache';

// The app's one QueryClient (main.jsx), a factory so tests get the same rules.
export function createQueryClient() {
  return configureBoardCache(new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        // Every YouTube read costs API quota (10,000 units/day for the whole
        // app), so data is never refetched just because a page remounted:
        // it stays until this app changes it (each write invalidates or
        // patches the queries it touched) or the page is reloaded. The one
        // exception is a copy restored from the board cache (IndexedDB,
        // boardCache.js): shown at once, refetched in the background.
        staleTime: staleUnlessFromCache,
      },
    },
  }));
}
