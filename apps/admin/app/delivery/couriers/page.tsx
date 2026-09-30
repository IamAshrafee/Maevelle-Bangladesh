import React, { Suspense } from 'react';
import { CouriersConsole } from '@/components/delivery/couriers-console';

export default function CouriersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading courier integrations…</div>}>
      <CouriersConsole />
    </Suspense>
  );
}
