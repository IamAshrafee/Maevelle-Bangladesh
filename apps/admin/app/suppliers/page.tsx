import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SuppliersList } from '@/components/supply/suppliers-list';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Suppliers',
  description: 'Manage vendor commercial agreements, lead times, and buying terms.',
};

export default function SuppliersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <SuppliersList />
    </Suspense>
  );
}
