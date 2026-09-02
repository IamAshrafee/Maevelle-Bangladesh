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
  readonly createdAt: string;
  readonly primaryPhone?: string | null;
  readonly primaryEmail?: string | null;
  readonly orderCount?: number;
  readonly totalSpend?: string;
  readonly lastOrderAt?: string | null;
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
  created_at: Date;
  primary_phone?: string | null;
  primary_email?: string | null;
  order_count?: string;
  total_spend?: string;
  last_order_at?: string | null;
}): CustomerSummary {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    primaryPhone: row.primary_phone ?? null,
    primaryEmail: row.primary_email ?? null,
    orderCount: Number(row.order_count ?? 0),
    totalSpend: row.total_spend ?? '0',
    lastOrderAt: row.last_order_at ?? null,
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
      created_at: Date;
    }>`
      insert into customers.customers (organization_id, customer_number, display_name)
      values (
        ${input.organizationId},
        'CUS-' || upper(replace(uuidv7()::text, '-', '')),
        ${displayName}
      )
      returning id, customer_number, display_name, status, version::text, created_at
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

export interface CustomerListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  readonly q?: string;
}

export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export async function listCustomers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters?: CustomerListFilters,
): Promise<{ data: readonly CustomerSummary[]; pagination: PaginationMeta }> {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const searchTerm = filters?.q?.trim() ?? null;

  const result = await sql<{
    id: string;
    customer_number: string;
    display_name: string;
    status: CustomerSummary['status'];
    version: string;
    created_at: Date;
    primary_phone: string | null;
    primary_email: string | null;
    order_count: string;
    total_spend: string;
    last_order_at: Date | null;
    total_count: string;
  }>`
    select
      c.id, c.customer_number, c.display_name, c.status, c.version::text, c.created_at,
      (select raw_value from customers.customer_phones p where p.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_phone,
      (select raw_value from customers.customer_emails e where e.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_email,
      stats.order_count, stats.total_spend, stats.last_order_at,
      count(*) over ()::text as total_count
    from customers.customers c
    left join lateral (
      select
        count(*)::text as order_count,
        coalesce(sum(total_amount) filter (where order_status <> 'CANCELLED'), 0)::text as total_spend,
        max(created_at) as last_order_at
      from orders.orders o
      where o.organization_id = c.organization_id
        and (
          o.customer_id = c.id or
          o.customer_id in (select alias_customer_id from customers.customer_aliases where canonical_customer_id = c.id)
        )
    ) stats on true
    where c.organization_id = ${organizationId}
      and (${filters?.status ?? null}::text is null or c.status = ${filters?.status ?? null})
      and (
        ${searchTerm ?? null}::text is null
        or lower(c.display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or lower(c.customer_number) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or exists (select 1 from customers.customer_phones cp where cp.customer_id = c.id and cp.normalized_value = ${searchTerm ?? ''})
        or exists (select 1 from customers.customer_emails ce where ce.customer_id = c.id and lower(ce.raw_value) = lower(${searchTerm ?? ''}))
      )
    order by c.updated_at desc, c.id desc
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const totalItems = Number(result.rows[0]?.total_count ?? 0);

  return {
    data: result.rows.map((row) => ({
      id: row.id,
      customerNumber: row.customer_number,
      displayName: row.display_name,
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      primaryPhone: row.primary_phone,
      primaryEmail: row.primary_email,
      orderCount: Number(row.order_count ?? 0),
      totalSpend: row.total_spend ?? '0',
      lastOrderAt: row.last_order_at?.toISOString() ?? null,
    })),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize),
    },
  };
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

// ---------------------------------------------------------------------------
// Phase 3 Extensions
// ---------------------------------------------------------------------------

export interface CustomerDetailView extends CustomerSummary {
  readonly canonicalCustomerId?: string; // If merged, this indicates the new canonical ID
  readonly phones: readonly { id: string; phone: string; isPrimary: boolean; createdAt: string }[];
  readonly emails: readonly { id: string; email: string; isPrimary: boolean; createdAt: string }[];
  readonly addresses: readonly {
    id: string;
    label: string | null;
    recipientName: string;
    phone: string | null;
    addressLine1: string;
    addressLine2: string | null;
    geographyNodeId: string | null;
    area: string | null;
    city: string | null;
    district: string | null;
    postalCode: string | null;
    countryCode: string;
    isDefault: boolean;
  }[];
  readonly notes: readonly {
    id: string;
    authorActorId: string;
    body: string;
    createdAt: string;
  }[];
  readonly tags: readonly {
    id: string;
    label: string;
    color: string | null;
  }[];
}

/**
 * Returns complete customer details including aliases, notes, tags, addresses, and contacts.
 * If the customer is merged, returns the `canonicalCustomerId` so the caller can redirect.
 */
export async function getCustomerDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<CustomerDetailView> {
  const result = await sql<{
    id: string;
    customer_number: string;
    display_name: string;
    status: CustomerSummary['status'];
    version: string;
    created_at: Date;
  }>`
    select id, customer_number, display_name, status, version::text, created_at
    from customers.customers
    where organization_id = ${organizationId} and id = ${customerId}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');

  // If merged, look up the canonical ID.
  let canonicalCustomerId: string | undefined;
  if (row.status === 'MERGED') {
    const aliasRow = await sql<{ canonical_customer_id: string }>`
      select canonical_customer_id from customers.customer_aliases
      where alias_customer_id = ${customerId}
    `.execute(db);
    if (aliasRow.rows[0]) {
      canonicalCustomerId = aliasRow.rows[0].canonical_customer_id;
    }
  }

  const [phones, emails, addresses, notes, tags, stats] = await Promise.all([
    sql<{ id: string; raw_value: string; is_primary: boolean; created_at: Date }>`
      select id, raw_value, is_primary, created_at from customers.customer_phones
      where customer_id = ${customerId} order by is_primary desc, created_at
    `.execute(db),
    sql<{ id: string; raw_value: string; is_primary: boolean; created_at: Date }>`
      select id, raw_value, is_primary, created_at from customers.customer_emails
      where customer_id = ${customerId} order by is_primary desc, created_at
    `.execute(db),
    sql<{
      id: string;
      label: string | null;
      recipient_name: string;
      phone: string | null;
      address_line_1: string;
      address_line_2: string | null;
      geography_node_id: string | null;
      area: string | null;
      city: string | null;
      district: string | null;
      postal_code: string | null;
      country_code: string;
      is_default: boolean;
    }>`
      select id, label, recipient_name, phone, address_line_1, address_line_2,
             geography_node_id, area, city, district, postal_code, country_code, is_default
      from customers.customer_addresses
      where customer_id = ${customerId} and status = 'ACTIVE'
      order by is_default desc, created_at
    `.execute(db),
    sql<{ id: string; author_actor_id: string; body: string; created_at: Date }>`
      select id, author_actor_id, body, created_at from customers.customer_notes
      where customer_id = ${customerId} order by created_at desc
    `.execute(db),
    sql<{ id: string; label: string; color: string | null }>`
      select t.id, t.label, t.color
      from customers.customer_tag_assignments a
      join customers.customer_tags t on t.id = a.tag_id
      where a.customer_id = ${customerId}
      order by t.label
    `.execute(db),
    // Alias-aware stats
    sql<{ order_count: string; total_spend: string; last_order_at: Date | null }>`
      select
        count(*)::text as order_count,
        coalesce(sum(total_amount) filter (where order_status <> 'CANCELLED'), 0)::text as total_spend,
        max(created_at) as last_order_at
      from orders.orders
      where organization_id = ${organizationId}
        and (
          customer_id = ${customerId} or
          customer_id in (select alias_customer_id from customers.customer_aliases where canonical_customer_id = ${customerId})
        )
    `.execute(db),
  ]);

  return {
    id: row.id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    ...(canonicalCustomerId ? { canonicalCustomerId } : {}),
    primaryPhone: phones.rows.find((p) => p.is_primary)?.raw_value ?? phones.rows[0]?.raw_value ?? null,
    primaryEmail: emails.rows.find((e) => e.is_primary)?.raw_value ?? emails.rows[0]?.raw_value ?? null,
    orderCount: Number(stats.rows[0]?.order_count ?? 0),
    totalSpend: stats.rows[0]?.total_spend ?? '0',
    lastOrderAt: stats.rows[0]?.last_order_at?.toISOString() ?? null,
    phones: phones.rows.map((p) => ({
      id: p.id,
      phone: p.raw_value,
      isPrimary: p.is_primary,
      createdAt: p.created_at.toISOString(),
    })),
    emails: emails.rows.map((e) => ({
      id: e.id,
      email: e.raw_value,
      isPrimary: e.is_primary,
      createdAt: e.created_at.toISOString(),
    })),
    addresses: addresses.rows.map((a) => ({
      id: a.id,
      label: a.label,
      recipientName: a.recipient_name,
      phone: a.phone,
      addressLine1: a.address_line_1,
      addressLine2: a.address_line_2,
      geographyNodeId: a.geography_node_id,
      area: a.area,
      city: a.city,
      district: a.district,
      postalCode: a.postal_code,
      countryCode: a.country_code,
      isDefault: a.is_default,
    })),
    notes: notes.rows.map((n) => ({
      id: n.id,
      authorActorId: n.author_actor_id,
      body: n.body,
      createdAt: n.created_at.toISOString(),
    })),
    tags: tags.rows.map((t) => ({
      id: t.id,
      label: t.label,
      color: t.color,
    })),
  };
}

export async function updateCustomer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    expectedVersion: number;
    displayName?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'; // MERGED/ANONYMIZED handled by specific workflows
  },
): Promise<{ version: number }> {
  return db.transaction().execute(async (transaction) => {
    const row = await sql<{ status: string; version: string }>`
      select status, version::text from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    if (!row.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (Number(row.rows[0].version) !== input.expectedVersion)
      throw new CustomerDomainError('STALE_VERSION', 'Customer has changed; reload before updating.');

    if (row.rows[0].status === 'MERGED' || row.rows[0].status === 'ANONYMIZED')
      throw new CustomerDomainError('VALIDATION_FAILED', `Cannot update customer in ${row.rows[0].status} status.`);

    const updates = [];
    if (input.displayName && input.displayName.trim() !== '') {
      updates.push(sql`display_name = ${input.displayName.trim()}`);
    }
    if (input.status) {
      updates.push(sql`status = ${input.status}`);
    }

    if (updates.length > 0) {
      const updateSql = sql<{ version: string }>`
        update customers.customers
        set ${sql.join(updates, sql`, `)}, version = version + 1, updated_at = now()
        where id = ${input.customerId} returning version::text
      `;
      const result = await updateSql.execute(transaction);
      await emitCustomerEvent(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        customerId: input.customerId,
        action: 'customers.customer.updated',
      });
      return { version: Number(result.rows[0]!.version) };
    }

    return { version: input.expectedVersion };
  });
}

