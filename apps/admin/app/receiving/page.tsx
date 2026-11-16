import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReceivingWorkspace } from '@/components/supply/receiving-workspace';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Inbound Receiving & Inspection',
  description: 'Physical warehouse intake, condition inspection, and inventory stock increases.',
};

export default function ReceivingPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <ReceivingWorkspace />
    </Suspense>
  );
}
