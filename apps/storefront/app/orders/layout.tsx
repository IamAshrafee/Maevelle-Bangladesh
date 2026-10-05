import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Order service',
  robots: { index: false, follow: false },
};

export default function OrdersLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
