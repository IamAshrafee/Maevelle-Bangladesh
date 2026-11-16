import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PurchasesList } from '@/components/supply/purchases-list';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Purchase Orders',
  description: 'Manage supplier purchase orders and line allocations.',
};

export default function PurchasesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <PurchasesList />
    </Suspense>
  );
}
