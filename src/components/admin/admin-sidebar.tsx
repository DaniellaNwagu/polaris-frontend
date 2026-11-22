'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// No Growth group (referrals/notifications/waitlist) and no KYC/Bank
// Payouts/Cards/Pay Links under Finance — there's no fiat rail, card
// issuance, or onboarding-gate concept in Polaris, and an empty nav item
// is worse than not having the section. See polaris-frontend/README.md.
const NAV_GROUPS: NavGroup[] = [
  { label: 'Platform', items: [{ href: '/admin', label: 'Overview' }] },
  {
    label: 'Finance',
    items: [
      { href: '/admin/markets', label: 'Markets' },
      { href: '/admin/create', label: 'Create Market' },
      { href: '/admin/perpetuals', label: 'Perpetuals' },
      { href: '/admin/fee-revenue', label: 'Fee Revenue' },
      { href: '/admin/treasury', label: 'Treasury' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/admin/wallets', label: 'Wallets' },
      { href: '/admin/network', label: 'Blockchain' },
      { href: '/admin/settlement-checks', label: 'Fraud & Trust' },
    ],
  },
];

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 space-y-6 border-r border-[var(--line)] px-4 py-6">
      <Link
        href="/"
        className={cn('flex items-center gap-2 rounded-lg px-2 font-bold', FOCUS_RING)}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #5b4fe0, #8b7bff)' }}
        >
          ◈
        </span>
        Polaris Admin
      </Link>
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block rounded-lg px-2 py-1.5 text-sm',
                    FOCUS_RING,
                    active
                      ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]'
                      : 'text-[var(--ink-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
