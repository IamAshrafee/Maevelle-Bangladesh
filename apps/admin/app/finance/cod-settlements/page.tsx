import { Suspense } from 'react';

import { FinanceConsole } from '@/components/finance-console';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinanceCodSettlementsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1500px] gap-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </main>
      }
    >
      <FinanceConsole mode="cod-settlements" />
    </Suspense>
  );
}
