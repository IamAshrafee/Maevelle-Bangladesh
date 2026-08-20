import type { Metadata } from 'next';

import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
