import { Suspense } from 'react';
import { StocktakeForm } from '@/components/inventory/stocktake-form';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function NewStocktakePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" widthVariant="narrow" />}>
      <StocktakeForm />
    </Suspense>
  );
}
