import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Checkout unavailable',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main className="mx-auto min-h-[60vh] max-w-2xl space-y-4 px-4 py-12 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold">Checkout is currently unavailable</h1>
      <p className="text-on-surface-variant">
        You can still review and edit the items in your shopping bag.
      </p>
      <Link
        href="/cart"
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
      >
        Return to your bag
      </Link>
    </main>
  );
}
