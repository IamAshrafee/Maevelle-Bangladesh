import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReceivingWorkspace } from '@/components/supply/receiving-workspace';

export const metadata: Metadata = {
  title: 'Inbound Receiving & Inspection',
  description: 'Physical warehouse intake, condition inspection, and inventory stock increases.',
};

export default function ReceivingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 space-y-5 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading receiving workspace…
        </main>
      }
    >
      <ReceivingWorkspace />
    </Suspense>
  );
}
