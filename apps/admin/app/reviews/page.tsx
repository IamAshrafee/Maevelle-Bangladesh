import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReviewsConsole } from '@/components/reviews-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Reviews' };

export default function ReviewsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <ReviewsConsole />
    </Suspense>
  );
}
