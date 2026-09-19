import { Suspense } from 'react';

import { AdjustmentsSection } from '@/components/inventory/adjustments-section';

export default function AdjustmentsPage() {
  return (
    <Suspense
      fallback={
        <main className="px-8 py-12 text-sm text-muted-foreground">Loading adjustments…</main>
      }
    >
      <AdjustmentsSection />
    </Suspense>
  );
}
