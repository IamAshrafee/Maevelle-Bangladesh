import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export class CustomerDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
    this.name = 'CustomerDomainError';
  }
}

export interface CustomerSummary {
  readonly id: string;
  readonly customerNumber: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'MERGED' | 'ANONYMIZED';
  readonly version: number;
}

function normalizePhone(value: string): string {
  const normalized = value.trim().replace(/[\s()-]+/g, '');
  if (!/^\+?[0-9]{7,20}$/.test(normalized)) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'Phone number is not valid.');
  }
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'Email address is not valid.');
  }
  return normalized;
}

function toCustomer(row: {
  id: string;
  customer_number: string;
  display_name: string;
  status: CustomerSummary['status'];
  version: string;
}): CustomerSummary {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    status: row.status,
    version: Number(row.version),
  };
}

async function emitCustomerEvent(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; action: string },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'customers.customer',
    targetId: input.customerId,
  });
  await sql`
    insert into platform.outbox_events (
      organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
    ) values (
      ${input.organizationId}, ${input.action}, 1, 'customers.customer', ${input.customerId}, 1,
      ${JSON.stringify({ customerId: input.customerId })}::jsonb, now()
    )
  `.execute(db);
}

export async function createCustomer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; displayName: string },
): Promise<CustomerSummary> {
  const displayName = input.displayName.trim();
  if (!displayName)
    throw new CustomerDomainError('VALIDATION_FAILED', 'Customer name is required.');
  return db.transaction().execute(async (transaction) => {
    const created = await sql<{
      id: string;
      customer_number: string;
      display_name: string;
      status: CustomerSummary['status'];
      version: string;
    }>`
      insert into customers.customers (organization_id, customer_number, display_name)
      values (
        ${input.organizationId},
        'CUS-' || upper(replace(uuidv7()::text, '-', '')),
        ${displayName}
      ) returning id, customer_number, display_name, status, version::text
    `.execute(transaction);
    const customer = created.rows[0];
    if (!customer) throw new Error('Customer creation did not return a customer.');
    await emitCustomerEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: customer.id,
      action: 'customers.customer.created',
    });
    return toCustomer(customer);
  });
}

export async function listCustomers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  search?: string,
): Promise<readonly CustomerSummary[]> {
  const result = await sql<{
    id: string;
    customer_number: string;
    display_name: string;
    status: CustomerSummary['status'];
    version: string;
  }>`
    select id, customer_number, display_name, status, version::text
    from customers.customers
    where organization_id = ${organizationId}
      and (${search?.trim() || null}::text is null or lower(display_name) like ${`%${search?.trim().toLocaleLowerCase() ?? ''}%`})
    order by updated_at desc, id desc
    limit 100
  `.execute(db);
  return result.rows.map(toCustomer);
}

export async function addCustomerPhone(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    phone: string;
    isPrimary?: boolean;
  },
): Promise<{ id: string; normalizedValue: string }> {
  const normalized = normalizePhone(input.phone);
  return db.transaction().execute(async (transaction) => {
    const exists = await sql<{ id: string }>`
      select id from customers.customers where id = ${input.customerId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!exists.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (input.isPrimary) {
      await sql`update customers.customer_phones set is_primary = false, version = version + 1, updated_at = now() where customer_id = ${input.customerId}`.execute(
        transaction,
      );
    }
    const created = await sql<{ id: string }>`
      insert into customers.customer_phones (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${input.organizationId}, ${input.customerId}, ${input.phone.trim()}, ${normalized}, ${input.isPrimary ?? false}) returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer phone creation did not return an id.');
    await emitCustomerEvent(transaction, {
      ...input,
      customerId: input.customerId,
      action: 'customers.customer.phone_added',
    });
    return { id, normalizedValue: normalized };
  });
}

