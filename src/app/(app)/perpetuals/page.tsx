import Link from 'next/link';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/format';
import { PerpetualCard } from './perpetual-card';
import { PerpetualsList } from './perpetuals-list';

export const revalidate = 30;

/**
 * `polaris-perpetual`'s own list page — a separate route from `/markets`,
 * not a merged feed with a type badge (see `polaris-oracle/README.md`'s
 * "Perpetual markets" for why: the two contracts have different enough
 * shapes that a shared schema/list would need a pile of fields meaningless
 * for one kind or the other).
 *
 * Server component: the list is fetched on the server (short `revalidate`)
 * so the initial HTML contains the rows, then React Query is hydrated on the
 * client so polling continues after hydration.
 */
export default async function AllPerpetualsPage() {
  const queryClient = new QueryClient();

  let error: Error | null = null;
  try {
    await queryClient.prefetchQuery({
      queryKey: ['perpetuals'],
      queryFn: api.listPerpetuals,
    });
  } catch (e) {
    error = e as Error;
  }

  const perpetuals = queryClient.getQueryData<Awaited<ReturnType<typeof api.listPerpetuals>>>([
    'perpetuals',
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Perpetuals</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Continuous XLM/USD markets — no expiry, trade any time.
      </p>

      {error && <p className="text-sm text-[var(--no)]">Couldn&rsquo;t reach the backend: {error.message}</p>}
      {perpetuals && perpetuals.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No perpetuals yet — an admin can create one.</p>
      )}

      <HydrationBoundary state={dehydrate(queryClient)}>
        <PerpetualsList />
      </HydrationBoundary>
    </div>
  );
}
