'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet-provider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { shortAddress, stroopsToXlm } from '@/lib/format';
import { qk } from '@/lib/query-keys';

/** Backend rate-limits OTP requests; keep the resend link disabled for this long after each successful send so the user isn't just bouncing off that limit. */
const RESEND_COOLDOWN_SECS = 30;

type EmailStep = 'idle' | 'code-sent';

export function AuthControls() {
  const { address, email, connectEmail, disconnect } = useWallet();
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const { data: balance } = useQuery({
    queryKey: qk.wallet.balance(wallet?.address),
    queryFn: () => api.getBalance(wallet!.address),
    enabled: !!wallet,
    refetchInterval: 20_000,
  });

  function resetEmailFlow() {
    setEmailStep('idle');
    setCodeInput('');
    setError(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = null;
    setCooldown(0);
  }

  if (address) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="font-mono text-xs text-neutral-400">
          {email ?? `${address.slice(0, 4)}…${address.slice(-4)}`}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (emailStep === 'code-sent') {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-2 text-sm">
        <p className="text-xs text-neutral-400">
          We sent a code to <span className="font-mono">{emailInput}</span>.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          className="rounded border border-neutral-700 bg-transparent px-3 py-1.5 text-sm"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !codeInput}
            className="rounded bg-white px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || cooldown > 0}
            className="text-xs text-neutral-400 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
          <button
            type="button"
            onClick={resetEmailFlow}
            className="text-xs text-neutral-400 underline-offset-2 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequestCode} className="flex flex-col gap-2 text-sm">
      <input
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        className="rounded border border-neutral-700 bg-transparent px-3 py-1.5 text-sm"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !emailInput}
        className="rounded bg-white px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Email me a code'}
      </button>
    </form>
  );
}
