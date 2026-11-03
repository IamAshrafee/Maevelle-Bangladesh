/** Stable facade for existing Orders, Checkout and Storefront consumers. */
export { CartDomainError } from './cart/errors.js';
export type { CartView, GuestMutationScope } from './cart/types.js';
export { findCart, createGuestCart } from './cart/context.js';
export { getGuestCart } from './cart/queries.js';
export {
  addCartLine,
  addCartLine as addGuestCartLine,
  clearCart,
  clearCart as clearGuestCart,
  setCartLineQuantity,
  setCartLineQuantity as setGuestCartLineQuantity,
  removeCartLine,
  removeCartLine as removeGuestCartLine,
  replaceCartLineVariant,
  replaceCartLineVariant as replaceGuestCartLineVariant,
  applyCartCoupon,
  applyCartCoupon as applyGuestCartCoupon,
  removeCartCoupon,
  removeCartCoupon as removeGuestCartCoupon,
} from './cart/commands.js';
export { getAccountCart, establishAccountCart } from './cart/account.js';
export { previewCartMerge, commitCartMerge } from './cart/merge.js';
export type { AccountCartAuthority, CartMutationScope } from './cart/types.js';
