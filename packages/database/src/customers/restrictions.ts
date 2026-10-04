import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { CustomerDomainError } from '../customers.js';
import { appendAuditEvent } from '../platform.js';
import type { CustomerRestriction, CustomerRestrictionType } from './types.js';

export async function applyCustomerRestriction(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    restrictionType: CustomerRestrictionType;
    reason: string;
    notes?: string;
    expiresAt?: string;
  },
): Promise<CustomerRestriction> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'A restriction reason is required.');
  }

  return db.transaction().execute(async (tx) => {
    const customer = await sql<{
      id: string;
      status: string;
    }>`
      select id, status from customers.customers
      where organization_id = ${input.organizationId} and id = ${input.customerId}
      for update
    `.execute(tx);

    const row = customer.rows[0];
    if (!row) {
      throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    }
    if (row.status === 'MERGED' || row.status === 'ANONYMIZED') {
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `Cannot apply restrictions to a ${row.status.toLowerCase()} customer.`,
      );
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new CustomerDomainError('VALIDATION_FAILED', 'Restriction expiry must be in the future.');
    }

    const inserted = await sql<{
      id: string;
      customer_id: string;
      restriction_type: CustomerRestrictionType;
      status: string;
      reason: string;
      notes: string | null;
      created_by: string;
      expires_at: Date | null;
      lifted_at: Date | null;
      lifted_by: string | null;
      lift_reason: string | null;
      created_at: Date;
    }>`
      insert into customers.customer_restrictions (
        organization_id, customer_id, restriction_type, status, reason, notes,
        created_by, expires_at
      ) values (
        ${input.organizationId}, ${input.customerId}, ${input.restrictionType}, 'ACTIVE',
        ${reason}, ${input.notes?.trim() ?? null}, ${input.actorId}, ${expiresAt}
      )
      returning *
    `.execute(tx);

    const restrictionRow = inserted.rows[0];
    if (!restrictionRow) {
      throw new Error('Failed to insert customer restriction.');
    }

    if (input.restrictionType === 'ORDERING_BLOCKED') {
      await sql`
        update customers.customers
        set status = 'BLOCKED', updated_at = now(), version = version + 1
        where organization_id = ${input.organizationId} and id = ${input.customerId}
      `.execute(tx);
    }

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.customer.restricted',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: {
        restrictionId: restrictionRow.id,
        restrictionType: input.restrictionType,
        reason,
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'customers.customer.restricted', 1, 'customers.customer', ${input.customerId}, 1,
        ${JSON.stringify({
          customerId: input.customerId,
          restrictionId: restrictionRow.id,
          restrictionType: input.restrictionType,
        })}::jsonb, now()
      )
    `.execute(tx);

    return {
      id: restrictionRow.id,
      customerId: restrictionRow.customer_id,
      restrictionType: restrictionRow.restriction_type,
      status: restrictionRow.status as CustomerRestriction['status'],
      reason: restrictionRow.reason,
      notes: restrictionRow.notes,
      createdBy: restrictionRow.created_by,
      createdAt: restrictionRow.created_at.toISOString(),
      expiresAt: restrictionRow.expires_at?.toISOString() ?? null,
      liftedAt: restrictionRow.lifted_at?.toISOString() ?? null,
      liftedBy: restrictionRow.lifted_by ?? null,
      liftReason: restrictionRow.lift_reason ?? null,
    };
  });
}

export async function liftCustomerRestriction(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    restrictionId: string;
    liftReason: string;
  },
): Promise<CustomerRestriction> {
  const liftReason = input.liftReason.trim();
  if (!liftReason) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'A lift reason is required.');
  }

  return db.transaction().execute(async (tx) => {
    const existing = await sql<{
      id: string;
      customer_id: string;
      restriction_type: CustomerRestrictionType;
      status: string;
      reason: string;
      notes: string | null;
      created_by: string;
      expires_at: Date | null;
      created_at: Date;
    }>`
      select * from customers.customer_restrictions
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and id = ${input.restrictionId}
      for update
    `.execute(tx);

    const row = existing.rows[0];
    if (!row) {
      throw new CustomerDomainError('NOT_FOUND', 'Restriction was not found on this customer.');
    }
    if (row.status !== 'ACTIVE') {
      throw new CustomerDomainError('VALIDATION_FAILED', `Restriction is already ${row.status.toLowerCase()}.`);
    }

    const updated = await sql<{
      id: string;
      customer_id: string;
      restriction_type: CustomerRestrictionType;
      status: string;
      reason: string;
      notes: string | null;
      created_by: string;
      expires_at: Date | null;
      lifted_at: Date | null;
      lifted_by: string | null;
      lift_reason: string | null;
      created_at: Date;
    }>`
      update customers.customer_restrictions
      set status = 'LIFTED', lifted_at = now(), lifted_by = ${input.actorId},
          lift_reason = ${liftReason}, updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${input.restrictionId}
      returning *
    `.execute(tx);

    const updatedRow = updated.rows[0]!;

    // Check if any other ORDERING_BLOCKED restriction remains active
    const otherBlocked = await sql<{ count: string }>`
      select count(*)::text as count from customers.customer_restrictions
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and restriction_type = 'ORDERING_BLOCKED'
        and status = 'ACTIVE'
        and (expires_at is null or expires_at > now())
    `.execute(tx);

    if (Number(otherBlocked.rows[0]?.count ?? 0) === 0) {
      // Revert customer status to ACTIVE if it was BLOCKED
      await sql`
        update customers.customers
        set status = 'ACTIVE', updated_at = now(), version = version + 1
        where organization_id = ${input.organizationId} and id = ${input.customerId}
          and status = 'BLOCKED'
      `.execute(tx);
    }

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.customer.restriction_lifted',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: {
        restrictionId: updatedRow.id,
        restrictionType: updatedRow.restriction_type,
        liftReason,
      },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'customers.customer.restriction_lifted', 1, 'customers.customer', ${input.customerId}, 1,
        ${JSON.stringify({
          customerId: input.customerId,
          restrictionId: updatedRow.id,
          restrictionType: updatedRow.restriction_type,
        })}::jsonb, now()
      )
    `.execute(tx);

    return {
      id: updatedRow.id,
      customerId: updatedRow.customer_id,
      restrictionType: updatedRow.restriction_type,
      status: updatedRow.status as CustomerRestriction['status'],
      reason: updatedRow.reason,
      notes: updatedRow.notes,
      createdBy: updatedRow.created_by,
      createdAt: updatedRow.created_at.toISOString(),
      expiresAt: updatedRow.expires_at?.toISOString() ?? null,
      liftedAt: updatedRow.lifted_at?.toISOString() ?? null,
      liftedBy: updatedRow.lifted_by ?? null,
      liftReason: updatedRow.lift_reason ?? null,
    };
  });
}

