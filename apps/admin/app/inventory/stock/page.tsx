import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StockOverview } from '@/components/inventory/stock-overview';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Stock Positions' };

export default function InventoryStockPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <StockOverview />
    </Suspense>
  );
}
