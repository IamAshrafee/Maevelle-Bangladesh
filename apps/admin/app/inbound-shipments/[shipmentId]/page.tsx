import { Suspense } from 'react';
import { ShipmentDetail } from '@/components/supply/shipment-detail';
import { Skeleton } from '@/components/ui/skeleton';

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  return (
    <Suspense
      fallback={
        <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </main>
      }
    >
      <ShipmentDetail shipmentId={shipmentId} />
    </Suspense>
  );
}
