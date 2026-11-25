import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const callAsWallet = vi.fn();
const estimateBuy = vi.fn();
const invalidateQueries = vi.fn();
const connect = vi.fn();

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({ address: "SP123", connect }),
}));

vi.mock("@/lib/contract", () => ({
  callAsWallet: (...args: unknown[]) => callAsWallet(...args),
  estimateBuy: (...args: unknown[]) => estimateBuy(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useBuyFlow, SLIPPAGE_TOLERANCE_BPS } from "./use-buy-flow";

describe("useBuyFlow", () => {
  beforeEach(() => {
    callAsWallet.mockReset();
    estimateBuy.mockReset();
    invalidateQueries.mockReset();
    connect.mockReset();
  });

  it("exposes default state", () => {
    const { result } = renderHook(() =>
      useBuyFlow({ contractId: "market-1", kind: "market", state: "open", fee: 100 }),
    );
    expect(result.current.side).toBe("yes");
    expect(result.current.amount).toBe("");
    expect(result.current.busy).toBe(false);
    expect(result.current.txResult).toBeNull();
    expect(result.current.txError).toBeNull();
  });

  it("computes preview and minSharesOut from amount and fee", () => {
    const { result } = renderHook(() =>
      useBuyFlow({ contractId: "market-1", kind: "market", state: "open", fee: 100 }),
    );
    act(() => result.current.setAmount("1000"));
    expect(result.current.preview).toBe(900);
    expect(result.current.minSharesOut).toBe(
      Math.floor((900 * (10_000 - SLIPPAGE_TOLERANCE_BPS)) / 10_000),
    );
  });

  it("connects on demand, estimates, applies slippage floor, calls wallet, invalidates", async () => {
    estimateBuy.mockResolvedValue(950);
    callAsWallet.mockResolvedValue({ txId: "0xabc" });

    const { result } = renderHook(() =>
      useBuyFlow({ contractId: "market-1", kind: "market", state: "open", fee: 100 }),
    );
    act(() => result.current.setAmount("1000"));

    await act(async () => {
      await result.current.buy();
    });

    expect(connect).toHaveBeenCalled();
    expect(estimateBuy).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "market-1", side: "yes", amount: 1000 }),
    );
    expect(callAsWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "market-1",
        minSharesOut: Math.floor((950 * (10_000 - SLIPPAGE_TOLERANCE_BPS)) / 10_000),
      }),
    );
    expect(invalidateQueries).toHaveBeenCalled();
    await waitFor(() => expect(result.current.txResult).toEqual({ txId: "0xabc" }));
    expect(result.current.busy).toBe(false);
  });

  it("captures errors into txError and clears busy", async () => {
    estimateBuy.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useBuyFlow({ contractId: "market-1", kind: "market", state: "open", fee: 100 }),
    );
    act(() => result.current.setAmount("1000"));

    await act(async () => {
      await result.current.buy();
    });

    expect(result.current.txError).toBe("boom");
    expect(result.current.busy).toBe(false);
    expect(callAsWallet).not.toHaveBeenCalled();
  });

  it("does nothing when amount is empty", async () => {
    const { result } = renderHook(() =>
      useBuyFlow({ contractId: "market-1", kind: "market", state: "open", fee: 100 }),
    );
    await act(async () => {
      await result.current.buy();
    });
    expect(estimateBuy).not.toHaveBeenCalled();
    expect(callAsWallet).not.toHaveBeenCalled();
  });
});
