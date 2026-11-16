import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IntegrityCenter } from '@/components/integrity/integrity-center';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'System Integrity Control Center · Maevelle Admin',
  description:
    'Comprehensive platform diagnostics, cross-module data consistency, anomaly investigations, and controlled projection recovery.',
};

export default function IntegrityPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" widthVariant="standard" />}>
      <IntegrityCenter />
    </Suspense>
  );
}
