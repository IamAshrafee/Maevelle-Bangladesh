import type { Metadata } from 'next';
import { Suspense } from 'react';

import { StockOverview } from '@/components/inventory/stock-overview';

export const metadata: Metadata = { title: 'Stock Positions' };

export default function InventoryStockPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading Stock Positions…
        </main>
      }
    >
      <StockOverview />
    </Suspense>
  );
}
