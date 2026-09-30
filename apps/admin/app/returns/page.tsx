import React, { Suspense } from 'react';
import { ReturnsConsole } from '@/components/returns/returns-console';

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading returns workspace…</div>}>
      <ReturnsConsole initialTab="customer" />
    </Suspense>
  );
}
