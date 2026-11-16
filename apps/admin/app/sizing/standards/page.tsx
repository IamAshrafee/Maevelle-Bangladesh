import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/page-shell';
import { SizingStandardsConsole } from '@/components/sizing/standards/sizing-standards-console';

export default function SizingStandardsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="standard" />}>
      <SizingStandardsConsole />
    </Suspense>
  );
}
