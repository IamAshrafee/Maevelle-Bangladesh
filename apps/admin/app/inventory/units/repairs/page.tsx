import { Suspense } from 'react';
import { RepairsQueue } from '@/components/inventory/units/repairs-queue';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function InventoryRepairsQueuePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="standard" />}>
      <RepairsQueue />
    </Suspense>
  );
}
