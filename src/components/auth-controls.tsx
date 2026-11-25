'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { shortAddress, stroopsToXlm } from '@/lib/format';

/**
 * The full sign-in state machine — connect a Stellar wallet (Freighter) in
 * one click, with an email fallback (see `EmailAuthService`'s doc comment
 * in polaris-oracle for why that exists), plus sign-out once a wallet
 * exists. Shared between the header (`(app)/layout.tsx`) and the embed
 * widget rather than duplicated, since the state machine itself (five
 * distinct phases: signed-in, connecting, email-idle, email-code-sent,
 * signed-out) is identical between them — only sizing differs, via
 * `compact`.
 */
export function AuthControls({
  compact = false,
  embed = false,
}: {
  compact?: boolean;
  /**
   * Set when rendered inside the `/embed/[id]` iframe. Email sign-in there
   * depends on a third-party session cookie that Safari/Firefox/Chrome may
   * block or partition (see #119), so the embed offers "Open in Polaris"
   * instead of a signed-in state that can't actually trade.
   */
  embed?: boolean;
}) {
  const {
    wallet,
    connecting,
    freighterAvailable,
    connectWallet,
    emailStep,
    emailBusy,
    requestEmailCode,
    verifyEmailCode,
    resetEmailFlow,
    logout,
    logoutBusy,
    logoutError,
    emailSessionUnavailable,
  } = useWallet();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Focus is only moved when the email form appears as a result of a user
  // click ("or use email"), never when it renders by default (e.g. no
  // Freighter available). Auto-focusing on load would steal focus and can
  // scroll the host page when this renders inside the `/embed/[id]` iframe
  // (WCAG 3.2.1). `focusOnMount` is captured at click time so the effect
  // below only fires for that intentional transition.
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [focusOnMount, setFocusOnMount] = useState(false);

  useEffect(() => {
    if (!focusOnMount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusOnMount(false);
    if (emailStep === 'code-sent') {
      codeInputRef.current?.focus();
    } else {
      emailInputRef.current?.focus();
    }
  }, [focusOnMount, emailStep]);

  // Landing-page CTAs (`?new=1`, see hero.tsx/final-cta.tsx) land here
  // rather than silently opening Freighter's connect prompt on page load —
  // that requires a real user gesture, a query param alone can't satisfy
  // it. This just relabels and highlights the actual button a first-time
  // visitor needs to click, instead of leaving them to discover a plain
  // "Connect" on their own. Read via window.location (not useSearchParams)
  // so this component doesn't force a Suspense boundary onto every page
  // that renders it.
  //
  // Deliberately not a lazy useState initializer, despite what the
  // set-state-in-effect lint rule suggests — same reasoning as
  // useAdminKey: this is server-rendered first (no query string known
  // server-side), and matching that on the client's first hydration pass
  // avoids a real hydration mismatch, not just an extra render.
  const [firstTimeIntent, setFirstTimeIntent] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFirstTimeIntent(true);
      params.delete('new');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  const { data: balance } = useQuery({
    queryKey: ['walletBalance', wallet?.address],
    queryFn: () => api.getBalance(wallet!.address),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });

  const linkClass = `${compact ? 'text-[10px]' : 'text-[11px]'} text-[var(--muted)] underline hover:text-[var(--ink)]`;

  // #119: inside the embed, an email session that the browser won't persist
  // (third-party cookie blocked/partitioned) must never look signed in — the
  // next trade would fail. Offer a real path out instead.
  if (embed && emailSessionUnavailable) {
    return (
      <div className="flex flex-col items-end gap-1">
        <a
          href={`${window.location.origin}/?new=1`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Open in Polaris to sign in with email →
        </a>
        <p className="max-w-[220px] text-right text-[11px] text-[var(--muted)]">
          Your browser blocks the sign-in cookie inside this embed.
        </p>
      </div>
    );
  }

  if (wallet) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {balance && (
            <span className="text-xs font-mono text-[var(--muted)]">{stroopsToXlm(balance.balanceStroops)} XLM</span>
          )}
          <span className="rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono">
            {shortAddress(wallet.address)}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={logoutBusy}
            title="Freighter has no programmatic revoke — revoke this site in Freighter to fully sign out."
            className={`${linkClass} disabled:opacity-60`}
          >
            {logoutBusy ? 'Signing out…' : 'Disconnect (revoke in Freighter to fully sign out)'}
          </button>
        </div>
        {logoutError && (
          <div className="flex items-center gap-2">
            <span role="alert" className="text-[11px] text-[var(--danger,red)]">
              {logoutError}
            </span>
            <button type="button" onClick={() => void logout()} disabled={logoutBusy} className={linkClass}>
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  if (connecting) {
    return (
      <Button size="sm" disabled>
        Confirm in Freighter…
      </Button>
    );
  }

  const effectiveShowEmail = showEmail || freighterAvailable === false;

  if (effectiveShowEmail) {
    if (emailStep === 'code-sent') {
      return (
        <form
          className="flex flex-col items-end gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyEmailCode(email, code);
          }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={codeInputRef}
              disabled={emailBusy}
              size="sm"
              className="w-24 disabled:opacity-60"
              placeholder="6-digit code"
              aria-label="6-digit verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button size="sm" type="submit" disabled={emailBusy || code.length !== 6}>
              {emailBusy ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              setCode('');
              resetEmailFlow();
            }}
            className={linkClass}
          >
            Use a different email
          </button>
        </form>
      );
    }

    return (
      <form
        className="flex flex-col items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void requestEmailCode(email);
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={emailInputRef}
            type="email"
            disabled={emailBusy}
            size="sm"
            className="w-36 disabled:opacity-60"
            placeholder="you@email.com"
            aria-label="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={emailBusy || !email}>
            {emailBusy ? 'Sending…' : 'Send code'}
          </Button>
        </div>
        {freighterAvailable === false ? (
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Don&rsquo;t have Freighter? Install it →
          </a>
        ) : (
          <button type="button" onClick={() => setShowEmail(false)} className={linkClass}>
            Use a wallet instead
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={() => void connectWallet()}
        className={firstTimeIntent ? 'motion-safe:animate-pulse ring-2 ring-[var(--accent)] ring-offset-2' : undefined}
      >
        {compact ? 'Connect Wallet' : (
          <>
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect Wallet</span>
          </>
        )}
      </Button>
      {firstTimeIntent && (
        <p className="max-w-[220px] text-right text-[11px] text-[var(--muted)]">
          Connects Freighter — sign every trade yourself, no custodial account.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setFocusOnMount(true);
          setShowEmail(true);
        }}
        className={linkClass}
      >
        or use email
      </button>
    </div>
  );
}
