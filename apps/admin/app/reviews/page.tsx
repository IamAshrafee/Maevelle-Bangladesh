import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReviewsConsole } from '@/components/reviews-console';

export const metadata: Metadata = { title: 'Reviews' };

export default function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <main className="px-8 py-12 text-sm text-muted-foreground flex items-center justify-center">
          Loading Reviews…
        </main>
      }
    >
      <ReviewsConsole />
    </Suspense>
  );
}
