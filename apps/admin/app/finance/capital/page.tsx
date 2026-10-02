import { Suspense } from 'react';
import { CapitalConsole } from '@/components/finance/capital-console';
import { Skeleton } from '@/components/ui/skeleton';

export default function CapitalPage() {
  return (
    <Suspense
      fallback={
        <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </main>
      }
    >
      <CapitalConsole />
    </Suspense>
  );
}
