const authoritativeNames = new Set([
  'ORDER_PLACED',
  'PAYMENT_CONFIRMED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'REFUND_COMPLETED',
]);
const browserNames = new Set([
  'PRODUCT_VIEWED',
  'PRODUCT_LIST_VIEWED',
  'PRODUCT_SELECTED',
  'VARIANT_SELECTED',
  'SIZE_GUIDE_OPENED',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'VIEW_CART',
  'BEGIN_CHECKOUT',
  'ADD_SHIPPING_INFO',
  'ADD_PAYMENT_INFO',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuthoritativeCommerceName(name: string) {
  return authoritativeNames.has(name);
}

/** Positive storage allowlist. Public labels, free text, attribution and client money are not retained.
 * Cart/Wishlist observations have their own stricter existing validators and contracts.
 */
export function minimizeGenericObservation(
  name: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!browserNames.has(name)) throw new Error('Unsupported browser observation');
  const result: Record<string, unknown> = {};
  for (const key of ['cartId', 'productId', 'listId']) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== 'string' || !uuid.test(data[key]))
        throw new Error('Unsafe observation identifier');
      result[key] = data[key];
    }
  }
  const item = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid item');
    const input = value as Record<string, unknown>;
    if (
      typeof input.productId !== 'string' ||
      !uuid.test(input.productId) ||
      typeof input.skuId !== 'string' ||
      !uuid.test(input.skuId)
    )
      throw new Error('Invalid item identity');
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99)
      throw new Error('Invalid quantity');
    return { productId: input.productId, skuId: input.skuId, quantity };
  };
  if (data.item !== undefined) result.item = item(data.item);
  if (data.items !== undefined) {
    if (!Array.isArray(data.items) || data.items.length > 100) throw new Error('Invalid items');
    result.items = data.items.map(item);
  }
  return result;
}
