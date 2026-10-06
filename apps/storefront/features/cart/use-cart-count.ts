'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CART_CHANGED_EVENT } from '@/features/cart/cart-events';
import { requestStorefrontClient } from '@/lib/api/client/http';

interface CartSummary {
  readonly lines: readonly { readonly quantity: string }[];
}

export function useCartCount(initialCount: number = 0): number {
  const pathname = usePathname();
  const [count, setCount] = useState<number>(initialCount);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      void requestStorefrontClient<CartSummary>('/api/storefront/v1/carts/current')
        .then((cart) => {
          if (active && cart?.lines) {
            const total = cart.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
            setCount(total);
          }
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

  return count;
}
