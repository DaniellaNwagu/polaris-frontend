'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Per-query option to opt into focus refetch for live market data
 * (price/state/fee/position). Global default stays off so admin and list
 * queries don't refetch on tab focus. Focus refetch still respects the
 * query's `staleTime`, so it won't cause a refetch storm.
 */
export const refetchOnFocus = { refetchOnWindowFocus: true } as const;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
