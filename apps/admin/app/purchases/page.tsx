import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PurchasesList } from '@/components/supply/purchases-list';

export const metadata: Metadata = {
  title: 'Purchase Orders',
  description: 'Manage supplier purchase orders and line allocations.',
};

export default function PurchasesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading purchase orders…
        </main>
      }
    >
      <PurchasesList />
    </Suspense>
  );
}
