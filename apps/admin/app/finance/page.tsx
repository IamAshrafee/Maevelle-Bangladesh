import { Suspense } from 'react';
import { FinanceConsole } from '@/components/finance-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function FinancePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" widthVariant="wide" />}>
      <FinanceConsole mode="overview" />
    </Suspense>
  );
}
