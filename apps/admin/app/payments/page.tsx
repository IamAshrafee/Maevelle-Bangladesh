import { Suspense } from 'react';

import { PaymentsConsole } from '@/components/payments-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <PaymentsConsole />
    </Suspense>
  );
}
