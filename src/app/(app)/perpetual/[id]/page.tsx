'use client';

import { use, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OddsBar } from '@/components/odds-bar';
import { PerpetualTradeCard } from '@/components/perpetual-trade-card';
import { stroopsToXlm, statusLabel, centsToUsd } from '@/lib/format';
import { qk } from '@/lib/query-keys';

export default function PerpetualDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data: perpetual } = useQuery({
    queryKey: qk.perpetual.detail(id),
    queryFn: () => api.getPerpetual(id),
    refetchOnWindowFocus: true,
  });
  const { data: price } = useQuery({
    queryKey: qk.perpetual.price(id),
    queryFn: () => api.getPerpetualPrice(id),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    enabled: perpetual?.status === 'watching',
  });
  const { data: state } = useQuery({
    queryKey: qk.perpetual.state(id),
    queryFn: () => api.getPerpetualState(id),
    refetchInterval: perpetual?.status === 'watching' ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  const { data: fee } = useQuery({
    queryKey: qk.perpetual.fee(id),
    queryFn: () => api.getPerpetualFee(id),
    enabled: perpetual?.status === 'watching',
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Measure the fixed bottom trade sheet so page padding tracks its real height
  // instead of a hardcoded pb-56 (which hides content when the sheet grows).
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--trade-sheet-height', `${el.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--trade-sheet-height');
    };
  }, []);

  if (!perpetual) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }
  if (!perpetual) {
    return <p className="text-sm text-[var(--muted)]">Perpetual unavailable.</p>;
  }

  const isOpen = perpetual.status === 'watching';
  const hasCheckpoint = !!state && state.lastPriceAt !== '0';

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:pb-0"
      style={{ paddingBottom: 'calc(var(--trade-sheet-height, 14rem) + 1rem)' }}
    >
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">XLM/USD</span>
          <Badge tone={isOpen ? 'accent' : 'neutral'}>{statusLabel(perpetual.status)}</Badge>
        </div>
        <h1 className="mb-3 text-2xl font-bold">XLM/USD perpetual</h1>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Continuous market — no expiry, no fixed settlement. Trade any time; an admin can wind it down with{' '}
          <span className="font-mono text-xs">terminate()</span>, after which every position pays 0.5 XLM per
          share.
        </p>

        {price && (
          <Card className="mb-4">
            <CardBody>
              <OddsBar yesBps={price.yesBps} noBps={price.noBps} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-[var(--faint)]">Status</div>
              <div className="font-semibold">{statusLabel(perpetual.status)}</div>
            </div>
            {state && (
              <>
                <div>
                  <div className="text-[var(--faint)]">Pool (YES/NO)</div>
                  <div className="font-semibold">
                    {stroopsToXlm(state.poolYes)} / {stroopsToXlm(state.poolNo)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">Fee now</div>
                  <div className="font-semibold">{fee ? `${(fee.feeBps / 100).toFixed(2)}%` : '…'}</div>
                  <div className="text-xs text-[var(--faint)]">
                    {(state.baseFeeBps / 100).toFixed(2)}% → {(state.minFeeBps / 100).toFixed(2)}% as volume
                    grows
                  </div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">Last observed price</div>
                  <div className="font-semibold">
                    {hasCheckpoint ? centsToUsd(state.lastPriceCents) : '—'}
                  </div>
                  <div className="text-xs text-[var(--faint)]">
                    {hasCheckpoint
                      ? 'informational only — no effect on trading'
                      : 'no checkpoint recorded yet'}
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)] px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PerpetualTradeCard
          perpetualId={id}
          className="max-h-[70vh] overflow-y-auto rounded-none border-0 bg-transparent shadow-none lg:max-h-none lg:overflow-visible lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--surface)] lg:shadow-sm"
          bodyClassName="p-0 lg:p-5"
        />
      </div>
    </div>
  );
}
