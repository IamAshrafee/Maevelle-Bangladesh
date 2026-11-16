import { Suspense } from 'react';
import { UnitDetailView } from '@/components/inventory/units/unit-detail-view';
import { PageSkeleton } from '@/components/ui/page-shell';

export default async function InventoryUnitDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="standard" />}>
      <UnitDetailView unitId={id} />
    </Suspense>
  );
}
