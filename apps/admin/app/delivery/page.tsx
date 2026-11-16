import React, { Suspense } from 'react';
import { DeliveryOperationsConsole } from '@/components/delivery/delivery-operations-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function DeliveryOperationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" widthVariant="wide" />}>
      <DeliveryOperationsConsole />
    </Suspense>
  );
}
