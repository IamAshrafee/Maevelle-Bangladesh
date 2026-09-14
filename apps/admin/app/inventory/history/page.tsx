import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MovementHistory } from '@/components/inventory/movement-history';

export const metadata: Metadata = { title: 'Movement History' };

export default function InventoryHistoryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading Movement History…
        </main>
      }
    >
      <MovementHistory />
    </Suspense>
  );
}