export async function listCustomerRestrictions(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<readonly CustomerRestriction[]> {
  const result = await sql<{
    id: string;
    customer_id: string;
    restriction_type: CustomerRestrictionType;
    status: string;
    reason: string;
    notes: string | null;
    created_by: string;
    expires_at: Date | null;
    lifted_at: Date | null;
    lifted_by: string | null;
    lift_reason: string | null;
    created_at: Date;
  }>`
    select * from customers.customer_restrictions
    where organization_id = ${organizationId} and customer_id = ${customerId}
    order by created_at desc
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    restrictionType: row.restriction_type,
    status: row.status as CustomerRestriction['status'],
    reason: row.reason,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    liftedAt: row.lifted_at?.toISOString() ?? null,
    liftedBy: row.lifted_by ?? null,
    liftReason: row.lift_reason ?? null,
  }));
}

export async function getActiveCustomerRestrictions(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<readonly CustomerRestriction[]> {
  const result = await sql<{
    id: string;
    customer_id: string;
    restriction_type: CustomerRestrictionType;
    status: string;
    reason: string;
    notes: string | null;
    created_by: string;
    expires_at: Date | null;
    lifted_at: Date | null;
    lifted_by: string | null;
    lift_reason: string | null;
    created_at: Date;
  }>`
    select * from customers.customer_restrictions
    where organization_id = ${organizationId}
      and (
        customer_id = ${customerId}
        or customer_id in (
          select alias_customer_id from customers.customer_aliases
          where organization_id = ${organizationId} and canonical_customer_id = ${customerId}
        )
      )
      and status = 'ACTIVE'
      and (expires_at is null or expires_at > now())
    order by created_at desc
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    restrictionType: row.restriction_type,
    status: row.status as CustomerRestriction['status'],
    reason: row.reason,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    liftedAt: row.lifted_at?.toISOString() ?? null,
    liftedBy: row.lifted_by ?? null,
    liftReason: row.lift_reason ?? null,
  }));
}
