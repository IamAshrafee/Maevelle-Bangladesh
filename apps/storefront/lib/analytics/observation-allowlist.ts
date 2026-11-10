const names = new Set([
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
/** Drop labels, amounts, contact, attribution and URLs before they reach the network. */
export function minimalBrowserData(
  name: string,
  input: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!names.has(name)) return null;
  const result: Record<string, unknown> = {};
  for (const key of ['cartId', 'productId', 'listId'])
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || !uuid.test(input[key])) return null;
      result[key] = input[key];
    }
  const item = (v: unknown) => {
    if (!v || typeof v !== 'object') return null;
    const x = v as Record<string, unknown>;
    const quantity = x.quantity ?? 1;
    if (
      typeof x.productId !== 'string' ||
      typeof x.skuId !== 'string' ||
      !uuid.test(x.productId) ||
      !uuid.test(x.skuId) ||
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 99
    )
      return null;
    return { productId: x.productId, skuId: x.skuId, quantity };
  };
  if (input.item !== undefined) {
    const value = item(input.item);
    if (!value) return null;
    result.item = value;
  }
  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length > 100) return null;
    const values = input.items.map(item);
    if (values.some((v) => !v)) return null;
    result.items = values;
  }
  return result;
}