export async function removeCustomerPhone(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; phoneId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const row = await sql<{ is_primary: boolean }>`
      select is_primary from customers.customer_phones
      where id = ${input.phoneId} and customer_id = ${input.customerId}
    `.execute(transaction);
    if (!row.rows[0]) return;
    if (row.rows[0].is_primary) {
      // Check if it's the last phone
      const count = await sql<{ count: string }>`select count(*)::text as count from customers.customer_phones where customer_id = ${input.customerId}`.execute(transaction);
      if (Number(count.rows[0]?.count) > 1) {
        throw new CustomerDomainError('VALIDATION_FAILED', 'Cannot remove the primary phone while other phones exist. Make another phone primary first.');
      }
    }
    await sql`delete from customers.customer_phones where id = ${input.phoneId}`.execute(transaction);
    await sql`update customers.customers set version = version + 1, updated_at = now() where id = ${input.customerId}`.execute(transaction);
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function removeCustomerEmail(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; emailId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const row = await sql<{ is_primary: boolean }>`
      select is_primary from customers.customer_emails
      where id = ${input.emailId} and customer_id = ${input.customerId}
    `.execute(transaction);
    if (!row.rows[0]) return;
    if (row.rows[0].is_primary) {
      const count = await sql<{ count: string }>`select count(*)::text as count from customers.customer_emails where customer_id = ${input.customerId}`.execute(transaction);
      if (Number(count.rows[0]?.count) > 1) {
        throw new CustomerDomainError('VALIDATION_FAILED', 'Cannot remove the primary email while other emails exist. Make another email primary first.');
      }
    }
    await sql`delete from customers.customer_emails where id = ${input.emailId}`.execute(transaction);
    await sql`update customers.customers set version = version + 1, updated_at = now() where id = ${input.customerId}`.execute(transaction);
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function removeCustomerAddress(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; addressId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    // Soft delete address to maintain history if needed, or hard delete if no fk constraints.
    // Address is independent of order addresses, so hard delete is fine.
    await sql`delete from customers.customer_addresses where id = ${input.addressId} and customer_id = ${input.customerId}`.execute(transaction);
    await sql`update customers.customers set version = version + 1, updated_at = now() where id = ${input.customerId}`.execute(transaction);
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function addCustomerNote(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; body: string },
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new CustomerDomainError('VALIDATION_FAILED', 'Note body cannot be empty.');
  const created = await sql<{ id: string }>`
    insert into customers.customer_notes (organization_id, customer_id, author_actor_id, body)
    values (${input.organizationId}, ${input.customerId}, ${input.actorId}, ${body})
    returning id
  `.execute(db);
  const id = created.rows[0]?.id;
  if (!id) throw new Error('Customer note creation did not return an id.');
  await emitCustomerEvent(db, { ...input, action: 'customers.customer.note_added' });
  return { id };
}

// ---------------------------------------------------------------------------
// Customer Timeline Queries (Orders, Returns, Refunds)
// ---------------------------------------------------------------------------

export async function listCustomerOrders(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<readonly {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  currencyCode: string;
  createdAt: string;
}[]> {
  const result = await sql<{ id: string; order_number: string; order_status: string; total_amount: string; currency_code: string; created_at: Date }>`
    select id, order_number, order_status, total_amount::text, currency_code, created_at
    from orders.orders
    where organization_id = ${organizationId}
      and (
        customer_id = ${customerId} or
        customer_id in (select alias_customer_id from customers.customer_aliases where canonical_customer_id = ${customerId})
      )
    order by created_at desc
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.order_status,
    totalAmount: row.total_amount,
    currencyCode: row.currency_code,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listCustomerReturns(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<readonly {
  id: string;
  caseNumber: string;
  status: string;
  returnType: string;
  orderNumber: string;
  createdAt: string;
}[]> {
  const result = await sql<{ id: string; case_number: string; status: string; return_type: string; order_number: string; created_at: Date }>`
    select r.id, r.case_number, r.status, r.return_type, o.order_number, r.created_at
    from returns.return_cases r
    join orders.orders o on o.id = r.order_id
    where o.organization_id = ${organizationId}
      and (
        o.customer_id = ${customerId} or
        o.customer_id in (select alias_customer_id from customers.customer_aliases where canonical_customer_id = ${customerId})
      )
    order by r.created_at desc
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    caseNumber: row.case_number,
    status: row.status,
    returnType: row.return_type,
    orderNumber: row.order_number,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listCustomerRefunds(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
): Promise<readonly {
  id: string;
  amount: string;
  status: string;
  orderNumber: string;
  createdAt: string;
}[]> {
  const result = await sql<{ id: string; amount: string; status: string; order_number: string; created_at: Date }>`
    select r.id, r.amount::text, r.status, o.order_number, r.created_at
    from payments.refunds r
    join payments.payments p on p.id = r.payment_id
    join payments.payment_intents pi on pi.id = p.payment_intent_id
    join orders.orders o on o.id = pi.order_id
    where o.organization_id = ${organizationId}
      and (
        o.customer_id = ${customerId} or
        o.customer_id in (select alias_customer_id from customers.customer_aliases where canonical_customer_id = ${customerId})
      )
    order by r.created_at desc
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    orderNumber: row.order_number,
    createdAt: row.created_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function listOrgTags(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly { id: string; label: string; color: string | null }[]> {
  const result = await sql<{ id: string; label: string; color: string | null }>`
    select id, label, color from customers.customer_tags
    where organization_id = ${organizationId}
    order by label
  `.execute(db);
  return result.rows;
}

export async function createTag(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; label: string; color?: string | null },
): Promise<{ id: string }> {
  const label = input.label.trim();
  if (!label) throw new CustomerDomainError('VALIDATION_FAILED', 'Tag label cannot be empty.');
  const result = await sql<{ id: string }>`
    insert into customers.customer_tags (organization_id, label, color)
    values (${input.organizationId}, ${label}, ${input.color ?? null})
    on conflict (organization_id, lower(label)) do update set color = excluded.color
    returning id
  `.execute(db);
  return { id: result.rows[0]!.id };
}

export async function assignTagToCustomer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; tagId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await sql`
      insert into customers.customer_tag_assignments (organization_id, customer_id, tag_id)
      values (${input.organizationId}, ${input.customerId}, ${input.tagId})
      on conflict do nothing
    `.execute(transaction);
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function removeTagFromCustomer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; tagId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await sql`
      delete from customers.customer_tag_assignments
      where customer_id = ${input.customerId} and tag_id = ${input.tagId}
    `.execute(transaction);
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}
