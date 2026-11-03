/** Stable facade for existing Orders, Checkout and Storefront consumers. */
export { CartDomainError } from './cart/errors.js';
export type { CartView, GuestMutationScope } from './cart/types.js';
export { findCart, createGuestCart } from './cart/context.js';
export { getGuestCart } from './cart/queries.js';
export {
  addGuestCartLine,
  clearGuestCart,
  setGuestCartLineQuantity,
  removeGuestCartLine,
  applyGuestCartCoupon,
  removeGuestCartCoupon,
} from './cart/commands.js';
