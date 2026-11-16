import { Suspense } from 'react';
import { ShipmentDetail } from '@/components/supply/shipment-detail';
import { PageSkeleton } from '@/components/ui/page-shell';

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="wide" />}>
      <ShipmentDetail shipmentId={shipmentId} />
    </Suspense>
  );
}
