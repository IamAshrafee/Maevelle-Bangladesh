import { Suspense } from 'react';

import { FinanceConsole } from '@/components/finance-console';
import { Skeleton } from '@/components/ui/skeleton';

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1500px] gap-6">
            <Skeleton className="h-20 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <FinanceConsole mode="overview" />
    </Suspense>
  );
}
