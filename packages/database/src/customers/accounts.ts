import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { CustomerDomainError, createCustomer } from '../customers.js';
import { normalizeCustomerEmail, normalizeCustomerPhone } from '../customer-identities.js';
import { appendAuditEvent } from '../platform.js';
import type { CustomerAccount, CustomerAccountLinkType } from './types.js';

async function withTransaction<T>(
  db: Kysely<DatabaseSchema>,
  callback: (tx: Kysely<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if ('isTransaction' in db && (db as { isTransaction?: boolean }).isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(callback);
}

export async function linkCustomerAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    userId: string;
    linkType: CustomerAccountLinkType;
    verifiedAt?: string;
  },
): Promise<CustomerAccount> {
  return withTransaction(db, async (tx) => {
    const customer = await sql<{ id: string; status: string }>`
      select id, status from customers.customers
      where organization_id = ${input.organizationId} and id = ${input.customerId}
      for update
    `.execute(tx);

    const customerRow = customer.rows[0];
    if (!customerRow) {
      throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    }
    if (customerRow.status === 'MERGED' || customerRow.status === 'ANONYMIZED') {
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `Cannot link an account to a ${customerRow.status.toLowerCase()} customer.`,
      );
    }

    const user = await sql<{ id: string; name: string; email: string }>`
      select id, name, email from iam.users where id = ${input.userId}
    `.execute(tx);

    const userRow = user.rows[0];
    if (!userRow) {
      throw new CustomerDomainError('NOT_FOUND', 'User was not found.');
    }

    // Check existing active link for this customer
    const existingCustomerLink = await sql<{ id: string }>`
      select id from customers.customer_accounts
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and status = 'ACTIVE'
    `.execute(tx);

    if (existingCustomerLink.rows[0]) {
      throw new CustomerDomainError(
        'CONFLICT',
        'This customer is already linked to an authenticated user account.',
      );
    }

    // Check existing active link for this user in this organization
    const existingUserLink = await sql<{ id: string }>`
      select id from customers.customer_accounts
      where organization_id = ${input.organizationId}
        and user_id = ${input.userId}
        and status = 'ACTIVE'
    `.execute(tx);

    if (existingUserLink.rows[0]) {
      throw new CustomerDomainError(
        'CONFLICT',
        'This user account is already linked to another customer in this organization.',
      );
    }

    const verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : new Date();

    const inserted = await sql<{
      id: string;
      customer_id: string;
      user_id: string;
      link_type: CustomerAccountLinkType;
      verified_at: Date;
      status: string;
      created_at: Date;
      unlinked_at: Date | null;
      unlinked_by: string | null;
      unlink_reason: string | null;
    }>`
      insert into customers.customer_accounts (
        organization_id, customer_id, user_id, link_type, verified_at, status
      ) values (
        ${input.organizationId}, ${input.customerId}, ${input.userId}, ${input.linkType},
        ${verifiedAt}, 'ACTIVE'
      )
      on conflict (organization_id, customer_id)
      do update set
        user_id = excluded.user_id,
        link_type = excluded.link_type,
        verified_at = excluded.verified_at,
        status = 'ACTIVE',
        unlinked_at = null,
        unlinked_by = null,
        unlink_reason = null,
        updated_at = now(),
        version = customers.customer_accounts.version + 1
      returning *
    `.execute(tx);

    const row = inserted.rows[0]!;

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.customer.account_linked',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: {
        userId: input.userId,
        linkType: input.linkType,
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'customers.customer.account_linked', 1, 'customers.customer', ${input.customerId}, 1,
        ${JSON.stringify({
          customerId: input.customerId,
          userId: input.userId,
          linkType: input.linkType,
        })}::jsonb, now()
      )
    `.execute(tx);

    return {
      id: row.id,
      customerId: row.customer_id,
      userId: row.user_id,
      linkType: row.link_type,
      verifiedAt: row.verified_at.toISOString(),
      status: row.status as CustomerAccount['status'],
      createdAt: row.created_at.toISOString(),
      unlinkedAt: row.unlinked_at?.toISOString() ?? null,
      unlinkedBy: row.unlinked_by ?? null,
      unlinkReason: row.unlink_reason ?? null,
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
      },
    };
  });
}

export async function unlinkCustomerAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    reason: string;
  },
): Promise<CustomerAccount> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'An unlink reason is required.');
  }

  return withTransaction(db, async (tx) => {
    const existing = await sql<{
      id: string;
      customer_id: string;
      user_id: string;
      link_type: CustomerAccountLinkType;
      verified_at: Date;
      status: string;
      created_at: Date;
    }>`
      select * from customers.customer_accounts
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and status = 'ACTIVE'
      for update
    `.execute(tx);

    const row = existing.rows[0];
    if (!row) {
      throw new CustomerDomainError('NOT_FOUND', 'No active linked account found for this customer.');
    }

    const updated = await sql<{
      id: string;
      customer_id: string;
      user_id: string;
      link_type: CustomerAccountLinkType;
      verified_at: Date;
      status: string;
      created_at: Date;
      unlinked_at: Date | null;
      unlinked_by: string | null;
      unlink_reason: string | null;
    }>`
      update customers.customer_accounts
      set status = 'UNLINKED', unlinked_at = now(), unlinked_by = ${input.actorId},
          unlink_reason = ${reason}, updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${row.id}
      returning *
    `.execute(tx);

    const updatedRow = updated.rows[0]!;

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.customer.account_unlinked',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: {
        userId: row.user_id,
        reason,
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'customers.customer.account_unlinked', 1, 'customers.customer', ${input.customerId}, 1,
        ${JSON.stringify({
          customerId: input.customerId,
          userId: row.user_id,
          reason,
        })}::jsonb, now()
      )
    `.execute(tx);

    return {
      id: updatedRow.id,
      customerId: updatedRow.customer_id,
      userId: updatedRow.user_id,
      linkType: updatedRow.link_type,
      verifiedAt: updatedRow.verified_at.toISOString(),
      status: updatedRow.status as CustomerAccount['status'],
      createdAt: updatedRow.created_at.toISOString(),
      unlinkedAt: updatedRow.unlinked_at?.toISOString() ?? null,
      unlinkedBy: updatedRow.unlinked_by ?? null,
      unlinkReason: updatedRow.unlink_reason ?? null,
    };
  });
}

