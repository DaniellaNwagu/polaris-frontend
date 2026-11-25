'use client';

import { useState } from 'react';
import { shortAddress } from '@/lib/format';

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet';

/**
 * Truncated address/contract id with the full value in `title`, a one-click copy
 * button, and an explorer link. Used across the admin pages so debugging a stuck
 * market doesn't require devtools.
 */
export function Address({
  value,
  className = '',
  chars = 4,
}: {
  value: string;
  className?: string;
  chars?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); ignore silently.
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${className}`}>
      <span title={value} className="text-[var(--faint)]">
        {shortAddress(value, chars)}
      </span>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied!' : 'Copy full value'}
        aria-label={copied ? 'Copied' : 'Copy full value'}
        className="text-[var(--faint)] hover:text-[var(--fg)]"
      >
        {copied ? '✓' : '⧉'}
      </button>
      <a
        href={`${EXPLORER_BASE}/contract/${value}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in explorer"
        aria-label="Open in explorer"
        className="text-[var(--faint)] hover:text-[var(--fg)]"
      >
        ↗
      </a>
    </span>
  );
}
