import { QueryClient } from "@tanstack/react-query";

/**
 * Shared query options for live market data (price, pool state, fees, positions).
 *
 * These queries opt into `refetchOnWindowFocus` so that returning to the tab
 * immediately refreshes stale reserves/odds instead of waiting for the next
 * poll. React Query still respects `staleTime`, so a focus event only triggers
 * a refetch when the cached data is actually stale — no refetch storm.
 */
export const liveMarketQueryOptions = {
  refetchOnWindowFocus: true,
} as const;

/**
 * Shared query options for admin and list queries, which should not refetch
 * on window focus.
 */
export const staticQueryOptions = {
  refetchOnWindowFocus: false,
} as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  });
}
