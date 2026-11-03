'use client';
import { useSyncExternalStore } from 'react';
import { cartStore } from './browser-runtime';
import { confirmedCartCount } from './types';
/** Select a primitive: price/error updates do not rerender every count consumer. */
export function useCartCount(initialCount?: number): number | null {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => confirmedCartCount(cartStore.getSnapshot()),
    () => initialCount ?? null,
  );
}
