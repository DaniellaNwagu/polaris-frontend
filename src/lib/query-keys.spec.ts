import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateAfterTrade } from './query-keys';

function keysFor(args: Parameters<typeof invalidateAfterTrade>[1]) {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  return invalidateAfterTrade({ invalidateQueries } as unknown as QueryClient, args).then(() =>
    invalidateQueries.mock.calls.map(([o]) => o.queryKey),
  );
}

describe('invalidateAfterTrade', () => {
  it('refreshes position, state, price, wallet balance and the header portfolio row after a market buy', async () => {
    expect(await keysFor({ kind: 'market', id: 'M1', address: 'GUSER' })).toEqual(
      expect.arrayContaining([
        ['position', 'M1', 'GUSER'],
        ['state', 'M1'],
        ['price', 'M1'],
        ['walletBalance', 'GUSER'],
        ['portfolio-row', 'M1', 'GUSER'],
      ]),
    );
  });

  it('refreshes the perpetual equivalents after a perpetual buy', async () => {
    expect(await keysFor({ kind: 'perpetual', id: 'P1', address: 'GUSER' })).toEqual(
      expect.arrayContaining([
        ['perpetualPosition', 'P1', 'GUSER'],
        ['walletBalance', 'GUSER'],
        ['portfolio-perpetual-row', 'P1', 'GUSER'],
      ]),
    );
  });
});
