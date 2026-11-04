import { sql, type Kysely } from 'kysely';
import { generateOpaqueToken, hashToken } from '@maevelle/security';
import type { DatabaseSchema } from '../index.js';
import { lockShopperSession } from '../shopper-session-fence.js';
import { CheckoutError, type CheckoutAuthority, type CheckoutContext } from './types.js';

/** First lock in every future Checkout write: revocation → Customer → account → user. */
export async function lockCheckoutAuthority(
  tx: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
): Promise<void> {
  if (!tx.isTransaction)
    throw new Error('Checkout authority must be checked inside its transaction.');
  if (owner.kind === 'GUEST') {
    const row = await sql`
      select id from orders.checkout_guest_sessions where organization_id=${owner.organizationId}
        and id=${owner.sessionId} and token_hash=${hashToken(owner.token)} and revoked_at is null
      for update`.execute(tx);
    const live = await sql`select id from orders.checkout_guest_sessions
      where id=${owner.sessionId} and expires_at>clock_timestamp() and revoked_at is null`.execute(
      tx,
    );
    if (!row.rows.length || !live.rows.length)
      throw new CheckoutError('SESSION_EXPIRED', 'Guest Checkout authority is unavailable.');
    return;
  }
  await lockShopperSession(tx, owner.sessionKeyHash);
  const session = await sql`select key_hash from iam.auth_kv_store
    where key_hash=${owner.sessionKeyHash} and encrypted_value is not null and expires_at>clock_timestamp()
      and not exists(select 1 from iam.shopper_revoked_storage_keys where key_hash=${owner.sessionKeyHash})
    for share`.execute(tx);
  if (!session.rows.length)
    throw new CheckoutError('SESSION_EXPIRED', 'Sign in again before accessing Checkout.');
  const customer =
    await sql`select id from customers.customers where organization_id=${owner.organizationId}
    and id=${owner.customerId} and status='ACTIVE' for share`.execute(tx);
  const account =
    await sql`select id from customers.customer_accounts where organization_id=${owner.organizationId}
    and id=${owner.accountId} and customer_id=${owner.customerId} and user_id=${owner.userId} and status='ACTIVE' for update`.execute(
      tx,
    );
  const user =
    await sql`select id from iam.users where id=${owner.userId} and status='ACTIVE' and email_verified for share`.execute(
      tx,
    );
  if (!customer.rows.length || !account.rows.length || !user.rows.length)
    throw new CheckoutError('OWNER_CHANGED', 'Checkout account authority is unavailable.');
}

export async function createCheckoutGuestSession(
  db: Kysely<DatabaseSchema>,
  context: CheckoutContext,
) {
  const token = generateOpaqueToken();
  const row = await sql<{
    id: string;
    expires_at: Date;
  }>`insert into orders.checkout_guest_sessions(organization_id,token_hash)
    values(${context.organizationId},${hashToken(token)}) returning id,expires_at`.execute(db);
  return {
    token,
    session: { id: row.rows[0]!.id, expiresAt: row.rows[0]!.expires_at.toISOString() },
  };
}

export async function revokeCheckoutGuestSession(
  db: Kysely<DatabaseSchema>,
  owner: Extract<CheckoutAuthority, { kind: 'GUEST' }>,
) {
  await db.transaction().execute(async (tx) => {
    await lockCheckoutAuthority(tx, owner);
    await sql`update orders.checkout_guest_sessions set revoked_at=clock_timestamp() where id=${owner.sessionId}`.execute(
      tx,
    );
  });
}
