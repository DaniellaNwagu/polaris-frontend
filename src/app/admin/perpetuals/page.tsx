'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, messageFromApiError, type OnChainPerpetual, type WatchedPerpetual } from '@/lib/api';
import { useAdminKey } from '@/components/admin-key-provider';
import { Address } from '@/components/ui/address';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents, formatDate } from '@/lib/format';

interface PerpetualRow {
  watched: WatchedPerpetual;
  state: OnChainPerpetual | null;
  stateError: string | null;
}

/** Same rule as `perpetual/[id]/page.tsx`: `lastPriceAt === 0` means `record_price_checkpoint` has never succeeded. */
function hasCheckpoint(state: OnChainPerpetual | null): boolean {
  return !!state && state.lastPriceAt !== '0';
}

export default function AdminPerpetualsPage() {
  const { adminKey } = useAdminKey();
  const [rows, setRows] = useState<PerpetualRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkpointPrice, setCheckpointPrice] = useState('');

  const load = useCallback(async () => {
    if (!adminKey) return;
    setError(null);
    try {
      const watched = await api.listPerpetuals();
      const withState = await Promise.all(
        watched.map(async (w): Promise<PerpetualRow> => {
          try {
            const state = await api.getPerpetualState(w.contractId);
            return { watched: w, state, stateError: null };
          } catch (err) {
            return { watched: w, state: null, stateError: messageFromApiError(err) };
          }
        }),
      );
      setRows(withState);
    } catch (err) {
      setError(messageFromApiError(err));
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordCheckpoint(contractId: string) {
    if (!adminKey) return;
    const cents = Number(checkpointPrice);
    if (!Number.isFinite(cents) || cents <= 0) {
      setActionError('Enter a positive price in cents.');
      return;
    }
    setBusyId(contractId);
    setActionError(null);
    try {
      await api.recordPerpetualCheckpoint(contractId, Math.round(cents), adminKey);
      setCheckpointPrice('');
      await load();
    } catch (err) {
      setActionError(messageFromApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function terminate(contractId: string) {
    if (!adminKey) return;
    setBusyId(contractId);
    setActionError(null);
    try {
      await api.terminatePerpetual(contractId, adminKey);
      await load();
    } catch (err) {
      setActionError(messageFromApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Perpetuals</h1>
        <Button variant="outline" onClick={() => void load()} disabled={!adminKey}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {actionError && <p className="text-sm text-red-500">{actionError}</p>}

      {!rows ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No perpetuals tracked yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ watched, state, stateError }) => (
            <Card key={watched.contractId}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  <Link href={`/perpetual/${watched.contractId}`} className="hover:underline">
                    <Address value={watched.contractId} />
                  </Link>
                </CardTitle>
                <Badge variant={watched.status === 'terminated' ? 'destructive' : 'default'}>
                  {watched.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {stateError ? (
                  <p className="text-red-500">{stateError}</p>
                ) : state ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Pool Yes</div>
                      <div>{state.poolYes}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Pool No</div>
                      <div>{state.poolNo}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Last checkpoint</div>
                      <div>
                        {hasCheckpoint(state)
                          ? `${formatCents(state.lastPriceCents)} · ${formatDate(Number(state.lastPriceAt))}`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div>{state.status}</div>
                    </div>
                  </div>
                ) : null}

                {watched.lastError && <p className="text-red-500">{watched.lastError}</p>}

                {watched.status !== 'terminated' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Price (cents)"
                      value={checkpointPrice}
                      onChange={(e) => setCheckpointPrice(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      size="sm"
                      onClick={() => void recordCheckpoint(watched.contractId)}
                      disabled={busyId === watched.contractId}
                    >
                      Record checkpoint
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void terminate(watched.contractId)}
                      disabled={busyId === watched.contractId}
                    >
                      Terminate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
