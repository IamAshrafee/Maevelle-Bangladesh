import { Suspense } from 'react';
import { FinanceConsole } from '@/components/finance-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default async function FinanceAccountsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string | undefined }>;
}) {
  const { tab } = await searchParams;

  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <FinanceConsole mode="treasury" initialSection={tab} />
    </Suspense>
  );
}
