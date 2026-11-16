import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PromotionsWorkspace } from '@/components/promotions/promotions-workspace';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Promotions & Discounts · Maevelle Admin',
  description:
    'Manage automated storewide promotions, targeted coupon codes, and commercial redemptions.',
};

export default function PromotionsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <PromotionsWorkspace />
    </Suspense>
  );
}
