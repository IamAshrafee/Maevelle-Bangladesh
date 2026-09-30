import { Suspense } from 'react';

import { FulfillmentConsole } from '@/components/fulfillment/fulfillment-console';

export default function FulfillmentsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading fulfillment workspace…
        </main>
      }
    >
      <FulfillmentConsole />
    </Suspense>
  );
}
