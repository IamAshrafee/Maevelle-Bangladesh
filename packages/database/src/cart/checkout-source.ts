import type { Transaction } from 'kysely';
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
