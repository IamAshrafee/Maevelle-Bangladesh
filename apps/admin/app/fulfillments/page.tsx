import { Suspense } from 'react';

import { FulfillmentConsole } from '@/components/fulfillment/fulfillment-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function FulfillmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <FulfillmentConsole />
    </Suspense>
  );
}
