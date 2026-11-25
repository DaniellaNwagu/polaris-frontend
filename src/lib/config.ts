// Reads (market list, odds, positions, balances) stay backend-mediated
// through polaris-oracle's REST API — see lib/api.ts. Trade signing and
// submission do not: a connected wallet (Freighter) builds, simulates,
// signs, and sends its own transactions directly against Soroban RPC — see
// lib/freighter-wallet.ts. Both RPC values below are public network
// parameters, not secrets — safe to bake in as defaults the same way
// oracleUrl already is.
//
// NEXT_PUBLIC_* values are inlined at build time. In a production build we
// must not silently fall back to localhost/testnet defaults: a Vercel
// environment missing a variable would otherwise ship a site that either
// can't reach any backend or mixes a mainnet oracle with a testnet
// RPC/passphrase. So defaults are kept for `next dev` only; a production
// build throws (at module load, i.e. build time) naming each missing var.
const isProduction = process.env.NODE_ENV === 'production';

const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL;
const stellarRpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
const stellarNetworkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;

if (isProduction) {
  const missing: string[] = [];
  if (!oracleUrl) missing.push('NEXT_PUBLIC_ORACLE_URL');
  if (!stellarRpcUrl) missing.push('NEXT_PUBLIC_STELLAR_RPC_URL');
  if (!stellarNetworkPassphrase) missing.push('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''} for a production build: ${missing.join(', ')}. ` +
        'Set them explicitly (e.g. in your Vercel project settings or CI) — production builds do not fall back to localhost/testnet defaults.',
    );
  }
}

export const config = {
  oracleUrl: oracleUrl ?? 'http://localhost:3001',
  stellarRpcUrl: stellarRpcUrl ?? 'https://soroban-testnet.stellar.org',
  stellarNetworkPassphrase: stellarNetworkPassphrase ?? 'Test SDF Network ; September 2015',
};