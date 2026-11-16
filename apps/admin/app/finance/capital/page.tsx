import { Suspense } from 'react';
import { CapitalConsole } from '@/components/finance/capital-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function CapitalPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <CapitalConsole />
    </Suspense>
  );
}
