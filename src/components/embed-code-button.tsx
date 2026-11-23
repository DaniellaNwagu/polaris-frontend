'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Generates the `<iframe>` snippet for a market's embeddable widget
 * (`/embed/[id]`). No special `allow` permissions needed: Freighter is a
 * browser extension, not a page API gated by permissions policy, so it
 * works inside a cross-origin iframe same as the top-level app.
 */
export function EmbedCodeButton({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending reset timer on unmount so we never set state after the
  // component is gone.
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
    };
  }, []);

  const selectSnippet = () => {
    const pre = preRef.current;
    if (!pre) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(pre);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopy = async () => {
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyFailed(false);
      setCopied(true);
      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, 1500);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      selectSnippet();
    }
  };

  // Only read window once the panel is open (always post-hydration), so the
  // server and first client render match.
  const origin = open ? window.location.origin : '';
  const snippet = `<iframe
  src="${origin}/embed/${contractId}"
  width="360" height="420"
  style="border:0;border-radius:16px;overflow:hidden"
  title="Polaris market"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
  referrerpolicy="strict-origin-when-cross-origin"
  loading="lazy"
></iframe>`;

  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide embed code' : 'Get embed code'}
      </Button>
      {open && (
        <div className="mt-3 space-y-2">
          <pre
            ref={preRef}
            className="max-w-full overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs"
          >
            {snippet}
          </pre>
          <Button size="sm" variant="ghost" onClick={() => void handleCopy()}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {copyFailed && (
            <p className="text-xs text-[var(--danger)]" role="alert">
              Couldn&apos;t copy — select the code manually
            </p>
          )}
          <p className="text-xs text-[var(--faint)]">
            Your site&apos;s CSP must allow this origin in <code>frame-src</code>. See the{' '}
            <a
              className="underline"
              href="https://github.com/PolarisQ-xyz/polaris-frontend/blob/main/docs/EMBEDDING.md"
              target="_blank"
              rel="noreferrer"
            >
              embed integration guide
            </a>{' '}
            for sizing, sandboxing, and wallet behavior.
          </p>
        </div>
      )}
    </div>
  );
}
