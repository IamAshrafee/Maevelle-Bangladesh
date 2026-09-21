import { Suspense } from 'react';

import { CostingConsole } from '@/components/costing-console';

export default function CostingPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading costing…</main>}>
      <CostingConsole section="costing" />
    </Suspense>
  );
}
