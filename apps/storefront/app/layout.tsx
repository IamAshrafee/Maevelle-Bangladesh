import type { Metadata } from 'next';

import './globals.css';
import { StorefrontFooter, StorefrontHeader } from '@/components/storefront-header';
import { StorefrontContextProvider } from '@/components/storefront-context';
import { storefrontPublicBaseUrl } from '@/src/server-catalog';

export const metadata: Metadata = {
  metadataBase: new URL(storefrontPublicBaseUrl),
  title: {
    default: 'Maevelle Storefront',
    template: '%s | Maevelle',
  },
  description:
    'Shop Maevelle fashion with clear sizing, secure checkout, and dependable order tracking.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StorefrontContextProvider>
          <StorefrontHeader />
          {children}
          <StorefrontFooter />
        </StorefrontContextProvider>
      </body>
    </html>
  );
}
