import { Suspense } from 'react';

import { CostingConsole } from '@/components/costing-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function CostingPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" widthVariant="standard" />}>
      <CostingConsole />
    </Suspense>
  );
}
