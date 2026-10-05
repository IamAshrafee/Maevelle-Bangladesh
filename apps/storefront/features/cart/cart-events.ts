'use client';

export const CART_CHANGED_EVENT = 'maevelle:cart-changed';

export function notifyCartChanged(): void {
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}
