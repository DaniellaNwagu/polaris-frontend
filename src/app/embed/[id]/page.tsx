'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageFromApiError } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/freighter-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OddsBar } from '@/components/odds-bar';
import { AuthControls } from '@/components/auth-controls';
import { ResultReveal } from '@/components/result-reveal';
import {
  centsToUsd,
  statusLabel,
  stroopsToXlm,
  xlmToStroops,
  shortAddress,
  isPollableStatus,
  RESOLUTION_POLL_MS,
} from '@/lib/format';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';
import type { MarketStatus } from '@/lib/portfolio';
import { useNextRound } from '@/lib/use-next-round';
import { LogoMark } from '@/components/logo-mark';
import { invalidateAfterTrade, qk } from '@/lib/query-keys';

const SLIPPAGE_TOLERANCE_BPS = 200; // 2%

/**
 * Post a lifecycle event to the host page embedding this widget. Payloads
 * intentionally carry no wallet address, balance, or position size — only
 * the event name and, for trades, the side and tx hash. See the embed guide
 * for the documented schema.
 */
function postToHost(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ type, ...payload }, '*');
}

/**
 * The embeddable version of the market detail page — meant to run inside a
 * third-party site's `<iframe>`, not as a standalone destination. Freighter
 * connects the same way here as anywhere else (it's a browser extension
 * talking to whichever page is focused, not tied to this app's origin the
 * way the old WebAuthn-based passkey flow was) — see this repo's README for
 * why the widget couldn't live on `polaris-oracle` instead.
 */
