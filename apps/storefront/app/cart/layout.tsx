import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your bag',
  robots: { index: false, follow: true },
  alternates: { canonical: '/cart' },
};

export default function CartLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
