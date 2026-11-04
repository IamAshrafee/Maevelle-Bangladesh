/** Identity hints invalidate private views; only the server establishes the next owner. */
export const SHOPPER_TRANSITION_EVENT = 'maevelle:shopper-transition';
export const SHOPPER_TRANSITION_STORAGE = 'maevelle_cart_identity_v1';
export const SHOPPER_AUTH_STORAGE = 'maevelle_shopper_auth_signal';
export function announceShopperTransition(phase: 'begin' | 'settled') {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent !== 'undefined'
  )
    window.dispatchEvent(new CustomEvent(SHOPPER_TRANSITION_EVENT, { detail: { phase } }));
}
