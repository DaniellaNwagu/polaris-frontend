'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAdminKey } from '@/lib/admin-key-provider';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { shortAddress, formatDateTime } from '@/lib/format';
import { qk } from '@/lib/query-keys';

function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
}

export default function AdminWalletsPage() {
  const { adminKey } = useAdminKey();
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const { data, isLoading } = useQuery({
    queryKey: qk.admin.wallets(adminKey),
    queryFn: () => api.getAdminWallets(adminKey),
    refetchInterval: 30_000,
  });

  const toggleRevealed = (address: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  if (isLoading || !data) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Wallets</h1>

      <Card className="mb-6">
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Email wallets</h2>
            <Badge tone="accent">{data.emailWallets.length} total</Badge>
          </div>
          <p className="mb-3 text-xs text-[var(--faint)]">Exhaustive — every one is created by this backend.</p>
          {data.emailWallets.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">None yet.</p>
          ) : (
            <div className="space-y-2">
              {data.emailWallets.map((w) => (
                <div
                  key={w.address}
                  className="flex items-center justify-between border-t border-[var(--line)] py-2 text-sm first:border-t-0 first:pt-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{revealed.has(w.address) ? w.email : maskEmail(w.email)}</span>
                      <button
                        type="button"
                        onClick={() => toggleRevealed(w.address)}
                        className="text-xs text-[var(--faint)] underline hover:text-[var(--fg)]"
                        aria-label={revealed.has(w.address) ? 'Hide email' : 'Reveal email'}
                      >
                        {revealed.has(w.address) ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                    <div className="font-mono text-xs text-[var(--faint)]">{shortAddress(w.address)}</div>
                  </div>
                  <div className="text-xs text-[var(--faint)]">{formatDateTime(w.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
