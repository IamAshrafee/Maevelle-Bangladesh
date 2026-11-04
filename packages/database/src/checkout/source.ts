import type { Transaction } from 'kysely';
import type { CheckoutSourceDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { checkoutCartSnapshotInTransaction } from '../cart.js';
import { storefrontVariantEligibility } from '../catalog-variant-integrity.js';
import { CheckoutError, type CheckoutAuthority, type CheckoutContext } from './types.js';

export function validateCheckoutSource(source: CheckoutSourceDto): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const keys = source && typeof source === 'object' ? Object.keys(source) : [];
  const allowed =
    source?.kind === 'CART'
      ? ['kind', 'cartId', 'cartRevision']
      : ['kind', 'variantId', 'quantity'];
  if (
    !source ||
    keys.some((k) => !allowed.includes(k)) ||
    (source.kind === 'CART'
      ? typeof source.cartId !== 'string' ||
        !uuid.test(source.cartId) ||
        typeof source.cartRevision !== 'string' ||
        !/^[1-9][0-9]{0,18}$/.test(source.cartRevision) ||
        BigInt(source.cartRevision) > 9223372036854775807n
      : source.kind !== 'BUY_NOW' ||
        typeof source.variantId !== 'string' ||
        !uuid.test(source.variantId) ||
        typeof source.quantity !== 'string' ||
        !/^[1-9][0-9]?$/.test(source.quantity))
  )
    throw new CheckoutError('INVALID_REQUEST', 'A valid bounded Checkout source is required.');
}

export async function checkoutSourceLines(
  tx: Transaction<DatabaseSchema>,
  context: CheckoutContext,
  owner: CheckoutAuthority,
  source: CheckoutSourceDto,
  cartToken?: string,
): Promise<readonly { variantId: string; quantity: string; cartLineId: string | null }[]> {
  validateCheckoutSource(source);
  if (source.kind === 'CART') {
    const cart = await checkoutCartSnapshotInTransaction(tx, {
      ...context,
      ...(owner.kind === 'ACCOUNT'
        ? { account: { ...owner, currency: context.currency } }
        : { ...(cartToken ? { token: cartToken } : {}) }),
    });
    if (cart.id !== source.cartId || cart.intentRevision !== source.cartRevision)
      throw new CheckoutError(
        'SOURCE_CHANGED',
        'Review the current Cart before starting Checkout.',
      );
    if (!cart.lines.length || !cart.commerceReview?.merchandiseReady)
      throw new CheckoutError('SOURCE_INELIGIBLE', 'The complete Cart requires review.');
    return cart.lines.map((line) => ({
      variantId: line.variantId,
      quantity: String(BigInt(line.quantity.split('.')[0]!)),
      cartLineId: line.id,
    }));
  }
  if (!(await storefrontVariantEligibility(tx, context.organizationId, source.variantId)))
    throw new CheckoutError(
      'SOURCE_INELIGIBLE',
      'Variant is unavailable or incorrectly configured.',
    );
  // No prices, inventory holds or hidden Cart: future quotes establish financial eligibility.
  return [{ variantId: source.variantId, quantity: source.quantity, cartLineId: null }];
}
