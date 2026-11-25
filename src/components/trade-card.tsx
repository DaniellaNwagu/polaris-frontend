'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageFromApiError } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet, UserCancelledError } from '@/lib/freighter-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResultReveal } from '@/components/result-reveal';
import { stroopsToXlm, xlmToStroops, shortAddress, isPollableStatus, RESOLUTION_POLL_MS } from '@/lib/format';
import { redeemableValue, type MarketStatus } from '@/lib/portfolio';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';
import { useNextRound } from '@/lib/use-next-round';
import { invalidateAfterTrade, qk } from '@/lib/query-keys';

/** 2% — how much worse a fill is allowed to be than the quote at click-time before the trade reverts instead of silently eating the difference. */
const SLIPPAGE_TOLERANCE_BPS = 200;

/**
 * Emit a lifecycle event to the host page when this widget is embedded in an
 * iframe. Payloads are intentionally minimal — no wallet address, balance, or
 * position size — so a host site can measure conversions and react to
 * resolution without learning anything about the user. See the embed guide
 * for the documented schema.
 */
function emitEmbedEvent(type: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ type, ...detail }, '*');
}

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
   * failure shape `txError` already surfaces for any other failed buy. The
   * error message explicitly states the redeemed amount so the user doesn't
   * think nothing happened and try to redeem again.
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
  const [txCancelled, setTxCancelled] = useState(false);

  // Measures the card's rendered height and publishes it as a CSS variable
  // (`--trade-card-height`) on the document root. The detail pages use it to
  // pad their scroll container so the fixed mobile bottom sheet never covers
  // the last of the market details — a fixed `pb-56` breaks as soon as the
  // card grows (error, rollover note, result reveal, email form).
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? el.offsetHeight;
      root.style.setProperty('--trade-card-height', `${Math.ceil(height)}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--trade-card-height');
    };
  }, []);

  const { data: market } = useQuery({
    queryKey: qk.market.detail(marketId),
    queryFn: () => api.getMarket(marketId),
    // Keeps polling while a resolution could still land, so a bettor sitting
    // on this card sees it happen instead of only on next page load — see
    // result-reveal.tsx for the moment this feeds.
    refetchInterval: (query) => (isPollableStatus(query.state.data?.status) ? RESOLUTION_POLL_MS : false),
  });
  const { data: state } = useQuery({
    queryKey: qk.market.state(marketId),
    queryFn: () => api.getMarketState(marketId),
    refetchInterval: isPollableStatus(market?.status) ? RESOLUTION_POLL_MS : false,
  });
  const { data: fee } = useQuery({
    queryKey: qk.market.fee(marketId),
    queryFn: () => api.getFee(marketId),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });
  const { data: position } = useQuery({
    queryKey: qk.market.position(marketId, wallet?.address),
    queryFn: () => api.getPosition(marketId, wallet!.address),
    enabled: !!wallet,
  });
  // Shared with auth-controls.tsx — same key, so React Query dedupes and this
  // costs nothing extra when the header already fetched it. Used to preflight
  // the buy amount so an over-balance trade never opens a signing prompt.
  const { data: walletBalance } = useQuery({
    queryKey: ['walletBalance', wallet?.address],
    queryFn: () => api.getBalance(wallet!.address),
    enabled: !!wallet,
  });
  const nextRound = useNextRound(market);

  const { data: rolloverState } = useQuery({
    queryKey: qk.market.state(rolloverFromMarketId),
    queryFn: () => api.getMarketState(rolloverFromMarketId!),
    enabled: !!rolloverFromMarketId,
    retry: false,
  });
  const rolloverValid =
    !!rolloverMarket &&
    !!market &&
    rolloverMarket.id !== market.id &&
    rolloverMarket.feedId === market.feedId &&
    rolloverMarket.status !== 'watching' &&
    rolloverMarket.createdAt < market.createdAt;
  const validatedRolloverId = rolloverValid ? rolloverFromMarketId : undefined;

  const { data: rolloverState } = useQuery({
    queryKey: ['state', validatedRolloverId],
    queryFn: () => api.getMarketState(validatedRolloverId!),
    enabled: !!validatedRolloverId,
  });
  const { data: rolloverPosition } = useQuery({
    queryKey: qk.market.position(rolloverFromMarketId, wallet?.address),
    queryFn: () => api.getPosition(rolloverFromMarketId!, wallet!.address),
    enabled: !!rolloverFromMarketId && !!wallet,
  });
  const rolloverStatus = (rolloverState?.status ?? null) as MarketStatus | null;
  const rolloverAmount =
    validatedRolloverId && rolloverStatus && rolloverStatus !== 'Open' && rolloverPosition
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

  // Embed lifecycle: tell the host page the widget is ready once it mounts.
  useEffect(() => {
    emitEmbedEvent('polaris:ready');
  }, []);

  // Embed lifecycle: tell the host page a wallet connected. Fires on the
  // transition into a connected wallet (including the connect-on-commit path
  // in `handleTrade`), not on every render.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (wallet && !wasConnected.current) {
      wasConnected.current = true;
      emitEmbedEvent('polaris:connected');
    } else if (!wallet) {
      wasConnected.current = false;
    }
  }, [wallet]);

  // Embed lifecycle: tell the host page when the embedded market resolves.
  const lastStatus = useRef<MarketStatus | null>(null);
  useEffect(() => {
    const status = (market?.status ?? null) as MarketStatus | null;
    if (status && status !== 'Open' && status !== 'watching' && lastStatus.current !== status) {
      emitEmbedEvent('polaris:resolved', { status });
    }
    lastStatus.current = status;
  }, [market?.status]);

  const payoutPreview = useMemo(() => {
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

  // Client-side preflight: if the entered amount exceeds the wallet balance
  // (minus a small reserve for Freighter's own network fee), disable Buy and
  // show the available balance instead of letting the user sign a tx that
  // will only fail at the contract/RPC layer.
  const balanceStroops = walletBalance != null ? BigInt(walletBalance) : null;
  const amountStroops = useMemo(() => {
    try {
      return xlmToStroops(amount);
    } catch {
      return 0n;
    }
  }, [amount]);
  const insufficientBalance =
    balanceStroops != null && amountStroops > 0n && amountStroops > balanceStroops;

  if (!market) {
    return (
      <Card ref={cardRef} className={className}>
        <CardBody className={bodyClassName}>
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        </CardBody>
      </Card>
    );
  }
  if (!market) {
    return (
      <Card className={className}>
        <CardBody className={bodyClassName}>
          <p className="text-sm text-[var(--muted)]">Market unavailable.</p>
        </CardBody>
      </Card>
    );
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!state || !fee) return;
    // Never open a signing prompt for an amount the wallet can't cover.
    if (insufficientBalance) return;
    setTxError(null);
    setTxResult(null);
    setTxCancelled(false);

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
        await invalidateAfterTrade(queryClient, { kind: 'market', id: rolloverFromMarketId, address: activeWallet.address });
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
      await invalidateAfterTrade(queryClient, { kind: 'market', id: marketId, address: activeWallet.address });
    } catch (err) {
      setTxError(messageFromApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeem() {
    if (!wallet) return;
    setBusy(true);
    setTxError(null);
    setTxResult(null);
    try {
      const { txHash } = await callAsWallet(wallet, marketId, 'redeem', {});
      setTxResult(txHash);
      await invalidateAfterTrade(queryClient, { kind: 'market', id: marketId, address: wallet.address });
    } catch (err) {
      setTxError(messageFromApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const pos = position ? { yes: BigInt(position.yes), no: BigInt(position.no) } : null;
  const onChainStatus = (state?.status ?? null) as MarketStatus | null;
  const canRedeem = pos && onChainStatus && onChainStatus !== 'Open' && redeemableValue(onChainStatus, pos) > 0n;

  return (
    <Card className={className}>
      <CardBody className={bodyClassName}>
        {!isOpen ? (
          <div className="space-y-3">
            {pos && (pos.yes > 0n || pos.no > 0n) && onChainStatus && onChainStatus !== 'Open' ? (
              <ResultReveal
                status={onChainStatus}
                position={pos}
                nextRoundHref={nextRound ? `/market/${nextRound.contractId}?rolloverFrom=${marketId}` : undefined}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">Trading is closed.</p>
            )}
            {canRedeem && (
              <Button className="w-full" onClick={handleRedeem} disabled={busy}>
                {busy ? 'Redeeming…' : 'Redeem'}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={side === 'Yes' ? 'yes' : 'outline'} onClick={() => setSide('Yes')}>
                YES
              </Button>
              <Button variant={side === 'No' ? 'no' : 'outline'} onClick={() => setSide('No')}>
                NO
              </Button>
            </div>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Amount (XLM)
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </label>
            {rolloverAmount > 0n && (
              <p className="text-[11px] text-[var(--faint)]">
                Funded by your {stroopsToXlm(rolloverAmount)} XLM winnings from last round
              </p>
            )}

/* … truncated 3800 chars — edit only what you need near the top … */
