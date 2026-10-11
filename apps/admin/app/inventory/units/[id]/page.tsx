import { Suspense } from 'react';
import { UnitDetailView } from '@/components/inventory/units/unit-detail-view';

export default async function InventoryUnitDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading physical unit details…
        </main>
      }
    >
      <UnitDetailView unitId={id} />
    </Suspense>
  );
}
