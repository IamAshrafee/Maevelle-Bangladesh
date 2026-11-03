'use client';

import Link from 'next/link';
import { useCartSnapshot } from '@/features/cart/use-cart';

export function WishlistBagFeedback({
  id,
  engaged,
  message,
  onNavigate,
}: {
  id: string;
  engaged: boolean;
  message: string | null;
  onNavigate?: (() => void) | undefined;
}) {
  const cart = useCartSnapshot();
  const relevant = engaged || cart.pending?.command.kind === 'wishlist-transfer';
  const text = message ?? (relevant ? (cart.issue?.message ?? cart.notice) : null);
  return (
    <div id={id} tabIndex={-1} className="mx-auto max-w-7xl px-4 sm:px-6">
      <p
        role="status"
        className={
          text
            ? 'mt-4 rounded-xl border border-border bg-surface-container-low p-3 text-sm'
            : undefined
        }
      >
        {text}
        {relevant && cart.pending && !cart.recoveryPersisted && (
          <span> This browser could not retain recovery after a reload. Keep this tab open.</span>
        )}
        {text && (
          <Link
            className="ml-2 inline-flex min-h-11 items-center font-semibold underline"
            href="/cart"
            onClick={() => onNavigate?.()}
          >
            {cart.pending ? 'Recover in your bag' : 'View bag'}
          </Link>
        )}
      </p>
    </div>
  );
}
