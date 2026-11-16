import { Suspense } from 'react';
import { FinanceConsole } from '@/components/finance-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function FinanceExpensesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <FinanceConsole mode="expenses" />
    </Suspense>
  );
}
