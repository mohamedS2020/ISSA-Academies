'use client';

/**
 * ISSA — React Query provider.
 *
 * Adds a client-side cache so pages stop refetching the same data on every
 * navigation (the app previously fetched on mount via useState+useEffect, so
 * going back to a list always showed a spinner and re-hit the API).
 *
 * Defaults are tuned for a calm admin UI: data is considered fresh for 30s
 * (instant back-navigation), kept in cache 5min, and NOT refetched on window
 * focus. Query functions reuse the existing `authFetch` from the auth context.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser session (created lazily, never re-created on render).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
