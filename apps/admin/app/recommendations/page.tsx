import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RecommendationsWorkspace } from '@/components/recommendations/recommendations-workspace';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Product Recommendations · Maevelle Admin',
  description:
    'Manage storefront PDP discovery carousels, cross-sell styling affinity rules, catalog coverage, and consented shopper engagement.',
};

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <RecommendationsWorkspace />
    </Suspense>
  );
}
