import { Suspense } from 'react';

import { SizingAttentionConsole } from '@/components/sizing/sizing-attention-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function SizingAttentionPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <SizingAttentionConsole />
    </Suspense>
  );
}
