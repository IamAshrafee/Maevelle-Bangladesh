import { Suspense } from 'react';

import { CostingConsole } from '@/components/costing-console';

export default function LandedCostPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading landed cost…</main>}>
      <CostingConsole section="landed-cost" />
    </Suspense>
  );
}
