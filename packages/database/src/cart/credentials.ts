import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { findCart } from './context.js';
import { CartDomainError } from './errors.js';

/** Internal scoped revocation; no public recovery/adoption endpoint or ownership transfer. */
export async function retireGuestCartCredential(
  db: Kysely<DatabaseSchema>,
  input: { token: string; organizationId: string; ownerContext: string },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout='2s'`.execute(tx);
    const cart = await findCart(tx, input.token, true);
    if (cart.organizationId !== input.organizationId || cart.ownerContext !== input.ownerContext)
      throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
    await sql`update cart.carts set credential_state='RETIRED',
      public_token_hash='retired:' || public_token_hash where id=${cart.id}`.execute(tx);
  });
}
