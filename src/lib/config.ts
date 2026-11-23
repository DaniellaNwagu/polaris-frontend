// Reads (market list, odds, positions, balances) stay backend-mediated
// through polaris-oracle's REST API — see lib/api.ts. Trade signing and
// submission do not: a connected wallet (Freighter) builds, simulates,
// signs, and sends its own transactions directly against Soroban RPC — see
// lib/freighter-wallet.ts. Both RPC values below are public network
// parameters, not secrets — safe to bake in as defaults the same way
// oracleUrl already is.
export const config = {
  oracleUrl: process.env.NEXT_PUBLIC_ORACLE_URL ?? 'http://localhost:3001',
  stellarRpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  stellarNetworkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
};

// Shared passphrase→network-name mapping. Used both by the wrong-network
// message and by block-explorer link derivation so the two never drift.
const NETWORK_NAMES: Record<string, string> = {
  'Public Global Stellar Network ; September 2015': 'public',
  'Test SDF Network ; September 2015': 'testnet',
  'Test SDF Future Network ; October 2022': 'futurenet',
};

export function networkNameFromPassphrase(passphrase: string): string {
  return NETWORK_NAMES[passphrase] ?? 'testnet';
}

export function explorerTxUrl(hash: string): string {
  const network = networkNameFromPassphrase(config.stellarNetworkPassphrase);
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}
