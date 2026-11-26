import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/lib/query-provider';
import { WalletProvider } from '@/lib/wallet-provider';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Polaris',
  title: 'Polaris',
  description: 'A trustless prediction market on XLM/USD, settled by Pyth Lazer.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1016' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* reads localStorage before first paint to avoid theme flash */}
      <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      <body>
        <QueryProvider>
          <WalletProvider>{children}</WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
