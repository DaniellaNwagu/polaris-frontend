'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Market } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { centsToUsd, shortAddress } from '@/lib/format';
import { qk } from '@/lib/query-keys';

export default function AdminMarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('attention');

  const { data: markets } = useQuery({ queryKey: qk.markets.list(), queryFn: api.listMarkets });

  async function act(action: 'settle' | 'cancel', contractId: string) {
    setBusyId(contractId);
    setError(null);
    try {
      if (action === 'settle') await api.triggerSettle(adminKey, contractId);
      else await api.triggerCancel(adminKey, contractId);
      await queryClient.invalidateQueries({ queryKey: qk.markets.list() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
    return result;
  }, [markets]);

  const visibleMarkets = useMemo(() => {
    const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];
    return markets.filter(active.match);
  }, [markets, filter]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-[var(--ink-soft)]">Review and act on oracle markets.</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter markets">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={filter === entry.key}
            onClick={() => setFilter(entry.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              filter === entry.key
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--surface-2)]',
            )}
          >
            {entry.label}
            <span className="text-xs opacity-70">{counts[entry.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">Loading markets…</p>
      ) : error ? (
        <p className="text-sm text-[var(--no)]">{error}</p>
      ) : visibleMarkets.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">No markets match this filter.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMarkets.map((market) => (
            <li key={market.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold">{market.question}</h2>
                <Badge tone={market.lastError ? 'no' : market.status === 'pending' ? 'warn' : 'neutral'}>
                  {market.status}
                </Badge>
              </div>
              {market.lastError ? (
                <p className="mt-2 text-xs text-[var(--no)]">{market.lastError}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
