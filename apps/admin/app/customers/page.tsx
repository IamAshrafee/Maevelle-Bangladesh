import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/page-shell';

import { CustomersList } from '@/components/customers/customers-list';

export const metadata: Metadata = { title: 'Customers' };

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <CustomersList />
    </Suspense>
  );
}
