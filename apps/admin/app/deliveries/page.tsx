import { Suspense } from 'react';

import { DeliveryConsole } from '@/components/delivery/delivery-console';

export default function DeliveriesPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-sm text-muted-foreground">
          Loading delivery workspace…
        </main>
      }
    >
      <DeliveryConsole />
    </Suspense>
  );
}
