'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageFromApiError } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/freighter-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResultReveal } from '@/components/result-reveal';
import { stroopsToXlm, xlmToStroops, shortAddress, isPollableStatus, RESOLUTION_POLL_MS } from '@/lib/format';
import { redeemableValue, type MarketStatus } from '@/lib/portfolio';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';
import { useNextRound } from '@/lib/use-next-round';

/** 2% — how much worse a fill is allowed to be than the quote at click-time before the trade reverts instead of silently eating the difference. */
const SLIPPAGE_TOLERANCE_BPS = 200;

/**
 * The buy/redeem card — the one piece of trade UI in this app, used by both
 * the market detail page and the curated homepage's featured market.
 * Deliberately NOT forked between them: this file used to be inlined only
 * in `market/[id]/page.tsx`, and this session already caught one real bug
 * (`lib/portfolio.ts`'s stale Cancelled-payout mirror) that was exactly
 * this failure mode — a second copy of logic nobody remembers to keep in
 * sync with the first. Fully self-contained: fetches its own market/price/
 * state/fee/position data by `marketId`, so it's a true drop-in regardless
 * of what else a given page already fetched (React Query dedupes identical
 * query keys automatically, so this costs nothing extra when a page — like
 * the detail page — already has its own `useQuery(['market', id])`, etc.).
 */
