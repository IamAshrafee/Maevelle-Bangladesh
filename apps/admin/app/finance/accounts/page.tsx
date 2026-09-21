import { Suspense } from 'react';

import { FinanceConsole } from '@/components/finance-console';
import { Skeleton } from '@/components/ui/skeleton';

export default async function FinanceAccountsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string | undefined }>;
}) {
  const { tab } = await searchParams;

  return (
    <Suspense
      fallback={
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1500px] gap-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-32 rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <FinanceConsole mode="treasury" initialSection={tab} />
    </Suspense>
  );
}
