import React, { Suspense } from 'react';
import { ReturnsConsole } from '@/components/returns/returns-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function RtoPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <ReturnsConsole initialTab="rto" />
    </Suspense>
  );
}
