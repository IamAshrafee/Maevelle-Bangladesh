'use client';
import { useSyncExternalStore } from 'react';
import { cartStore } from './browser-runtime';
import { cartIsBusy } from './types';
export function useCartSnapshot() {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );
}
export function useCartBusy() {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartIsBusy(cartStore.getSnapshot()),
    () => true,
  );
}
export function useCartEpoch() {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot().epoch,
    () => 0,
  );
}
export function useCartMessage() {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot().issue?.message ?? cartStore.getSnapshot().notice ?? '',
    () => '',
  );
}
