import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SuppliersList } from '@/components/supply/suppliers-list';

export const metadata: Metadata = {
  title: 'Suppliers',
  description: 'Manage vendor commercial agreements, lead times, and buying terms.',
};

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading suppliers…
        </main>
      }
    >
      <SuppliersList />
    </Suspense>
  );
}
