import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { LandedCostConsole } from '@/components/supply/landed-cost/landed-cost-console';
import { PageSkeleton } from '@/components/ui/page-shell';

interface LandedCostPageProps {
  readonly searchParams: Promise<{ shipment?: string | string[] | undefined }>;
}

export default async function LandedCostPage({ searchParams }: LandedCostPageProps) {
  const { shipment } = await searchParams;
  const shipmentId = Array.isArray(shipment) ? shipment[0] : shipment;

  // Preserve old bookmarks while keeping shipment-specific costing in one canonical workspace.
  if (shipmentId) {
    redirect(`/inbound-shipments/${encodeURIComponent(shipmentId)}?tab=costing`);
  }

  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <LandedCostConsole />
    </Suspense>
  );
}
