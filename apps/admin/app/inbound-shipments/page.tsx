import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ShipmentsList } from '@/components/supply/shipments-list';

export const metadata: Metadata = {
  title: 'Inbound Shipments',
  description: 'Track freight shipments, arrival notices, and warehouse intake.',
};

interface InboundShipmentsPageProps {
  readonly searchParams: Promise<{ tab?: string | string[] | undefined }>;
}

export default async function InboundShipmentsPage({ searchParams }: InboundShipmentsPageProps) {
  const { tab } = await searchParams;
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;

  if (requestedTab === 'queue') redirect('/receiving');
  if (requestedTab === 'receipts') redirect('/receiving?tab=history');

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