export function TradeCard({
  marketId,
  className,
  bodyClassName,
  rolloverFromMarketId,
}: {
  marketId: string;
  /** Passed through to the outer `Card` — lets a caller (e.g. the detail page's mobile bottom-sheet) override the default card chrome without forking this component. */
  className?: string;
  bodyClassName?: string;
  /**
   * Set when this market was reached via a resolved predecessor's "Next
   * round is live" link (see `ResultReveal`/`useNextRound`). If the wallet
   * holds a redeemable win there, the amount field prefills with it and
   * `handleTrade` redeems the old position before buying into this one —
   * two sequential calls to the *existing* `redeem`/`buy` sponsored-call
   * paths, not a new contract entrypoint or a new backend endpoint. If the
   * redeem succeeds but the buy then fails (slippage, pool depth, this
   * market already closed), the user simply holds the redeemed collateral
   * in their own wallet — not a fund-safety issue, the same recoverable
   * failure shape `txError` already surfaces for any other failed buy.
   */
  rolloverFromMarketId?: string;
}) {
  const { wallet, connecting, error: walletError, connectWallet } = useWallet();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: market } = useQuery({
    queryKey: ['market', marketId],
    queryFn: () => api.getMarket(marketId),
    // Keeps polling while a resolution could still land, so a bettor sitting
    // on this card sees it happen instead of only on next page load — see
    // result-reveal.tsx for the moment this feeds.
    refetchInterval: (query) => (isPollableStatus(query.state.data?.status) ? RESOLUTION_POLL_MS : false),
  });
  const { data: state } = useQuery({
    queryKey: ['state', marketId],
    queryFn: () => api.getMarketState(marketId),
    refetchInterval: isPollableStatus(market?.status) ? RESOLUTION_POLL_MS : false,
  });
  const { data: fee } = useQuery({
    queryKey: ['fee', marketId],
    queryFn: () => api.getFee(marketId),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });
  const { data: position } = useQuery({
    queryKey: ['position', marketId, wallet?.address],
    queryFn: () => api.getPosition(marketId, wallet!.address),
    enabled: !!wallet,
  });
  const nextRound = useNextRound(market);

  const { data: rolloverState } = useQuery({
    queryKey: ['state', rolloverFromMarketId],
    queryFn: () => api.getMarketState(rolloverFromMarketId!),
    enabled: !!rolloverFromMarketId,
  });
  const { data: rolloverPosition } = useQuery({
    queryKey: ['position', rolloverFromMarketId, wallet?.address],
    queryFn: () => api.getPosition(rolloverFromMarketId!, wallet!.address),
    enabled: !!rolloverFromMarketId && !!wallet,
  });
  const rolloverStatus = (rolloverState?.status ?? null) as MarketStatus | null;
  const rolloverAmount =
    rolloverStatus && rolloverStatus !== 'Open' && rolloverPosition
      ? redeemableValue(rolloverStatus, { yes: BigInt(rolloverPosition.yes), no: BigInt(rolloverPosition.no) })
      : 0n;

  // Prefill the amount field with the rollover payout exactly once — not on
  // every render, so it doesn't fight the user overwriting it afterward.
  const prefilledRollover = useRef(false);
  useEffect(() => {
    if (rolloverAmount > 0n && !prefilledRollover.current) {
      prefilledRollover.current = true;
      setAmount(stroopsToXlm(rolloverAmount));
    }
  }, [rolloverAmount]);

  // Single source of truth for the quote: the payout shown, the minimum
  // shown, and the `min_shares_out` submitted by `handleTrade` all derive
  // from this one computation, so the preview can never drift from what's
  // actually sent on-chain.
  const preview = useMemo(() => {
    if (!state || !fee) return null;
    try {
      const stroops = xlmToStroops(amount);
      if (stroops <= 0n) return null;
      const bonus = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      const estimate = stroops + bonus;
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      return {
        payout: stroopsToXlm(estimate.toString()),
        minSharesOut,
        minReceived: stroopsToXlm(minSharesOut.toString()),
      };
    } catch {
      return null;
    }
  }, [amount, side, state, fee]);

  if (!market) {
    return (
      <Card className={className}>
        <CardBody className={bodyClassName}>
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        </CardBody>
      </Card>
    );
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!state || !fee) return;
    setTxError(null);
    setTxResult(null);

    // No wallet yet — the Freighter connect prompt only fires now, at the
    // moment of commit, so a visitor can pick a side, an amount, and see the
    // payout before ever touching a wallet. `connectWallet` returns the
    // fresh wallet directly rather than relying on `wallet` from context,
    // which won't reflect the new value until the next render.
    let activeWallet = wallet;
    if (!activeWallet) {
      activeWallet = await connectWallet();
      if (!activeWallet) return; // failed/cancelled — `walletError` from context already explains why
    }

    setBusy(true);
    try {
      if (rolloverFromMarketId && rolloverAmount > 0n) {
        await callAsWallet(activeWallet, rolloverFromMarketId, 'redeem', {});
        await queryClient.invalidateQueries({ queryKey: ['position', rolloverFromMarketId, activeWallet.address] });
      }

      const stroops = xlmToStroops(amount);
      const estimate = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      const { txHash } = await callAsWallet(activeWallet, marketId, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: minSharesOut.toString(),
      });
      setTxResult(txHash);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['position', marketId, activeWallet.address] }),
        queryClient.invalidateQueries({ queryKey: ['price', marketId] }),
      ]);
    } catch (err) {
      setTxError(messageFromApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardBody className={bodyClassName}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Trade</h2>
          {wallet ? (
            <span className="text-xs text-[var(--muted)]">{shortAddress(wallet.address)}</span>
          ) : (
            <Button variant="secondary" onClick={() => connectWallet()} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </Button>
          )}
        </div>

        {walletError && <p className="mt-2 text-sm text-red-500">{walletError}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant={side === 'Yes' ? 'primary' : 'secondary'} onClick={() => setSide('Yes')}>
            Yes
          </Button>
          <Button variant={side === 'No' ? 'primary' : 'secondary'} onClick={() => setSide('No')}>
            No
          </Button>
        </div>

        <div className="mt-4">
          <label className="text-sm text-[var(--muted)]" htmlFor="trade-amount">
            Amount (XLM)
          </label>
          <Input
            id="trade-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1"
          />
        </div>

        {preview && (
          <div className="mt-4">
            <p className="text-sm">
              Estimated payout: <span className="font-semibold">{preview.payout} XLM</span>
            </p>
            <p className="text-xs text-[var(--muted)]">
              Minimum if price moves: {preview.minReceived} XLM ({SLIPPAGE_TOLERANCE_BPS / 100}% tolerance)
            </p>
          </div>
        )}

        <Button className="mt-4 w-full" onClick={handleTrade} disabled={busy || !isOpen}>
          {busy ? 'Submitting…' : isOpen ? `Buy ${side}` : 'Market closed'}
        </Button>

        {txError && <p className="mt-2 text-sm text-red-500">{txError}</p>}
        {txResult && <p className="mt-2 text-sm text-[var(--muted)]">Submitted: {txResult}</p>}

        {position && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Your position — Yes: {stroopsToXlm(position.yes)} · No: {stroopsToXlm(position.no)}
          </p>
        )}

        <ResultReveal market={market} position={position} nextRound={nextRound} />
      </CardBody>
    </Card>
  );
}
