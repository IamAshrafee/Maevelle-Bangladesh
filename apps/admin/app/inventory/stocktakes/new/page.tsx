import { Suspense } from 'react';
import { StocktakeForm } from '@/components/inventory/stocktake-form';

export default function NewStocktakePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-w-0 max-w-3xl space-y-6 px-4 py-6 sm:px-6 text-sm text-muted-foreground">
          Loading stocktake form…
        </main>
      }
    >
      <StocktakeForm />
    </Suspense>
  );
}
