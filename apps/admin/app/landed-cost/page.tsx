import { Suspense } from 'react';

import { LandedCostConsole } from '@/components/supply/landed-cost/landed-cost-console';

export default function LandedCostPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading landed cost…</main>}>
      <LandedCostConsole />
    </Suspense>
  );
}
