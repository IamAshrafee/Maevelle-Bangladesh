import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export interface ShopperPrincipal {
  readonly organizationId: string;
  readonly accountId: string;
  readonly customerId: string;
  readonly userId: string;
}

/**
 * Called only after a shopper-realm session has been verified. Never searches
 * CRM contacts by email or phone: historical contacts need a separate claim.
 */
export async function resolveOrEnrollShopper(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  userId: string,
): Promise<ShopperPrincipal | null> {
  return db.transaction().execute(async (tx) => {
    const identity = await sql<{ id: string; name: string }>`
      select id::text,name from iam.users
      where id=${userId}::uuid and status='ACTIVE' and email_verified=true
      for update
    `.execute(tx);
    const user = identity.rows[0];
    if (!user) return null;
    const existing = await sql<{
      id: string;
      customer_id: string;
      status: string;
      customer_status: string;
    }>`
      select account.id::text,account.customer_id::text,account.status,
        customer.status as customer_status
      from customers.customer_accounts account
      join customers.customers customer
        on customer.organization_id=account.organization_id and customer.id=account.customer_id
      where account.organization_id=${organizationId} and account.user_id=${userId}::uuid
      for update of account
    `.execute(tx);
    const link = existing.rows[0];
    if (link)
      return link.status === 'ACTIVE' && link.customer_status === 'ACTIVE'
        ? { organizationId, accountId: link.id, customerId: link.customer_id, userId }
        : null;

    const customer = await sql<{ id: string }>`
      insert into customers.customers
        (organization_id,customer_number,display_name,first_source,latest_source)
      values (${organizationId},'CUS-' || upper(replace(uuidv7()::text,'-','')),
        ${user.name.trim() || 'Customer'},'STOREFRONT','STOREFRONT')
      returning id::text
    `.execute(tx);
    const customerId = customer.rows[0]!.id;
    const account = await sql<{ id: string }>`
      insert into customers.customer_accounts
        (organization_id,customer_id,user_id,link_type,status)
      values (${organizationId},${customerId}::uuid,${userId}::uuid,'GUEST_CONVERSION','ACTIVE')
      returning id::text
    `.execute(tx);
    await appendAuditEvent(tx, {
      organizationId,
      actorType: 'USER',
      actorId: userId,
      action: 'customers.customer.account_linked',
      targetType: 'customers.customer',
      targetId: customerId,
      metadata: { linkType: 'GUEST_CONVERSION', source: 'SHOPPER_REALM' },
    });
    await sql`
      insert into platform.outbox_events
        (organization_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,payload,occurred_at)
      values (${organizationId},'customers.customer.account_linked',1,
        'customers.customer',${customerId}::uuid,1,
        ${JSON.stringify({ customerId, userId, linkType: 'GUEST_CONVERSION' })}::jsonb,now())
    `.execute(tx);
    return { organizationId, accountId: account.rows[0]!.id, customerId, userId };
  });
}
