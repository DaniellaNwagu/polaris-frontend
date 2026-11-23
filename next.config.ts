import type { NextConfig } from 'next';

// ---------------------------------------------------------------------------
// CSP configuration
// ---------------------------------------------------------------------------
//
// The app signs transactions and holds an admin key in sessionStorage, so a
// strict CSP is the last line of defense against XSS / compromised-dependency
// script injection exfiltrating the key or swapping a contract id.
//
// `script-src` uses a per-request nonce per Next's CSP guide:
//   https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
// Next reads the nonce from the `x-nonce` request header (set by middleware)
// and stamps it onto its own <script> tags.
//
// `connect-src` is restricted to the configured oracle URL and Stellar RPC
// origins. These are read from env at build/config time. Provide sensible
// defaults for the public Stellar networks; override via env for custom
// deployments.
//
// Rollout: ship as Content-Security-Policy-Report-Only first (CSP_REPORT_ONLY
// env flag, default on), verify via `curl -I` on a preview deploy that normal
// flows produce no violations, then flip CSP_REPORT_ONLY=0 to enforce.

const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY !== '0';

function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Configured oracle URL (server-side proxy or direct oracle endpoint).
const oracleOrigin =
  toOrigin(process.env.NEXT_PUBLIC_ORACLE_URL) ??
  toOrigin(process.env.ORACLE_URL);

// Stellar RPC origin(s). Support a comma-separated list so multiple RPC
// endpoints (e.g. primary + fallback) can be allowed.
const rpcOrigins = (process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? process.env.STELLAR_RPC_URL ?? '')
  .split(',')
  .map((u) => toOrigin(u.trim()))
  .filter((o): o is string => o !== null);

// Default to the public Stellar RPC if nothing is configured, so the app
// still works out of the box.
const connectSrc = Array.from(
  new Set([
    "'self'",
    ...(oracleOrigin ? [oracleOrigin] : []),
    ...(rpcOrigins.length > 0 ? rpcOrigins : ['https://soroban-testnet.stellar.org']),
  ]),
);

function buildCsp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    // Nonce-based script-src per Next's CSP guide. 'strict-dynamic' lets
    // nonce-trusted scripts load further scripts (Next's chunk loader).
    // 'unsafe-eval' is only needed in dev for React Refresh; keep it out of
    // production.
    `script-src 'self' 'nonce-{{NONCE}}' 'strict-dynamic'${
      process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''
    }`,
    // Next injects inline styles; 'unsafe-inline' is required for styled-jsx
    // and inline style attributes unless you adopt a style nonce strategy.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

// Baseline security headers applied to every route.
const baselineHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const cspHeaderKey = CSP_REPORT_ONLY
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Every route is the sign-in/trade-signing surface — without this,
        // any site could iframe /market/[id] (hidden or transparent) and
        // run a clickjacking/UI-redress attack against the Connect Wallet /
        // confirm-trade buttons underneath. X-Frame-Options has no "allow
        // from anywhere" value to override back to below, so it's omitted
        // here in favor of CSP's frame-ancestors (the mechanism Next's own
        // docs call out as superseding it), which IS cleanly overridable
        // per-path — see the next rule and Next's "Header Overriding
        // Behavior" docs.
        //
        // The nonce placeholder is substituted per-request by middleware
        // (see middleware.ts), which also sets the `x-nonce` request header
        // Next reads to stamp its own <script> tags.
        source: '/:path*',
        headers: [
          ...baselineHeaders,
          { key: cspHeaderKey, value: buildCsp("'none'") },
        ],
      },
      {
        // /embed/* is designed to run inside a third-party <iframe> —
        // deliberately re-opened, since "embed this on any site" is the
        // whole point of this route. Last-matching-rule-wins on the same
        // header key, so this cleanly overrides the rule above instead of
        // stacking with it.
        source: '/embed/:path*',
        headers: [
          ...baselineHeaders,
          { key: cspHeaderKey, value: buildCsp('*') },
        ],
      },
    ];
  },
};

export default nextConfig;