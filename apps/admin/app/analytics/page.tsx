import { Suspense } from 'react';
import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" widthVariant="standard" />}>
      <AnalyticsWorkspace />
    </Suspense>
  );
}