export async function getCustomerAccount(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<CustomerAccount | null> {
  const result = await sql<{
    id: string;
    customer_id: string;
    user_id: string;
    link_type: CustomerAccountLinkType;
    verified_at: Date;
    status: string;
    created_at: Date;
    unlinked_at: Date | null;
    unlinked_by: string | null;
    unlink_reason: string | null;
    user_name: string | null;
    user_email: string | null;
  }>`
    select a.*, u.name as user_name, u.email as user_email
    from customers.customer_accounts a
    left join iam.users u on u.id = a.user_id
    where a.organization_id = ${organizationId}
      and (
        a.customer_id = ${customerId}
        or a.customer_id in (
          select alias_customer_id from customers.customer_aliases
          where organization_id = ${organizationId} and canonical_customer_id = ${customerId}
        )
      )
      and a.status = 'ACTIVE'
    order by a.created_at desc limit 1
  `.execute(db);

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    customerId: row.customer_id,
    userId: row.user_id,
    linkType: row.link_type,
    verifiedAt: row.verified_at.toISOString(),
    status: row.status as CustomerAccount['status'],
    createdAt: row.created_at.toISOString(),
    unlinkedAt: row.unlinked_at?.toISOString() ?? null,
    unlinkedBy: row.unlinked_by ?? null,
    unlinkReason: row.unlink_reason ?? null,
    user: row.user_name && row.user_email ? {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
    } : null,
  };
}

export async function findCustomerByUserId(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  userId: string,
): Promise<{ customerId: string } | null> {
  const result = await sql<{ customer_id: string }>`
    select customer_id
    from customers.customer_accounts
    where organization_id = ${organizationId}
      and user_id = ${userId}
      and status = 'ACTIVE'
  `.execute(db);

  const row = result.rows[0];
  if (!row) return null;

  // Check if customer was merged
  const alias = await sql<{ canonical_customer_id: string }>`
    select canonical_customer_id from customers.customer_aliases
    where organization_id = ${organizationId} and alias_customer_id = ${row.customer_id}
  `.execute(db);

  return {
    customerId: alias.rows[0]?.canonical_customer_id ?? row.customer_id,
  };
}

