import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersList } from '@/components/orders/orders-list';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Orders' };

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <OrdersList />
    </Suspense>
  );
}
