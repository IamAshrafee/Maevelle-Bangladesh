import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderTrackView } from '@/features/orders';

export const metadata: Metadata = {
  title: 'Track Your Order',
  description:
    'Track your handcrafted Maevelle heirloom parcel delivered directly to your doorstep across Bangladesh in real-time.',
  robots: { index: false, follow: false },
};

function TrackOrderFallback() {
  return (
    <div className="min-h-screen w-full bg-surface flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="font-sans text-xs sm:text-sm text-on-surface-variant font-medium">
          Loading Concierge Tracker…
        </p>
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<TrackOrderFallback />}>
      <OrderTrackView />
    </Suspense>
  );
}
