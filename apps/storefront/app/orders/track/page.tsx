import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Order tracking unavailable',
  robots: { index: false, follow: false },
};
export default function TrackOrderPage() {
  return (
    <main className="mx-auto min-h-[60vh] max-w-2xl space-y-5 px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold">Order tracking is currently unavailable</h1>
      <p className="text-on-surface-variant">
        Contact Maevelle for help with an existing order. An order number and phone number alone
        cannot authorize private order access.
      </p>
      <Link
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
        href="/orders/confirmation"
      >
        Check authorized receipt access
      </Link>
      <Link
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
        href="/cart"
      >
        Return to your bag
      </Link>
    </main>
  );
}
