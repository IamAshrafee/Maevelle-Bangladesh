import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PromotionsWorkspace } from '@/components/promotions/promotions-workspace';

export const metadata: Metadata = {
  title: 'Promotions & Discounts · Maevelle Admin',
  description: 'Manage automated storewide promotions, targeted coupon codes, and commercial redemptions.',
};

export default function PromotionsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
          <div className="h-10 w-48 bg-muted/60 animate-pulse rounded-lg" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted/40 animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-muted/30 animate-pulse rounded-xl" />
        </main>
      }
    >
      <PromotionsWorkspace />
    </Suspense>
  );
}
