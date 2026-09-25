import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShipmentsList } from '@/components/supply/shipments-list';

export const metadata: Metadata = {
  title: 'Inbound Shipments',
  description: 'Track freight shipments, arrival notices, and warehouse intake.',
};

export default function InboundShipmentsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading inbound shipments…
        </main>
      }
    >
      <ShipmentsList />
    </Suspense>
  );
}
