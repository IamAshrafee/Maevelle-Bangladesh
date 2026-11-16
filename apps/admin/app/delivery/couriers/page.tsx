import React, { Suspense } from 'react';
import { CouriersConsole } from '@/components/delivery/couriers-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function CouriersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <CouriersConsole />
    </Suspense>
  );
}
