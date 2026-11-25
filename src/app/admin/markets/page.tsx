'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Market } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

type FilterKey = 'attention' | 'open' | 'closed' | 'all';

const TERMINAL_STATUSES = new Set(['settled', 'closed', 'resolved', 'cancelled']);

function needsAttention(market: Market): boolean {
  return market.status === 'pending' || Boolean(market.lastError);
}

function isOpen(market: Market): boolean {
  return !TERMINAL_STATUSES.has(market.status);
}

const FILTERS: { key: FilterKey; label: string; match: (market: Market) => boolean }[] = [
  { key: 'attention', label: 'Needs attention', match: needsAttention },
  { key: 'open', label: 'Open', match: isOpen },
  { key: 'closed', label: 'Closed', match: (market) => !isOpen(market) },
  { key: 'all', label: 'All', match: () => true },
];

export default function AdminMarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('attention');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listMarkets()
      .then((data) => {
        if (!cancelled) setMarkets(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load markets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = { attention: 0, open: 0, closed: 0, all: markets.length };
    for (const market of markets) {
      if (needsAttention(market)) result.attention += 1;
      if (isOpen(market)) result.open += 1;
      else result.closed += 1;
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
