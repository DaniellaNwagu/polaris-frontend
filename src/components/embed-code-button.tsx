'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Generates the `<iframe>` snippet for a market's embeddable widget
 * (`/embed/[id]`). No special `allow` permissions needed: Freighter is a
 * browser extension, not a page API gated by permissions policy, so it
 * works inside a cross-origin iframe same as the top-level app.
 *
 * The widget posts `{ type: 'polaris:resize', height }` to its parent on
 * mount and on every size change, so the snippet includes a small listener
 * that keeps the iframe height in sync with the widget's content.
 */
export function EmbedCodeButton({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only read window once the panel is open (always post-hydration), so the
  // server and first client render match.
  const origin = open ? window.location.origin : '';
  const snippet = `<iframe
  id="polaris-${contractId}"
  src="${origin}/embed/${contractId}"
  width="360" height="420"
  style="border:0;border-radius:16px;overflow:hidden"
  title="Polaris market"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
  referrerpolicy="strict-origin-when-cross-origin"
  loading="lazy"
></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== '${origin}' || !e.data || e.data.type !== 'polaris:resize') return;
    var f = document.getElementById('polaris-${contractId}');
    if (f && typeof e.data.height === 'number') f.style.height = e.data.height + 'px';
  });
</script>`;

  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide embed code' : 'Get embed code'}
      </Button>
      {open && (
        <div className="mt-3 space-y-2">
          <pre className="max-w-full overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs">
            {snippet}
          </pre>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
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
