import { Suspense } from 'react';

import { DeliveryConsole } from '@/components/delivery/delivery-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <DeliveryConsole />
    </Suspense>
  );
}
