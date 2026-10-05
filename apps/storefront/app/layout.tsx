import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Bengali, Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';

import './globals.css';
import { StorefrontFooter } from '@/components/layout/storefront-footer';
import { StorefrontHeader } from '@/components/layout/storefront-header';
import { SkipLink } from '@/components/ui/skip-link';
import { storefrontPublicBaseUrl } from '@/lib/env/storefront';

// Fastify is a runtime service in the standalone deployment, so routes must not
// attempt to prerender against an API that does not exist in the build stage.
export const dynamic = 'force-dynamic';

const uiFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});
const editorialFont = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});
const bengaliFont = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-noto-bengali',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(storefrontPublicBaseUrl),
  title: {
    default: 'Maevelle Storefront',
    template: '%s | Maevelle',
  },
  description:
    'Shop Maevelle fashion with clear sizing, secure checkout, and dependable order tracking.',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#fffaf7',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${uiFont.variable} ${editorialFont.variable} ${bengaliFont.variable}`}>
        <SkipLink>Skip to content</SkipLink>
        <StorefrontHeader />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <StorefrontFooter />
      </body>
    </html>
  );
}
