import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { boardCachePersister, boardCachePersistOptions } from './boardCache';

// TanStack Query for the app, with the board cache (IndexedDB, see
// boardCache.js) restored into it and kept up to date. Without IndexedDB
// (some private modes) - no persister - it's a plain QueryClientProvider and
// the app runs exactly as it did before there was a cache.
export default function QueryProvider({ client, persister = boardCachePersister, children }) {
  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider client={client} persistOptions={boardCachePersistOptions(persister)}>
      {children}
    </PersistQueryClientProvider>
  );
}
