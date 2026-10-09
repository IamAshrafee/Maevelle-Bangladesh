import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { IntegrityCenter } from '@/components/integrity/integrity-center';

export const metadata: Metadata = {
  title: 'System Integrity Control Center · Maevelle Admin',
  description:
    'Comprehensive platform diagnostics, cross-module data consistency, anomaly investigations, and controlled projection recovery.',
};

export default function IntegrityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <p className="text-sm">Loading System Integrity Control Center…</p>
        </div>
      }
    >
      <IntegrityCenter />
    </Suspense>
  );
}
