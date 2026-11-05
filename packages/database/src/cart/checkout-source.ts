import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { AccountCartAuthority } from './types.js';
import { assertActiveCartAccount, findAccountCart } from './account.js';
import { findCart } from './context.js';
import { evaluateCart } from './queries.js';
import { CartDomainError } from './errors.js';

/** Read/lock only. Checkout must later add semantic conversion here, never direct SQL writes. */
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