export async function resolveCustomerForAuthenticatedUser(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userPhone?: string;
  },
): Promise<{ customerId: string; newlyLinked: boolean }> {
  const existing = await findCustomerByUserId(db, input.organizationId, input.userId);
  if (existing) {
    return { customerId: existing.customerId, newlyLinked: false };
  }

  return withTransaction(db, async (tx) => {
    let normalizedPhone: string | null = null;
    if (input.userPhone?.trim()) {
      try {
        normalizedPhone = normalizeCustomerPhone(input.userPhone);
      } catch {
        normalizedPhone = null;
      }
    }

    let normalizedEmail: string | null = null;
    if (input.userEmail?.trim()) {
      try {
        normalizedEmail = normalizeCustomerEmail(input.userEmail);
      } catch {
        normalizedEmail = null;
      }
    }

    // Look for existing active unlinked customer matching verified phone or email
    const candidates = await sql<{
      id: string;
      has_active_account: boolean;
      phone_match: boolean;
      email_match: boolean;
    }>`
      select c.id,
        exists (
          select 1 from customers.customer_accounts a
          where a.organization_id = c.organization_id and a.customer_id = c.id and a.status = 'ACTIVE'
        ) as has_active_account,
        exists (
          select 1 from customers.customer_phones p
          where p.organization_id = c.organization_id and p.customer_id = c.id
            and p.normalized_value = ${normalizedPhone ?? null}
        ) as phone_match,
        exists (
          select 1 from customers.customer_emails e
          where e.organization_id = c.organization_id and e.customer_id = c.id
            and e.normalized_value = ${normalizedEmail ?? null}
        ) as email_match
      from customers.customers c
      where c.organization_id = ${input.organizationId}
        and c.status not in ('MERGED', 'ANONYMIZED')
        and (
          (${normalizedPhone ?? null}::text is not null and exists (
            select 1 from customers.customer_phones p
            where p.organization_id = c.organization_id and p.customer_id = c.id
              and p.normalized_value = ${normalizedPhone ?? null}
          ))
          or (${normalizedEmail ?? null}::text is not null and exists (
            select 1 from customers.customer_emails e
            where e.organization_id = c.organization_id and e.customer_id = c.id
              and e.normalized_value = ${normalizedEmail ?? null}
          ))
        )
      for update of c
    `.execute(tx);

    const unlinkedCandidates = candidates.rows.filter((c) => !c.has_active_account);

    // If strong match (both match or single unlinked phone match with no conflicting account)
    const strongMatch = unlinkedCandidates.find((c) => c.phone_match && c.email_match)
      ?? (unlinkedCandidates.length === 1 ? unlinkedCandidates[0] : undefined);

    if (strongMatch) {
      await linkCustomerAccount(tx, {
        organizationId: input.organizationId,
        actorId: input.userId,
        customerId: strongMatch.id,
        userId: input.userId,
        linkType: strongMatch.phone_match ? 'VERIFIED_PHONE' : 'VERIFIED_EMAIL',
      });
      return { customerId: strongMatch.id, newlyLinked: true };
    }

    // Otherwise create a fresh customer record and link to the user
    const created = await createCustomer(tx, {
      organizationId: input.organizationId,
      actorId: input.userId,
      displayName: input.userName.trim() || 'Customer',
      ...(input.userPhone?.trim() ? { phone: input.userPhone.trim() } : {}),
      ...(input.userEmail?.trim() ? { email: input.userEmail.trim() } : {}),
      source: 'STOREFRONT',
    });

    await linkCustomerAccount(tx, {
      organizationId: input.organizationId,
      actorId: input.userId,
      customerId: created.id,
      userId: input.userId,
      linkType: 'GUEST_CONVERSION',
    });

    return { customerId: created.id, newlyLinked: true };
  });
}
