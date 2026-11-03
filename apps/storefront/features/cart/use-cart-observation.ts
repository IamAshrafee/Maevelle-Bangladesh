'use client';

import { useEffect, useRef } from 'react';
import type { CartObservationSurface } from '@maevelle/contracts';
import { emitCartObservation } from '@/lib/analytics/cart-telemetry';
import type { CartSnapshot } from './types';

/** One observation per visible episode, including through hydration and effect replays. */
export function useCartObservation(
  owner: CartSnapshot['owner'],
  surface: CartObservationSurface | 'RECOVERY',
  visible: boolean,
) {
  const seen = useRef(false);
  useEffect(() => {
    if (owner === 'checking') return;
    if (!visible) {
      seen.current = false;
      return;
    }
    if (seen.current || window.location.pathname === '/design-system') return;
    seen.current = true;
    const mode = owner === 'account' ? 'ACCOUNT' : 'GUEST';
    void emitCartObservation(
      surface === 'RECOVERY'
        ? { name: 'CART_RECOVERY_VIEWED', data: { mode } }
        : { name: 'CART_VIEWED', data: { mode, surface } },
    );
  }, [owner, surface, visible]);
}
