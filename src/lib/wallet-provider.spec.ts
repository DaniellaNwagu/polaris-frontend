import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the freighter-wallet module
const mockGetConnectedAddress = vi.fn();
const mockConnect = vi.fn();
const mockSignTransaction = vi.fn();

vi.mock('./freighter-wallet', () => ({
  getConnectedAddress: (...args: unknown[]) => mockGetConnectedAddress(...args),
  connect: (...args: unknown[]) => mockConnect(...args),
  signTransaction: (...args: unknown[]) => mockSignTransaction(...args),
}));

// Mock the api module
const mockEmailLogout = vi.fn();
const mockGetEmailSession = vi.fn();

vi.mock('./api', () => ({
  api: {
    emailLogout: (...args: unknown[]) => mockEmailLogout(...args),
    getEmailSession: (...args: unknown[]) => mockGetEmailSession(...args),
  },
}));

import { WalletProvider, useWallet } from './wallet-provider';

const FREIGHTER_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const EMAIL_ADDRESS = 'GEMAILAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

// Helper component that exposes wallet state and actions via the DOM
function TestConsumer() {
  const wallet = useWallet();
  return (
    <div>
      <span data-testid="wallet-type">{wallet.wallet ? wallet.wallet.type : 'none'}</span>
      <span data-testid="wallet-address">{wallet.wallet ? wallet.wallet.address : 'none'}</span>
      <span data-testid="error">{wallet.error ?? 'no-error'}</span>
      <button data-testid="connect-freighter" onClick={() => void wallet.connectWallet('freighter')}>
        connect
      </button>
      <button data-testid="logout" onClick={() => void wallet.logout()}>
        logout
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <WalletProvider>
      <TestConsumer />
    </WalletProvider>,
  );
}

describe('wallet-provider sign-out behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockGetConnectedAddress.mockResolvedValue(null);
    mockConnect.mockResolvedValue(FREIGHTER_ADDRESS);
    mockGetEmailSession.mockResolvedValue(null);
    mockEmailLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('Freighter sign-out persistence', () => {
    it('sets the signed-out flag on logout and does not silently restore on remount', async () => {
      // First mount: Freighter is authorized at the origin, so it restores silently.
      mockGetConnectedAddress.mockResolvedValue(FREIGHTER_ADDRESS);

      const first = renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('freighter');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe(FREIGHTER_ADDRESS);

      // Sign out.
      await act(async () => {
        screen.getByTestId('logout').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('none');
      });

      // The signed-out flag must be persisted.
      expect(window.localStorage.getItem('wallet:signedOut')).toBe('true');

      first.unmount();

      // Remount (simulates reload / new tab). Freighter still reports the address,
      // but the signed-out flag must suppress silent restore.
      mockGetConnectedAddress.mockResolvedValue(FREIGHTER_ADDRESS);

      renderProvider();

      // Give the mount effect a chance to run.
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('wallet-type').textContent).toBe('none');
      expect(screen.getByTestId('wallet-address').textContent).toBe('none');
    });

    it('clears the signed-out flag and restores the wallet on explicit connect', async () => {
      // Start in a signed-out state.
      window.localStorage.setItem('wallet:signedOut', 'true');
      mockGetConnectedAddress.mockResolvedValue(FREIGHTER_ADDRESS);

      renderProvider();

      // Silent restore is suppressed.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('wallet-type').textContent).toBe('none');

      // Explicit connect.
      await act(async () => {
        screen.getByTestId('connect-freighter').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('freighter');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe(FREIGHTER_ADDRESS);
      expect(mockConnect).toHaveBeenCalled();

      // The flag must be cleared.
      expect(window.localStorage.getItem('wallet:signedOut')).toBeNull();
    });
  });

  describe('email sign-out', () => {
    it('only clears local state after api.emailLogout() resolves', async () => {
      // Simulate an existing email session restored on mount.
      mockGetEmailSession.mockResolvedValue({ address: EMAIL_ADDRESS });

      let resolveLogout: (value: unknown) => void = () => {};
      mockEmailLogout.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogout = resolve;
          }),
      );

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('email');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe(EMAIL_ADDRESS);

      // Trigger logout; the backend call is still pending.
      await act(async () => {
        screen.getByTestId('logout').click();
      });

      // While pending, the wallet must remain signed in.
      expect(screen.getByTestId('wallet-type').textContent).toBe('email');
      expect(screen.getByTestId('wallet-address').textContent).toBe(EMAIL_ADDRESS);

      // Resolve the backend logout.
      await act(async () => {
        resolveLogout(undefined);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('none');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe('none');
      expect(mockEmailLogout).toHaveBeenCalledTimes(1);
    });

    it('keeps the wallet signed in with a retryable error when api.emailLogout() rejects', async () => {
      mockGetEmailSession.mockResolvedValue({ address: EMAIL_ADDRESS });
      mockEmailLogout.mockRejectedValue(new Error('backend blip'));

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('email');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe(EMAIL_ADDRESS);

      await act(async () => {
        screen.getByTestId('logout').click();
      });

      // The wallet must remain signed in after a failed logout.
      await waitFor(() => {
        expect(mockEmailLogout).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByTestId('wallet-type').textContent).toBe('email');
      expect(screen.getByTestId('wallet-address').textContent).toBe(EMAIL_ADDRESS);

      // A visible, retryable error must be surfaced.
      expect(screen.getByTestId('error').textContent).not.toBe('no-error');

      // Retry: the next attempt succeeds and clears local state.
      mockEmailLogout.mockResolvedValue(undefined);

      await act(async () => {
        screen.getByTestId('logout').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('wallet-type').textContent).toBe('none');
      });
      expect(screen.getByTestId('wallet-address').textContent).toBe('none');
      expect(mockEmailLogout).toHaveBeenCalledTimes(2);
    });
  });
});