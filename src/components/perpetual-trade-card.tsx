'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageFromApiError } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/freighter-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { stroopsToXlm, xlmToStroops, shortAddress } from '@/lib/format';
import { redeemableValue } from '@/lib/portfolio';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';

/** Same floor as `TradeCard` — see its doc comment. */
const SLIPPAGE_TOLERANCE_BPS = 200;

/**
 * `polaris-perpetual`'s trading widget — deliberately a separate component
 * from `TradeCard`, not a `kind`-parameterized variant of it. The two
 * contracts share buy's mechanics exactly (same reused math, see
 * `polaris-contracts/README.md`'s "The perpetual contract"), but the
 * *trading model* is genuinely different, not just a display nicety:
 * a classic market is "bet, then wait for one resolution event" (hence
 * `TradeCard`'s `ResultReveal`/`rolloverFromMarketId`/"next round" concepts
 * — none of which exist here, since a perpetual never resolves to a
 * winner) versus this contract's "hold a continuously-tradeable position
 * until `terminate()`" — which is why this only ever offers Buy + a
 * post-`terminate` Redeem, not a win/lose framing. Forking here isn't the
 * anti-pattern `TradeCard`'s own doc comment warns about (that was two
 * *pages* duplicating the *same* betting flow) — this is one flow used by
 * one page family, for a materially different contract.
 */
export function PerpetualTradeCard({
  perpetualId,
  className,
  bodyClassName,
}: {
  perpetualId: string;
  className?: string;
  bodyClassName?: string;
}) {
  const { wallet, connecting, error: walletError, connectWallet } = useWallet();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: perpetual, isLoading } = useQuery({
    queryKey: ['perpetual', perpetualId],
    queryFn: () => api.getPerpetual(perpetualId),
  });
  const { data: state } = useQuery({
    queryKey: ['perpetualState', perpetualId],
    queryFn: () => api.getPerpetualState(perpetualId),
    // No settle-style resolution event to poll toward — only worth
    // refreshing while a `terminate` might land, same cadence as price/fee
    // below, and only while still open.
    refetchInterval: perpetual?.status === 'watching' ? 15_000 : false,
  });
  const { data: fee } = useQuery({
    queryKey: ['perpetualFee', perpetualId],
    queryFn: () => api.getPerpetualFee(perpetualId),
    enabled: perpetual?.status === 'watching',
    refetchInterval: 15_000,
  });
  const { data: position } = useQuery({
    queryKey: ['perpetualPosition', perpetualId, wallet?.address],
    queryFn: () => api.getPerpetualPosition(perpetualId, wallet!.address),
    enabled: !!wallet,
  });

  // Computed once here and reused by both the preview and `handleTrade` so
  // the displayed "minimum if price moves" is exactly the `min_shares_out`
  // actually submitted.
  const preview = useMemo(() => {
    if (!state || !fee) return null;
    try {
      const stroops = xlmToStroops(amount);
      if (stroops <= 0n) return null;
      const estimate = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      return {
        payout: stroopsToXlm((stroops + estimate).toString()),
        minSharesOut: stroopsToXlm(minSharesOut.toString()),
      };
    } catch {
      return null;
    }
  }, [amount, side, state, fee]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardBody className={bodyClassName}>
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        </CardBody>
      </Card>
    );
  }
  if (!perpetual) {
    return (
      <Card className={className}>
        <CardBody className={bodyClassName}>
          <p className="text-sm text-[var(--muted)]">Perpetual unavailable.</p>
        </CardBody>
      </Card>
    );
  }

  const isOpen = perpetual.status === 'watching';

  async function handleTrade() {
    if (!state || !fee) return;
    setTxError(null);
    setTxResult(null);

    let activeWallet = wallet;
    if (!activeWallet) {
      activeWallet = await connectWallet();
      if (!activeWallet) return;
    }

    setBusy(true);
    try {
      const stroops = xlmToStroops(amount);
      const estimate = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      const { txHash } = await callAsWallet(
        activeWallet,
        perpetualId,
        'buy',
        { prediction: side, collateral_amount: stroops.toString(), min_shares_out: minSharesOut.toString() },
        'perpetual',
      );
      setTxResult(txHash);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['perpetualPosition', perpetualId, activeWallet.address] }),
        queryClient.invalidateQueries({ queryKey: ['perpetualPrice', perpetualId] }),
      ]);
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
      const { txHash } = await callAsWallet(wallet, perpetualId, 'redeem', {}, 'perpetual');
      setTxResult(txHash);
      await queryClient.invalidateQueries({ queryKey: ['perpetualPosition', perpetualId, wallet.address] });
    } catch (err) {
      setTxError(messageFromApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const pos = position ? { yes: BigInt(position.yes), no: BigInt(position.no) } : null;
  // `Terminated`'s payout is the exact same 0.5-collateral-per-complementary-pair
  // formula as a classic market's `Cancelled` — same reused math (see
  // `polaris-contracts/README.md`'s "The perpetual contract") — so
  // `redeemableValue` (which only knows the classic-market status union)
  // is called with `'Cancelled'` here as the equivalent case, not a new
  // parallel implementation of the same formula.
  const canRedeem = pos && !isOpen && redeemableValue('Cancelled', pos) > 0n;

  return (
    <Card className={className}>
      <CardBody className={bodyClassName}>
        {!isOpen ? (
          <div className="space-y-3">
            {pos && (pos.yes > 0n || pos.no > 0n) ? (
              <p className="text-sm text-[var(--muted)]">
                This market has been terminated. Every position pays 0.5 XLM per share, regardless of side.
              </p>
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

            <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-sm">
              {preview ? (
                <>
                  You get <span className="font-semibold">{preview.payout} XLM</span> of {side.toUpperCase()}{' '}
                  <span className="text-[var(--faint)]">(you stake {amount || '0'} XLM)</span>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Minimum if price moves: {preview.minSharesOut} XLM ({SLIPPAGE_TOLERANCE_BPS / 100}% tolerance)
                  </p>
                </>
              ) : (
                <span className="text-[var(--muted)]">Enter an amount to see your payout.</span>
              )}
            </div>

            {txError && <p className="text-sm text-[var(--no)]">{txError}</p>}
            {txResult && (
              <p className="text-sm text-[var(--yes)]">
                Trade submitted: <span className="font-mono">{shortAddress(txResult)}</span>
              </p>
            )}
            {walletError && <p className="text-sm text-[var(--no)]">{walletError}</p>}

            <Button className="w-full" onClick={handleTrade} disabled={busy || connecting || !preview}>
              {busy ? 'Submitting…' : connecting ? 'Connecting…' : wallet ? `Buy ${side.toUpperCase()}` : 'Connect wallet'}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
