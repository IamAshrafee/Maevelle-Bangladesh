import { sql, type Kysely } from 'kysely';
import type { AccountCartViewDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { checkedVersion, type ResolvedCart } from './context.js';
import { CartDomainError } from './errors.js';
import { evaluateCart } from './queries.js';
import { cartTransaction } from './transaction.js';
import type { AccountCartAuthority } from './types.js';

export async function assertActiveCartAccount(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
  lock: boolean,
): Promise<void> {
  // Match CRM's customer-before-account lock order during ownership changes.
  if (lock) {
    const customer = await sql`
      select id from customers.customers
      where organization_id=${owner.organizationId} and id=${owner.customerId} and status='ACTIVE'
      for share
    `.execute(db);
    if (!customer.rows.length)
      throw new CartDomainError('OWNER_CHANGED', 'Account Cart authority is unavailable.');
  }
  const result = await sql`
    select account.id from customers.customer_accounts account
    join customers.customers customer on customer.organization_id=account.organization_id
      and customer.id=account.customer_id
    join iam.users shopper on shopper.id=account.user_id
    where account.organization_id=${owner.organizationId} and account.id=${owner.accountId}
      and account.customer_id=${owner.customerId} and account.user_id=${owner.userId} and account.status='ACTIVE'
      and customer.status='ACTIVE' and shopper.status='ACTIVE' and shopper.email_verified
    ${lock ? sql`for share of account` : sql``}
  `.execute(db);
  if (!result.rows.length)
    throw new CartDomainError('OWNER_CHANGED', 'Account Cart authority is unavailable.');
}

export async function findAccountCart(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
  lock: boolean,
): Promise<ResolvedCart<null>> {
  const result = await sql<{
    id: string;
    version: string;
    owner_context: string;
    evaluated_at: string;
  }>`
    select id, version::text, owner_context, transaction_timestamp()::text as evaluated_at
    from cart.carts
    where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}
      and customer_id=${owner.customerId} and owner_user_id=${owner.userId} and currency_code=${owner.currency}
      and credential_state='ACCOUNT' and status='ACTIVE'
    ${lock ? sql`for update` : sql``}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new CartDomainError('NOT_FOUND', 'No active account Cart is established.');
  return {
    id: row.id,
    organizationId: owner.organizationId,
    currency: owner.currency,
    version: checkedVersion(row.version),
    ownerContext: row.owner_context,
    evaluatedAt: row.evaluated_at,
    expiresAt: null,
  };
}

export async function getAccountCart(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
): Promise<AccountCartViewDto> {
  return cartTransaction(db, async (tx) => {
    await assertActiveCartAccount(tx, owner, false);
    return evaluateCart(tx, await findAccountCart(tx, owner, false));
  });
}

export async function establishAccountCart(
  db: Kysely<DatabaseSchema>,
  owner: AccountCartAuthority,
): Promise<AccountCartViewDto> {
  return cartTransaction(db, async (tx) => {
    await assertActiveCartAccount(tx, owner, true);
    await sql`
      insert into cart.carts (organization_id,owner_account_id,customer_id,owner_user_id,currency_code,credential_state)
      values (${owner.organizationId},${owner.accountId},${owner.customerId},${owner.userId},${owner.currency},'ACCOUNT')
      on conflict (organization_id,owner_account_id,currency_code)
        where owner_account_id is not null and status='ACTIVE' do nothing
    `.execute(tx);
    return evaluateCart(tx, await findAccountCart(tx, owner, false));
  });
}
