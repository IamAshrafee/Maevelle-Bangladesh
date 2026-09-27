import { Suspense } from 'react';

import { PaymentsConsole } from '@/components/payments-console';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminPaymentsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1500px] gap-6">
            <Skeleton className="h-20 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </main>
      }
    >
      <PaymentsConsole />
    </Suspense>
  );
}
