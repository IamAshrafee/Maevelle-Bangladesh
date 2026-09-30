import React, { Suspense } from 'react';
import { DeliveryOperationsConsole } from '@/components/delivery/delivery-operations-console';

export default function DeliveryOperationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading delivery operations overview…</div>}>
      <DeliveryOperationsConsole />
    </Suspense>
  );
}
