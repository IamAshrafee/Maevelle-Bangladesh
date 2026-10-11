import { Suspense } from 'react';
import { UnitsList } from '@/components/inventory/units/units-list';

export default function InventoryUnitsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading individual physical inventory units…
        </main>
      }
    >
      <UnitsList />
    </Suspense>
  );
}
