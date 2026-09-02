import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CustomersList } from '@/components/customers/customers-list';

export const metadata: Metadata = { title: 'Customers' };

export default function AdminCustomersPage() {
  return (
    <Suspense
      fallback={<main className="px-8 py-12 text-sm text-muted-foreground">Loading Customers…</main>}
    >
      <CustomersList />
    </Suspense>
  );
}
