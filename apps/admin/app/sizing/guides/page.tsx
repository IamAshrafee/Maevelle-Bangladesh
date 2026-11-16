import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SizingGuidesConsole } from '@/components/sizing/sizing-guides-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Fit & Size Guides · Maevelle',
};

export default function SizeGuidesListPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="standard" />}>
      <SizingGuidesConsole />
    </Suspense>
  );
}
