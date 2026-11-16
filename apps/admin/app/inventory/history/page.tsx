import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MovementHistory } from '@/components/inventory/movement-history';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Movement History' };

export default function InventoryHistoryPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <MovementHistory />
    </Suspense>
  );
}
