'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { centsToUsd, formatCountdown, statusLabel } from '@/lib/format';
import { qk } from '@/lib/query-keys';

function statusTone(status: string): 'yes' | 'no' | 'warn' | 'neutral' {
  if (status === 'settled') return 'yes';
  if (status === 'cancelled') return 'no';
  if (status === 'pending') return 'warn';
  return 'neutral';
}

/**
 * `null` (never `0`) means "no history to compare against yet" — a market
 * younger than the backend's snapshot window, or the snapshot service
 * hasn't run long enough since a fresh deploy. Rendered as a plain dash,
 * not a fabricated "+0%", so it reads as "not enough data" rather than
 * "hasn't moved" — see `polaris-oracle`'s `GET /markets/:id/price` doc
 * comment for why that distinction is made server-side too.
 */
function ChgCell({ yesBpsChange }: { yesBpsChange: number | null | undefined }) {
  if (yesBpsChange === null || yesBpsChange === undefined) {
    return <span className="text-[var(--faint)]">—</span>;
  }
  const pct = Math.round(yesBpsChange / 100);
  const color = pct > 0 ? 'var(--yes)' : pct < 0 ? 'var(--no)' : 'var(--muted)';
  const sign = pct > 0 ? '+' : '';
  return <span style={{ color }}>{sign}{pct}%</span>;
}

/**
 * A dense, ticker-style row rather than the old card grid — one line per
 * market, right-aligned tabular odds instead of a full odds bar, so a
 * growing list of markets scans like a watchlist instead of a stack of
 * tiles. "Chg" is the YES odds' real move against `polaris-oracle`'s
 * recorded history (default a 1h lookback) — see `ChgCell`'s doc comment
 * for the null-vs-zero distinction.
 */
function MarketRow({ contractId }: { contractId: string }) {
  const { data: market } = useQuery({
    queryKey: qk.market.detail(contractId),
    queryFn: () => api.getMarket(contractId),
  });
  const { data: price } = useQuery({
    queryKey: qk.market.price(contractId),
    queryFn: () => api.getPrice(contractId),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });

  if (!market) return null;

  const yesPct = price ? Math.round(price.yesBps / 100) : undefined;
  const noPct = price ? Math.round(price.noBps / 100) : undefined;
  const isOpen = market.status === 'watching';

  return (
    <Link
      href={`/market/${contractId}`}
      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] sm:gap-x-5 sm:px-5"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: isOpen ? 'var(--brand-gradient)' : 'var(--faint)' }}
      >
        XL
      </span>

      <span className="min-w-0">
        <span className="block truncate font-semibold">XLM/USD</span>
        <span className="block truncate text-xs text-[var(--muted)]">
          ≥ {centsToUsd(market.strikePriceCents)}
        </span>
      </span>

      <span className="text-right font-mono text-sm tabular-nums">
        {yesPct !== undefined ? (
          <span style={{ color: 'var(--yes)' }}>{yesPct}%</span>
        ) : (
          <span className="text-[var(--faint)]">—</span>
        )}
        <span className="block text-[10px] uppercase tracking-wide text-[var(--faint)]">Yes</span>
      </span>

      <span className="text-right font-mono text-sm tabular-nums">
        {noPct !== undefined ? (
          <span style={{ color: 'var(--no)' }}>{noPct}%</span>
        ) : (
          <span className="text-[var(--faint)]">—</span>
        )}
        <span className="block text-[10px] uppercase tracking-wide text-[var(--faint)]">No</span>
      </span>

      <span className="text-right font-mono text-sm tabular-nums">
        <ChgCell yesBpsChange={price?.yesBpsChange} />
        <span className="block text-[10px] uppercase tracking-wide text-[var(--faint)]">Chg</span>
      </span>

      <span className="hidden text-right sm:block">
        <Badge tone={statusTone(market.status)}>{statusLabel(market.status)}</Badge>
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {isOpen ? formatCountdown(market.expiry) : 'closed'}
        </span>
      </span>
    </Link>
  );
}

/**
 * The full-list view — every market, every status. Not the primary landing
 * experience anymore (see `(app)/page.tsx`'s curated single-market view),
 * but nothing here was removed: this is the "browse everything" fallback
 * linked from there, now a watchlist-style list rather than a card grid.
 */
export default function AllMarketsPage() {
  const { data: markets, isLoading, error } = useQuery({
    queryKey: qk.markets.list(),
    queryFn: api.listMarkets,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Markets</h1>
        <p className="text-sm text-muted-foreground">
          Browse open markets and place your predictions.
        </p>
      </div>

      {markets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open markets yet.</p>
      ) : (
        <div
          role="table"
          aria-label="Open markets"
          className="divide-y rounded-lg border"
        >
          <div
            role="row"
            className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <span role="columnheader" className="flex-1">
              Market
            </span>
            <span role="columnheader" className="w-16 shrink-0 text-right">
              Yes
            </span>
            <span role="columnheader" className="w-16 shrink-0 text-right">
              No
            </span>
            <span role="columnheader" className="w-16 shrink-0 text-right">
              Chg
            </span>
            <span role="columnheader" className="w-20 shrink-0 text-right">
              Status
            </span>
          </div>
          {markets.map((market) => {
            const yesPercent = Math.round(market.yesPrice * 100);
            const noPercent = 100 - yesPercent;
            const closesIn = timeUntil(market.closesAt);
            const accessibleName = `${market.symbol} at or above ${formatCurrency(
              market.threshold,
            )} — Yes ${yesPercent}%, closes in ${closesIn}`;

            return (
              <div
                key={market.id}
                role="row"
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50"
              >
                <div role="cell" className="flex min-w-0 flex-1 items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                  >
                    XL
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/markets/${market.id}`}
                      aria-label={accessibleName}
                      className="block truncate font-medium hover:underline"
                    >
                      {market.symbol} ≥ {formatCurrency(market.threshold)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Closes in {closesIn} · {market._count.positions} positions
                    </p>
                  </div>
                </div>
                <span
                  role="cell"
                  className="w-16 shrink-0 text-right text-sm"
                >
                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                    {formatPercent(yesPercent)}
                  </span>
                </span>
                <span
                  role="cell"
                  className="w-16 shrink-0 text-right text-sm"
                >
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">
                    {formatPercent(noPercent)}
                  </span>
                </span>
                <span
                  role="cell"
                  className="w-16 shrink-0 text-right text-sm text-muted-foreground"
                >
                  —
                </span>
                <span
                  role="cell"
                  className="w-20 shrink-0 text-right text-sm text-muted-foreground"
                >
                  {closesIn}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
