import type { Metadata } from 'next';
import { Suspense } from 'react';

import { OrdersList } from '@/components/orders/orders-list';

export const metadata: Metadata = { title: 'Orders' };

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={<main className="px-8 py-12 text-sm text-muted-foreground">Loading Orders…</main>}
    >
      <OrdersList />
    </Suspense>
  );
}
