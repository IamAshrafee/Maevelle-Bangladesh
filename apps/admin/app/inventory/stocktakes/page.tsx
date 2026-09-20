import { Suspense } from 'react';
import { StocktakeOverview } from '@/components/inventory/stocktake-overview';

export default function StocktakesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 text-sm text-muted-foreground">
          Loading stocktakes dashboard…
        </main>
      }
    >
      <StocktakeOverview />
    </Suspense>
  );
}

