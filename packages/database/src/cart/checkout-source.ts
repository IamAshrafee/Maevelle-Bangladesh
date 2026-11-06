import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { AccountCartAuthority } from './types.js';
import { assertActiveCartAccount, findAccountCart } from './account.js';
import { findCart } from './context.js';
import { evaluateCart } from './queries.js';
import { CartDomainError } from './errors.js';

/** Read/lock and evaluate the complete Cart for Checkout source selection. */
export async function checkoutCartSnapshotInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    currency: string;
    account?: AccountCartAuthority;
    token?: string;
  },
) {
  const cart = input.account
    ? (await assertActiveCartAccount(tx, input.account, true),
      await findAccountCart(tx, input.account, true))
    : input.token
      ? await findCart(tx, input.token, true)
      : null;
  if (!cart || cart.organizationId !== input.organizationId || cart.currency !== input.currency)
    throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
  return evaluateCart(tx, cart);
}

/** Consumes the same active Cart revision already locked and authorized by the source facade. */
export async function convertReviewedCartInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: { organizationId: string; cartId: string; revision: string; customerId: string },
) {
  const converted = await sql`update cart.carts
    set status='CONVERTED',customer_id=${input.customerId},version=version+1,updated_at=clock_timestamp()
    where organization_id=${input.organizationId} and id=${input.cartId} and status='ACTIVE'
      and (expires_at is null or expires_at>clock_timestamp())
      and version=${input.revision}::bigint returning id`.execute(tx);
  if (!converted.rows.length)
    throw new CartDomainError('NOT_FOUND', 'The reviewed Cart is no longer active.');
}

/** Source-only facade avoids hydrating/evaluating Cart twice during a commercial quote. */
export async function checkoutCartIntentInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    currency: string;
    account?: AccountCartAuthority;
    token?: string;
  },
) {
  const cart = input.account
    ? (await assertActiveCartAccount(tx, input.account, true),
      await findAccountCart(tx, input.account, true))
    : input.token
      ? await findCart(tx, input.token, true)
      : null;
  if (!cart || cart.organizationId !== input.organizationId || cart.currency !== input.currency)
    throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
  const lines = await sql<{ id: string; variantId: string; quantity: string }>`
    select id,variant_id as "variantId",quantity::text from cart.cart_lines
    where organization_id=${input.organizationId} and cart_id=${cart.id} order by id limit 101`.execute(
    tx,
  );
  const coupons = await sql<{ code: string }>`select c.normalized_code code from cart.cart_coupons l
    join promotions.coupon_codes c on c.id=l.coupon_code_id and c.organization_id=${input.organizationId}
    where l.cart_id=${cart.id} order by c.normalized_code limit 11`.execute(tx);
  if (lines.rows.length > 100 || coupons.rows.length > 10)
    throw new CartDomainError('LIMIT_EXCEEDED', 'Cart requires review.');
  return {
    id: cart.id,
    revision: String(cart.version),
    lines: lines.rows,
    couponCodes: coupons.rows.map((c) => c.code),
  };
}
