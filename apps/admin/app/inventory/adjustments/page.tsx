import { Suspense } from 'react';
import { AdjustmentsSection } from '@/components/inventory/adjustments-section';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function AdjustmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" widthVariant="narrow" />}>
      <AdjustmentsSection />
    </Suspense>
  );
}