export async function addCustomerEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    email: string;
    isPrimary?: boolean;
  },
): Promise<{ id: string; normalizedValue: string }> {
  const normalized = normalizeEmail(input.email);
  return db.transaction().execute(async (transaction) => {
    const exists = await sql<{ id: string }>`
      select id from customers.customers where id = ${input.customerId} and organization_id = ${input.organizationId}
    `.execute(transaction);
    if (!exists.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (input.isPrimary) {
      await sql`update customers.customer_emails set is_primary = false, version = version + 1, updated_at = now() where customer_id = ${input.customerId}`.execute(
        transaction,
      );
    }
    const created = await sql<{ id: string }>`
      insert into customers.customer_emails (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${input.organizationId}, ${input.customerId}, ${input.email.trim()}, ${normalized}, ${input.isPrimary ?? false}) returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer email creation did not return an id.');
    await emitCustomerEvent(transaction, {
      ...input,
      customerId: input.customerId,
      action: 'customers.customer.email_added',
    });
    return { id, normalizedValue: normalized };
  });
}

export async function addCustomerAddress(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    recipientName: string;
    addressLine1: string;
    countryCode: string;
    label?: string;
    phone?: string;
    addressLine2?: string;
    geographyNodeId?: string;
    area?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    isDefault?: boolean;
  },
): Promise<{ id: string }> {
  if (
    !input.recipientName.trim() ||
    !input.addressLine1.trim() ||
    !/^[A-Z]{2}$/.test(input.countryCode)
  ) {
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'Recipient, address line, and ISO country code are required.',
    );
  }
  return db.transaction().execute(async (transaction) => {
    const customer = await sql<{
      id: string;
    }>`select id from customers.customers where id = ${input.customerId} and organization_id = ${input.organizationId}`.execute(
      transaction,
    );
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (input.geographyNodeId) {
      const geography = await sql<{
        id: string;
      }>`select id from geography.nodes where id = ${input.geographyNodeId} and status = 'ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new CustomerDomainError('NOT_FOUND', 'Geography node was not found.');
    }
    if (input.isDefault) {
      await sql`update customers.customer_addresses set is_default = false, version = version + 1, updated_at = now() where customer_id = ${input.customerId} and status = 'ACTIVE'`.execute(
        transaction,
      );
    }
    const created = await sql<{ id: string }>`
      insert into customers.customer_addresses (
        organization_id, customer_id, label, recipient_name, phone, address_line_1, address_line_2,
        geography_node_id, area, city, district, postal_code, country_code, is_default
      ) values (
        ${input.organizationId}, ${input.customerId}, ${input.label?.trim() ?? null}, ${input.recipientName.trim()},
        ${input.phone?.trim() ?? null}, ${input.addressLine1.trim()}, ${input.addressLine2?.trim() ?? null},
        ${input.geographyNodeId ?? null}, ${input.area?.trim() ?? null}, ${input.city?.trim() ?? null},
        ${input.district?.trim() ?? null}, ${input.postalCode?.trim() ?? null}, ${input.countryCode}, ${input.isDefault ?? false}
      ) returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer address creation did not return an id.');
    await emitCustomerEvent(transaction, {
      ...input,
      customerId: input.customerId,
      action: 'customers.customer.address_added',
    });
    return { id };
  });
}

/** Duplicate signals aid staff review only; matching never automatically merges customers. */
export async function findCustomerDuplicateCandidates(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; customerId: string },
): Promise<readonly { customerId: string; confidence: string; signals: readonly string[] }[]> {
  const result = await sql<{ customer_id: string; confidence: string; signals: string[] }>`
    with phone_matches as (
      select other.customer_id, 'PHONE'::text as signal
      from customers.customer_phones current
      join customers.customer_phones other on other.normalized_value = current.normalized_value
        and other.organization_id = current.organization_id and other.customer_id <> current.customer_id
      where current.organization_id = ${input.organizationId} and current.customer_id = ${input.customerId}
    ), email_matches as (
      select other.customer_id, 'EMAIL'::text as signal
      from customers.customer_emails current
      join customers.customer_emails other on other.normalized_value = current.normalized_value
        and other.organization_id = current.organization_id and other.customer_id <> current.customer_id
      where current.organization_id = ${input.organizationId} and current.customer_id = ${input.customerId}
    )
    select customer_id, (count(*)::numeric / 2)::text as confidence, array_agg(signal order by signal) as signals
    from (select * from phone_matches union all select * from email_matches) matches
    group by customer_id order by confidence desc, customer_id
  `.execute(db);
  return result.rows.map((row) => ({
    customerId: row.customer_id,
    confidence: row.confidence,
    signals: row.signals,
  }));
}
