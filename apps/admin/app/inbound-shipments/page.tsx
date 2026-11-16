import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ShipmentsList } from '@/components/supply/shipments-list';
import { PageSkeleton } from '@/components/ui/page-shell';

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
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <ShipmentsList />
    </Suspense>
  );
}
