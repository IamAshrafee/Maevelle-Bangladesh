export const cartMutationOperations = [
  'add_line',
  'remove_line',
  'set_quantity',
  'replace_variant',
  'clear',
  'apply_coupon',
  'remove_coupon',
  'wishlist_transfer',
  'merge_guest',
] as const;

export type CartMutationOperation = (typeof cartMutationOperations)[number];

/** Internal operational measurement on cart.intent.mutated v2. */
export interface CartMutationMeasurement {
  readonly owner: 'GUEST' | 'ACCOUNT';
  readonly wishlistAction: 'ADD' | 'MOVE' | null;
  readonly currency: string;
  readonly unitDelta: number;
  readonly unitsAfter: number;
  readonly linesAfter: number;
  readonly merchandiseGrossAfter: string;
  readonly merchandiseNetAfter: string;
}

/** Phase 05B observations belong to a consented stream separate from commerce outcomes. */
export type CartInteractionName =
  'CART_VIEWED' | 'CART_COMMAND_INITIATED' | 'CART_COMMAND_REJECTED' | 'CART_RECOVERY_VIEWED';

export interface CartActivityTotals {
  readonly mutations: string;
  readonly distinctCarts: string;
}

export interface CartActivityBreakdown extends CartActivityTotals {
  readonly operation: CartMutationOperation;
  readonly owner: CartMutationMeasurement['owner'];
  readonly wishlistAction: CartMutationMeasurement['wishlistAction'];
  readonly currency: string;
  readonly netUnitChange: string;
}
