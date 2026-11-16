import { Suspense } from 'react';
import { UnitsList } from '@/components/inventory/units/units-list';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function InventoryUnitsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="standard" />}>
      <UnitsList />
    </Suspense>
  );
}
