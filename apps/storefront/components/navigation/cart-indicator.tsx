'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CART_CHANGED_EVENT } from '@/features/cart/cart-events';
import { requestStorefrontClient } from '@/lib/api/client/http';

interface CartSummary {
  readonly lines: readonly { readonly quantity: string }[];
}

export function CartIndicator() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void requestStorefrontClient<CartSummary>('/api/storefront/v1/carts/current')
        .then((cart) => {
          if (active) setCount(cart.lines.reduce((sum, line) => sum + Number(line.quantity), 0));
        })
        .catch(() => {
          if (active) setCount(0);
        });
    };
    refresh();
    window.addEventListener(CART_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  return (
    <Link className="cart-link" href="/cart" aria-label={`Cart with ${count} items`}>
      Bag <span>{count}</span>
    </Link>
  );
}
