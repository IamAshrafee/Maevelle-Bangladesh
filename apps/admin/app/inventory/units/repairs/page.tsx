import { Suspense } from 'react';
import { RepairsQueue } from '@/components/inventory/units/repairs-queue';

export default function InventoryRepairsQueuePage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading garment repair and tailoring queue…
        </main>
      }
    >
      <RepairsQueue />
    </Suspense>
  );
}
