import React, { Suspense } from 'react';
import { ReturnsConsole } from '@/components/returns/returns-console';

export default function RtoPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading RTO workspace…</div>}>
      <ReturnsConsole initialTab="rto" />
    </Suspense>
  );
}
