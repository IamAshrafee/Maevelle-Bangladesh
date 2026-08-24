import type { Metadata } from 'next';

import './globals.css';
import { StorefrontFooter, StorefrontHeader } from '@/components/storefront-header';

export const metadata: Metadata = {
  title: {
    default: 'Maevelle Storefront',
    template: '%s | Maevelle',
  },
  description: 'Maevelle public storefront application.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StorefrontHeader />
        {children}
        <StorefrontFooter />
      </body>
    </html>
  );
}