export default function EmbedMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { wallet, connecting, error: walletError, freighterAvailable, connectWallet } = useWallet();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  // Manual escape hatch to the email flow — shown after a live Freighter
  // attempt fails (walletError set with no wallet yet), or forced on
  // whenever this browser/webview has no Freighter extension at all.
  const [preferEmail, setPreferEmail] = useState(false);
  const showEmailFallback = !wallet && (preferEmail || freighterAvailable === false);
  // Set when the email flow "succeeds" but the session cookie can't be used
  // from inside this iframe (third-party cookies blocked/partitioned). We
  // must not show a signed-in state that can't trade — instead point the
  // user at the main app in a new tab.
  const [emailSessionBlocked, setEmailSessionBlocked] = useState(false);
  const openInPolarisHref =
    typeof window !== 'undefined' ? `${window.location.origin}/market/${id}` : '#';

  // Report the widget's content height to the host page so it can size the
  // iframe to fit — otherwise taller states (email fallback, ResultReveal,
  // multi-line errors) clip or scroll and shorter ones leave dead space.
  // Payload is intentionally just { type, height } — no wallet/position data.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined' || window.parent === window) return;
    const post = () => {
      window.parent.postMessage({ type: 'polaris:resize', height: el.scrollHeight }, '*');
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data: market } = useQuery({
    queryKey: qk.market.detail(id),
    queryFn: () => api.getMarket(id),
    refetchInterval: (query) => (isPollableStatus(query.state.data?.status) ? RESOLUTION_POLL_MS : false),
  });
  const { data: price } = useQuery({
    queryKey: qk.market.price(id),
    queryFn: () => api.getPrice(id),
    refetchInterval: 15_000,
    enabled: market?.status === 'watching',
  });
  const { data: state } = useQuery({
    queryKey: qk.market.state(id),
    queryFn: () => api.getMarketState(id),
    // Was gated to only fetch while 'watching' — but the result moment
    // needs the resolved state (final price, pool balances) right after
    // expiry too, not just while trading is still open.
    refetchInterval: isPollableStatus(market?.status) ? RESOLUTION_POLL_MS : false,
  });
  const { data: fee } = useQuery({
    queryKey: qk.market.fee(id),
    queryFn: () => api.getFee(id),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });
  const { data: position } = useQuery({
    queryKey: qk.market.position(id, wallet?.address),
    queryFn: () => api.getPosition(id, wallet!.address),
    enabled: !!wallet,
  });
  const nextRound = useNextRound(market);

  // polaris:ready — fired once the widget has mounted and initialized.
  useEffect(() => {
    postToHost('polaris:ready');
  }, []);

  // polaris:connected — fired once a wallet connects in the embed. Guarded
  // so it only fires on the transition into a connected state.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (wallet && !wasConnected.current) {
      wasConnected.current = true;
      postToHost('polaris:connected');
    } else if (!wallet) {
      wasConnected.current = false;
    }
  }, [wallet]);

  // polaris:resolved — fired once the embedded market resolves.
  const wasResolved = useRef(false);
  useEffect(() => {
    if (market && market.status === 'resolved' && !wasResolved.current) {
      wasResolved.current = true;
      postToHost('polaris:resolved');
    }
  }, [market]);

  const payoutPreview = useMemo(() => {
    if (!state || !fee) return null;
    try {
      const stroops = xlmToStroops(amount);
      if (stroops <= 0n) return null;
      const bonus = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      return stroopsToXlm((stroops + bonus).toString());
    } catch {
      return null;
    }
  }, [amount, side, state, fee]);

  if (!market) {
    return <div className="p-4 text-sm text-[var(--muted)]">Loading…</div>;
  }

  const isOpen = market.status === 'watching';
  const pos = position ? { yes: BigInt(position.yes), no: BigInt(position.no) } : null;
  const onChainStatus = (state?.status ?? null) as MarketStatus | null;

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
      const { txHash } = await callAsWallet(activeWallet, id, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: minSharesOut.toString(),
      });
      setTxResult(txHash);
      await invalidateAfterTrade(queryClient, { kind: 'market', id, address: activeWallet.address });
    } catch (err) {
      setTxError(messageFromApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="p-3">
      <Card>
        <CardBody className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <a
              href={typeof window !== 'undefined' ? `${window.location.origin}/market/${id}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--faint)] hover:text-[var(--accent-ink)]"
            >
              <LogoMark size="xs" />
              Polaris
            </a>
            {!isOpen && <span className="text-xs text-[var(--faint)]">{statusLabel(market.status)}</span>}
          </div>

          <h2 className="text-sm font-semibold leading-snug">XLM ≥ {centsToUsd(market.strikePriceCents)}?</h2>
          <p className="-mt-1.5 text-[10px] text-[var(--faint)]">
            Can&rsquo;t lose more than you stake &mdash; funds are locked until the market settles.
          </p>

          {price && <OddsBar yesBps={price.yesBps} noBps={price.noBps} />}

          {!isOpen ? (
            pos && (pos.yes > 0n || pos.no > 0n) && onChainStatus && onChainStatus !== 'Open' ? (
              <ResultReveal
                status={onChainStatus}
                position={pos}
                compact
                nextRoundHref={nextRound ? `/embed/${nextRound.contractId}` : undefined}
              />
            ) : (
              <p className="text-xs text-[var(--muted)]">Trading closed.</p>
            )
          ) : emailSessionBlocked ? (
            <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
              <p className="text-xs text-[var(--muted)]">
                Your browser blocked the sign-in session inside this embed. Open Polaris to
                sign in with email and trade.
              </p>
              <a
                href={openInPolarisHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-lg bg-[var(--accent-ink)] px-3 text-xs font-semibold text-white"
              >
                Open in Polaris to sign in with email
              </a>
            </div>
          ) : showEmailFallback ? (
            <AuthControls
              compact
              autoFocus={false}
              embed
              onEmailSessionUnusable={() => setEmailSessionBlocked(true)}
            />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant={side === 'Yes' ? 'yes' : 'outline'} onClick={() => setSide('Yes')}>
                  YES
                </Button>
                <Button
                  size="sm"
                  variant={side === 'No' ? 'no' : 'outline'}
                  onClick={() => setSide('No')}
                  className="h-11 min-h-11"
                >
                  NO
                </Button>
              </div>
              <input
                className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-xs"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="XLM amount"
              />
              {payoutPreview && (
                <p className="text-[10px] text-[var(--faint)]">
                  You get <span className="font-semibold text-[var(--ink)]">{payoutPreview} XLM</span> if{' '}
                  {side.toUpperCase()} wins
                </p>
              )}
              <Button
                size="sm"
                className="w-full"
                variant={side === 'Yes' ? 'yes' : 'no'}
                onClick={handleTrade}
                disabled={busy || connecting || !state || !fee || !payoutPreview}
              >
                {connecting
                  ? 'Confirm in Freighter…'
                  : busy
                    ? wallet?.kind === 'email'
                      ? 'Placing bet…'
                      : 'Confirm in Freighter…'
                    : `Buy ${side}`}
              </Button>
              {!wallet && !connecting && (
                <p className="text-center text-[10px] text-[var(--faint)]">
                  Connects Freighter &mdash; sign with your own wallet
                </p>
              )}
            </div>
          )}

          {(txResult || txError || walletError) && (
            <p
              className={`text-[10px] ${txError || walletError ? 'text-[var(--no)] break-all' : 'text-[var(--yes)]'}`}
            >
              {txError ?? walletError ?? (
                <>
                  Confirmed <span className="text-[var(--faint)]">— ref {shortAddress(txResult!)}</span>
                </>
              )}
            </p>
          )}
          {walletError && !wallet && !showEmailFallback && (
            <button
              type="button"
              onClick={() => setPreferEmail(true)}
              className="text-[10px] text-[var(--faint)] underline"
            >
              Try email instead
            </button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
