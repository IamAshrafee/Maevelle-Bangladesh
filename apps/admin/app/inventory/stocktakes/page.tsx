import { Suspense } from 'react';
import { StocktakeOverview } from '@/components/inventory/stocktake-overview';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function StocktakesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="standard" />}>
      <StocktakeOverview />
    </Suspense>
  );
}
