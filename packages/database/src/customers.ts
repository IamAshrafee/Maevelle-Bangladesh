import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  CustomerIdentityValidationError,
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from './customer-identities.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export type CustomerSource =
  | 'STOREFRONT'
  | 'MANUAL_ORDER'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'PHONE'
  | 'IMPORT'
  | 'ADMIN_CREATED'
  | 'EXTERNAL_API';

export class CustomerDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'STALE_VERSION'
      | 'CUSTOMER_BLOCKED'
      | 'IDEMPOTENCY_CONFLICT',
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
  readonly firstSource: CustomerSource;
  readonly latestSource: CustomerSource;
  readonly primaryPhone?: string | null;
  readonly primaryEmail?: string | null;
  readonly orderCount?: number;
  readonly totalSpend?: string;
  readonly lastOrderAt?: string | null;
}

function identityInput<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CustomerIdentityValidationError)
      throw new CustomerDomainError('VALIDATION_FAILED', error.message);
    throw error;
  }
}

function toCustomer(row: {
  id: string;
  customer_number: string;
  display_name: string;
  status: CustomerSummary['status'];
  first_source: CustomerSource;
  latest_source: CustomerSource;
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
    firstSource: row.first_source,
    latestSource: row.latest_source,
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
  input: {
    organizationId: string;
    actorId: string;
    actorType?: 'USER' | 'GUEST_CHECKOUT' | 'SYSTEM';
    customerId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: input.actorType ?? 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'customers.customer',
    targetId: input.customerId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
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
  input: {
    organizationId: string;
    actorId: string;
    displayName: string;
    phone?: string;
    email?: string;
    source?: CustomerSource;
    actorType?: 'USER' | 'GUEST_CHECKOUT' | 'SYSTEM';
  },
): Promise<CustomerSummary> {
  const displayName = input.displayName.trim();
  if (!displayName)
    throw new CustomerDomainError('VALIDATION_FAILED', 'Customer name is required.');
  const normalizedPhone = input.phone
    ? identityInput(() => normalizeCustomerPhone(input.phone!))
    : undefined;
  const normalizedEmail = input.email
    ? identityInput(() => normalizeCustomerEmail(input.email!))
    : undefined;
  const source = input.source ?? 'ADMIN_CREATED';
  return db.transaction().execute(async (transaction) => {
    const created = await sql<{
      id: string;
      customer_number: string;
      display_name: string;
      status: CustomerSummary['status'];
      first_source: CustomerSource;
      latest_source: CustomerSource;
      version: string;
      created_at: Date;
    }>`
      insert into customers.customers (organization_id, customer_number, display_name, first_source, latest_source)
      values (
        ${input.organizationId},
        'CUS-' || upper(replace(uuidv7()::text, '-', '')),
        ${displayName}, ${source}, ${source}
      )
      returning id, customer_number, display_name, status, first_source, latest_source, version::text, created_at
    `.execute(transaction);
    const customer = created.rows[0];
    if (!customer) throw new Error('Customer creation did not return a customer.');
    if (normalizedPhone) {
      await sql`
        insert into customers.customer_phones
          (organization_id, customer_id, raw_value, normalized_value, country_code, is_primary)
        values (${input.organizationId}, ${customer.id}, ${input.phone!.trim()}, ${normalizedPhone},
          ${normalizedPhone.startsWith('+880') ? 'BD' : null}, true)
      `.execute(transaction);
    }
    if (normalizedEmail) {
      await sql`
        insert into customers.customer_emails
          (organization_id, customer_id, raw_value, normalized_value, is_primary)
        values (${input.organizationId}, ${customer.id}, ${input.email!.trim()}, ${normalizedEmail}, true)
      `.execute(transaction);
    }
    await emitCustomerEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      ...(input.actorType ? { actorType: input.actorType } : {}),
      customerId: customer.id,
      action: 'customers.customer.created',
      metadata: { source },
    });
    return {
      ...toCustomer(customer),
      primaryPhone: input.phone?.trim() ?? null,
      primaryEmail: input.email?.trim() ?? null,
    };
  });
}

/**
 * Conservative order-time identity resolution. A shared phone/email is a signal,
 * not a universal unique key: auto-link only one unblocked record when its name
 * is compatible or both phone and email agree. Ambiguous matches remain separate
 * and are queued as duplicate candidates for operator review.
 */
export async function resolveOrCreateOrderCustomerInTransaction(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    actorType: 'USER' | 'GUEST_CHECKOUT';
    displayName: string;
    phone: string;
    email?: string;
    source: CustomerSource;
  },
): Promise<{ customerId: string; created: boolean }> {
  const normalizedPhone = identityInput(() => normalizeCustomerPhone(input.phone));
  const normalizedEmail = input.email
    ? identityInput(() => normalizeCustomerEmail(input.email!))
    : undefined;
  const normalizedName = normalizeCustomerName(input.displayName);

  // A row lock cannot protect an identity that does not exist yet. Serialize
  // first-time resolution for the same tenant + phone so concurrent checkouts
  // cannot both observe an empty candidate set and create duplicate customers.
  await sql`
    select pg_advisory_xact_lock(
      hashtextextended(${`${input.organizationId}:${normalizedPhone}`}, 0)
    )
  `.execute(db);

  const candidates = await sql<{
    id: string;
    display_name: string;
    status: CustomerSummary['status'];
    phone_match: boolean;
    email_match: boolean;
  }>`
    select customer.id, customer.display_name, customer.status,
      exists (
        select 1 from customers.customer_phones phone
        where phone.organization_id = customer.organization_id
          and phone.customer_id = customer.id
          and phone.normalized_value = ${normalizedPhone}
      ) as phone_match,
      exists (
        select 1 from customers.customer_emails email
        where email.organization_id = customer.organization_id
          and email.customer_id = customer.id
          and email.normalized_value = ${normalizedEmail ?? null}
      ) as email_match
    from customers.customers customer
    where customer.organization_id = ${input.organizationId}
      and customer.status not in ('MERGED', 'ANONYMIZED')
      and (
        exists (
          select 1 from customers.customer_phones phone
          where phone.organization_id = customer.organization_id
            and phone.customer_id = customer.id
            and phone.normalized_value = ${normalizedPhone}
        )
        or (${normalizedEmail ?? null}::text is not null and exists (
          select 1 from customers.customer_emails email
          where email.organization_id = customer.organization_id
            and email.customer_id = customer.id
            and email.normalized_value = ${normalizedEmail ?? null}
        ))
      )
    order by customer.created_at, customer.id
    for update of customer
  `.execute(db);

  const strongMatches = candidates.rows.filter(
    (candidate) =>
      (candidate.phone_match && normalizeCustomerName(candidate.display_name) === normalizedName) ||
      (candidate.phone_match && candidate.email_match),
  );
  if (strongMatches.length === 1) {
    const matched = strongMatches[0]!;
    if (matched.status === 'BLOCKED')
      throw new CustomerDomainError(
        'CUSTOMER_BLOCKED',
        'This customer cannot place new orders. Contact support for assistance.',
      );
    await sql`
      update customers.customers
      set latest_source = ${input.source}, updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${matched.id}
    `.execute(db);
    return { customerId: matched.id, created: false };
  }

  const createdResult = await sql<{ id: string }>`
    insert into customers.customers
      (organization_id, customer_number, display_name, first_source, latest_source)
    values (${input.organizationId}, 'CUS-' || upper(replace(uuidv7()::text, '-', '')),
      ${input.displayName.trim()}, ${input.source}, ${input.source})
    returning id
  `.execute(db);
  const createdId = createdResult.rows[0]?.id;
  if (!createdId) throw new Error('Customer creation did not return a customer.');
  await sql`
    insert into customers.customer_phones
      (organization_id, customer_id, raw_value, normalized_value, country_code, is_primary)
    values (${input.organizationId}, ${createdId}, ${input.phone.trim()}, ${normalizedPhone},
      ${normalizedPhone.startsWith('+880') ? 'BD' : null}, true)
  `.execute(db);
  if (normalizedEmail) {
    await sql`
      insert into customers.customer_emails
        (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${input.organizationId}, ${createdId}, ${input.email!.trim()}, ${normalizedEmail}, true)
    `.execute(db);
  }
  await emitCustomerEvent(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorType: input.actorType,
    customerId: createdId,
    action: 'customers.customer.created',
    metadata: { source: input.source, identityResolution: 'NEW_OR_AMBIGUOUS' },
  });
  for (const candidate of candidates.rows) {
    const ids = [createdId, candidate.id].toSorted();
    const signals = [
      ...(candidate.phone_match ? ['PHONE'] : []),
      ...(candidate.email_match ? ['EMAIL'] : []),
      ...(normalizeCustomerName(candidate.display_name) === normalizedName ? ['NAME'] : []),
    ];
    const confidence = Math.min(1, signals.length * 0.34).toFixed(4);
    await sql`
      insert into customers.customer_duplicate_candidates
        (organization_id, customer_a_id, customer_b_id, confidence, signals)
      values (${input.organizationId}, ${ids[0]}, ${ids[1]}, ${confidence}::numeric,
        ${JSON.stringify(signals)}::jsonb)
      on conflict (organization_id, customer_a_id, customer_b_id)
      do update set confidence = greatest(customers.customer_duplicate_candidates.confidence, excluded.confidence),
        signals = excluded.signals, status = 'OPEN', resolved_at = null
    `.execute(db);
  }
  return { customerId: createdId, created: true };
}

export async function resolveOrCreateOrderCustomer(
  db: Kysely<DatabaseSchema>,
  input: Parameters<typeof resolveOrCreateOrderCustomerInTransaction>[1],
): Promise<{ customerId: string; created: boolean }> {
  return db
    .transaction()
    .execute((transaction) => resolveOrCreateOrderCustomerInTransaction(transaction, input));
}

export interface CustomerListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  readonly source?: CustomerSource;
  readonly from?: string;
  readonly to?: string;
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
  let normalizedSearchPhone: string | null = null;
  if (searchTerm) {
    try {
      normalizedSearchPhone = normalizeCustomerPhone(searchTerm);
    } catch {
      normalizedSearchPhone = null;
    }
  }

  const result = await sql<{
    id: string;
    customer_number: string;
    display_name: string;
    status: CustomerSummary['status'];
    first_source: CustomerSource;
    latest_source: CustomerSource;
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
      c.id, c.customer_number, c.display_name, c.status, c.first_source, c.latest_source,
      c.version::text, c.created_at,
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
          o.customer_id in (select alias_customer_id from customers.customer_aliases where organization_id = c.organization_id and canonical_customer_id = c.id)
        )
    ) stats on true
    where c.organization_id = ${organizationId}
      and (${filters?.status ?? null}::text is null or c.status = ${filters?.status ?? null})
      and (${filters?.source ?? null}::text is null or c.first_source = ${filters?.source ?? null})
      and (${filters?.from ?? null}::text is null or c.created_at >= (${filters?.from ?? null})::timestamptz)
      and (${filters?.to ?? null}::text is null or c.created_at <= (${filters?.to ?? null})::timestamptz)
      and (
        ${searchTerm ?? null}::text is null
        or lower(c.display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or lower(c.customer_number) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or exists (select 1 from customers.customer_phones cp where cp.organization_id = c.organization_id and cp.customer_id = c.id and cp.normalized_value = ${normalizedSearchPhone ?? ''})
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
      firstSource: row.first_source,
      latestSource: row.latest_source,
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
  const normalized = identityInput(() => normalizeCustomerPhone(input.phone));
  return db.transaction().execute(async (transaction) => {
    const exists = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!exists.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    const duplicate = await sql<{ id: string }>`
      select id from customers.customer_phones
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and normalized_value = ${normalized}
    `.execute(transaction);
    if (duplicate.rows[0])
      throw new CustomerDomainError(
        'CONFLICT',
        'This phone number already belongs to the customer.',
      );
    const contactCount = await sql<{ count: string }>`
      select count(*)::text as count from customers.customer_phones
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
    `.execute(transaction);
    const isPrimary = input.isPrimary ?? Number(contactCount.rows[0]?.count ?? 0) === 0;
    if (isPrimary) {
      await sql`update customers.customer_phones set is_primary = false, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
        transaction,
      );
    }
    const created = await sql<{ id: string }>`
      insert into customers.customer_phones (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${input.organizationId}, ${input.customerId}, ${input.phone.trim()}, ${normalized}, ${isPrimary}) returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer phone creation did not return an id.');
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
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
  const normalized = identityInput(() => normalizeCustomerEmail(input.email));
  return db.transaction().execute(async (transaction) => {
    const exists = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!exists.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    const duplicate = await sql<{ id: string }>`
      select id from customers.customer_emails
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and normalized_value = ${normalized}
    `.execute(transaction);
    if (duplicate.rows[0])
      throw new CustomerDomainError(
        'CONFLICT',
        'This email address already belongs to the customer.',
      );
    const contactCount = await sql<{ count: string }>`
      select count(*)::text as count from customers.customer_emails
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
    `.execute(transaction);
    const isPrimary = input.isPrimary ?? Number(contactCount.rows[0]?.count ?? 0) === 0;
    if (isPrimary) {
      await sql`update customers.customer_emails set is_primary = false, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
        transaction,
      );
    }
    const created = await sql<{ id: string }>`
      insert into customers.customer_emails (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${input.organizationId}, ${input.customerId}, ${input.email.trim()}, ${normalized}, ${isPrimary}) returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer email creation did not return an id.');
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
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
    }>`select id from customers.customers where id = ${input.customerId} and organization_id = ${input.organizationId} and status not in ('MERGED', 'ANONYMIZED') for update`.execute(
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
      await sql`update customers.customer_addresses set is_default = false, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and customer_id = ${input.customerId} and status = 'ACTIVE'`.execute(
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
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
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
  readonly phones: readonly {
    id: string;
    phone: string;
    normalizedPhone: string;
    isPrimary: boolean;
    verificationStatus: string;
    createdAt: string;
  }[];
  readonly emails: readonly {
    id: string;
    email: string;
    normalizedEmail: string;
    isPrimary: boolean;
    verificationStatus: string;
    createdAt: string;
  }[];
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
    status: string;
    version: number;
    createdAt: string;
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
  readonly commerceMetrics: {
    readonly totalOrders: number;
    readonly activeOrders: number;
    readonly cancelledOrders: number;
    readonly lifetimeOrderValue: string;
    readonly collectedAmount: string;
    readonly refundedAmount: string;
    readonly lastOrderAt: string | null;
  };
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
    first_source: CustomerSource;
    latest_source: CustomerSource;
    version: string;
    created_at: Date;
  }>`
    select id, customer_number, display_name, status, first_source, latest_source, version::text, created_at
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
      where organization_id = ${organizationId} and alias_customer_id = ${customerId}
    `.execute(db);
    if (aliasRow.rows[0]) {
      canonicalCustomerId = aliasRow.rows[0].canonical_customer_id;
    }
  }

  const [phones, emails, addresses, notes, tags, stats] = await Promise.all([
    sql<{
      id: string;
      raw_value: string;
      normalized_value: string;
      is_primary: boolean;
      verification_status: string;
      created_at: Date;
    }>`
      select id, raw_value, normalized_value, is_primary, verification_status, created_at from customers.customer_phones
      where organization_id = ${organizationId} and customer_id = ${customerId} order by is_primary desc, created_at
    `.execute(db),
    sql<{
      id: string;
      raw_value: string;
      normalized_value: string;
      is_primary: boolean;
      verification_status: string;
      created_at: Date;
    }>`
      select id, raw_value, normalized_value, is_primary, verification_status, created_at from customers.customer_emails
      where organization_id = ${organizationId} and customer_id = ${customerId} order by is_primary desc, created_at
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
      status: string;
      version: string;
      created_at: Date;
    }>`
      select id, label, recipient_name, phone, address_line_1, address_line_2,
             geography_node_id, area, city, district, postal_code, country_code, is_default,
             status, version::text, created_at
      from customers.customer_addresses
      where organization_id = ${organizationId} and customer_id = ${customerId} and status = 'ACTIVE'
      order by is_default desc, created_at
    `.execute(db),
    sql<{ id: string; author_actor_id: string; body: string; created_at: Date }>`
      select id, author_actor_id, body, created_at from customers.customer_notes
      where organization_id = ${organizationId} and customer_id = ${customerId} order by created_at desc
    `.execute(db),
    sql<{ id: string; label: string; color: string | null }>`
      select t.id, t.label, t.color
      from customers.customer_tag_assignments a
      join customers.customer_tags t on t.id = a.tag_id
      where a.organization_id = ${organizationId} and a.customer_id = ${customerId}
      order by t.label
    `.execute(db),
    // Alias-aware stats
    sql<{
      order_count: string;
      active_order_count: string;
      cancelled_order_count: string;
      total_spend: string;
      collected_amount: string;
      refunded_amount: string;
      last_order_at: Date | null;
    }>`
      with customer_orders as materialized (
        select order_row.id, order_row.order_status, order_row.total_amount, order_row.created_at
        from orders.orders order_row
        where order_row.organization_id = ${organizationId}
          and (
            order_row.customer_id = ${customerId}
            or order_row.customer_id in (
              select alias_customer_id from customers.customer_aliases
              where organization_id = ${organizationId} and canonical_customer_id = ${customerId}
            )
          )
      ), order_metrics as (
        select count(*)::text as order_count,
          count(*) filter (where order_status <> 'CANCELLED')::text as active_order_count,
          count(*) filter (where order_status = 'CANCELLED')::text as cancelled_order_count,
          coalesce(sum(total_amount) filter (where order_status <> 'CANCELLED'), 0)::text as total_spend,
          max(created_at) as last_order_at
        from customer_orders
      ), payment_metrics as (
        select coalesce(sum(allocation.amount), 0)::text as collected_amount
        from payments.payment_allocations allocation
        join payments.payments payment
          on payment.organization_id = allocation.organization_id and payment.id = allocation.payment_id
        where allocation.organization_id = ${organizationId}
          and payment.status = 'CONFIRMED'
          and allocation.order_id in (select id from customer_orders)
      ), refund_metrics as (
        select coalesce(sum(refund.amount), 0)::text as refunded_amount
        from payments.refunds refund
        where refund.organization_id = ${organizationId}
          and refund.status = 'COMPLETED'
          and refund.order_id in (select id from customer_orders)
      )
      select order_metrics.*, payment_metrics.collected_amount, refund_metrics.refunded_amount
      from order_metrics cross join payment_metrics cross join refund_metrics
    `.execute(db),
  ]);

  return {
    id: row.id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    status: row.status,
    firstSource: row.first_source,
    latestSource: row.latest_source,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    ...(canonicalCustomerId ? { canonicalCustomerId } : {}),
    primaryPhone:
      phones.rows.find((p) => p.is_primary)?.raw_value ?? phones.rows[0]?.raw_value ?? null,
    primaryEmail:
      emails.rows.find((e) => e.is_primary)?.raw_value ?? emails.rows[0]?.raw_value ?? null,
    orderCount: Number(stats.rows[0]?.order_count ?? 0),
    totalSpend: stats.rows[0]?.total_spend ?? '0',
    lastOrderAt: stats.rows[0]?.last_order_at?.toISOString() ?? null,
    phones: phones.rows.map((p) => ({
      id: p.id,
      phone: p.raw_value,
      normalizedPhone: p.normalized_value,
      isPrimary: p.is_primary,
      verificationStatus: p.verification_status,
      createdAt: p.created_at.toISOString(),
    })),
    emails: emails.rows.map((e) => ({
      id: e.id,
      email: e.raw_value,
      normalizedEmail: e.normalized_value,
      isPrimary: e.is_primary,
      verificationStatus: e.verification_status,
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
      status: a.status,
      version: Number(a.version),
      createdAt: a.created_at.toISOString(),
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
    commerceMetrics: {
      totalOrders: Number(stats.rows[0]?.order_count ?? 0),
      activeOrders: Number(stats.rows[0]?.active_order_count ?? 0),
      cancelledOrders: Number(stats.rows[0]?.cancelled_order_count ?? 0),
      lifetimeOrderValue: stats.rows[0]?.total_spend ?? '0',
      collectedAmount: stats.rows[0]?.collected_amount ?? '0',
      refundedAmount: stats.rows[0]?.refunded_amount ?? '0',
      lastOrderAt: stats.rows[0]?.last_order_at?.toISOString() ?? null,
    },
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
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Customer has changed; reload before updating.',
      );

    if (row.rows[0].status === 'MERGED' || row.rows[0].status === 'ANONYMIZED')
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `Cannot update customer in ${row.rows[0].status} status.`,
      );

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
        where organization_id = ${input.organizationId} and id = ${input.customerId}
        returning version::text
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

export async function mergeCustomers(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    sourceCustomerId: string;
    targetCustomerId: string;
    sourceExpectedVersion: number;
    targetExpectedVersion: number;
    reason: string;
    idempotencyKey: string;
  },
): Promise<CustomerDetailView> {
  const reason = input.reason.trim();
  if (!reason) throw new CustomerDomainError('VALIDATION_FAILED', 'A merge reason is required.');
  if (input.sourceCustomerId === input.targetCustomerId)
    throw new CustomerDomainError('VALIDATION_FAILED', 'A customer cannot be merged into itself.');

  const targetId = await db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'customers.merge',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          sourceCustomerId: input.sourceCustomerId,
          targetCustomerId: input.targetCustomerId,
          sourceExpectedVersion: input.sourceExpectedVersion,
          targetExpectedVersion: input.targetExpectedVersion,
          reason,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const replay = await sql<{ result_entity_id: string | null }>`
            select result_entity_id::text
            from platform.idempotency_records where id = ${record.id}
          `.execute(transaction);
          if (replay.rows[0]?.result_entity_id) return replay.rows[0].result_entity_id;
        }
        throw new CustomerDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This customer merge is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new CustomerDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const locked = await sql<{
      id: string;
      status: CustomerSummary['status'];
      version: string;
    }>`
      select id, status, version::text
      from customers.customers
      where organization_id = ${input.organizationId}
        and id = any(${[input.sourceCustomerId, input.targetCustomerId]}::uuid[])
      order by id
      for update
    `.execute(transaction);
    if (locked.rows.length !== 2)
      throw new CustomerDomainError('NOT_FOUND', 'One or both customers were not found.');
    const source = locked.rows.find((row) => row.id === input.sourceCustomerId)!;
    const target = locked.rows.find((row) => row.id === input.targetCustomerId)!;
    if (Number(source.version) !== input.sourceExpectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'The source customer has changed; reload before merging.',
      );
    if (Number(target.version) !== input.targetExpectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'The target customer has changed; reload before merging.',
      );
    if (['MERGED', 'ANONYMIZED'].includes(source.status))
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `A ${source.status.toLowerCase()} customer cannot be used as the merge source.`,
      );
    if (['MERGED', 'ANONYMIZED'].includes(target.status))
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `A ${target.status.toLowerCase()} customer cannot be used as the merge target.`,
      );

    const counts = await sql<{
      phones: number;
      emails: number;
      addresses: number;
      notes: number;
      tags: number;
    }>`
      select
        (select count(*)::int from customers.customer_phones where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as phones,
        (select count(*)::int from customers.customer_emails where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as emails,
        (select count(*)::int from customers.customer_addresses where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as addresses,
        (select count(*)::int from customers.customer_notes where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as notes,
        (select count(*)::int from customers.customer_tag_assignments where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as tags
    `.execute(transaction);
    const conflictSnapshot = counts.rows[0] ?? {
      phones: 0,
      emails: 0,
      addresses: 0,
      notes: 0,
      tags: 0,
    };

    await sql`
      delete from customers.customer_phones source
      where source.organization_id = ${input.organizationId}
        and source.customer_id = ${input.sourceCustomerId}
        and exists (
          select 1 from customers.customer_phones target
          where target.organization_id = source.organization_id
            and target.customer_id = ${input.targetCustomerId}
            and target.normalized_value = source.normalized_value
        )
    `.execute(transaction);
    await sql`
      update customers.customer_phones
      set customer_id = ${input.targetCustomerId}, is_primary = false,
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      with candidate as (
        select id from customers.customer_phones
        where organization_id = ${input.organizationId} and customer_id = ${input.targetCustomerId}
        order by created_at, id limit 1
      )
      update customers.customer_phones
      set is_primary = true, version = version + 1, updated_at = now()
      where id = (select id from candidate)
        and not exists (
          select 1 from customers.customer_phones
          where organization_id = ${input.organizationId}
            and customer_id = ${input.targetCustomerId} and is_primary
        )
    `.execute(transaction);

    await sql`
      delete from customers.customer_emails source
      where source.organization_id = ${input.organizationId}
        and source.customer_id = ${input.sourceCustomerId}
        and exists (
          select 1 from customers.customer_emails target
          where target.organization_id = source.organization_id
            and target.customer_id = ${input.targetCustomerId}
            and target.normalized_value = source.normalized_value
        )
    `.execute(transaction);
    await sql`
      update customers.customer_emails
      set customer_id = ${input.targetCustomerId}, is_primary = false,
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      with candidate as (
        select id from customers.customer_emails
        where organization_id = ${input.organizationId} and customer_id = ${input.targetCustomerId}
        order by created_at, id limit 1
      )
      update customers.customer_emails
      set is_primary = true, version = version + 1, updated_at = now()
      where id = (select id from candidate)
        and not exists (
          select 1 from customers.customer_emails
          where organization_id = ${input.organizationId}
            and customer_id = ${input.targetCustomerId} and is_primary
        )
    `.execute(transaction);

    await sql`
      update customers.customer_addresses
      set customer_id = ${input.targetCustomerId}, is_default = false,
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      with candidate as (
        select id from customers.customer_addresses
        where organization_id = ${input.organizationId}
          and customer_id = ${input.targetCustomerId} and status = 'ACTIVE'
        order by created_at, id limit 1
      )
      update customers.customer_addresses
      set is_default = true, version = version + 1, updated_at = now()
      where id = (select id from candidate)
        and not exists (
          select 1 from customers.customer_addresses
          where organization_id = ${input.organizationId}
            and customer_id = ${input.targetCustomerId}
            and status = 'ACTIVE' and is_default
        )
    `.execute(transaction);
    await sql`update customers.customer_notes set customer_id = ${input.targetCustomerId} where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}`.execute(
      transaction,
    );
    await sql`
      insert into customers.customer_tag_assignments (organization_id, customer_id, tag_id)
      select organization_id, ${input.targetCustomerId}, tag_id
      from customers.customer_tag_assignments
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
      on conflict do nothing
    `.execute(transaction);
    await sql`delete from customers.customer_tag_assignments where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}`.execute(
      transaction,
    );

    await sql`
      update customers.customer_aliases
      set canonical_customer_id = ${input.targetCustomerId}
      where organization_id = ${input.organizationId}
        and canonical_customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      insert into customers.customer_aliases
        (organization_id, alias_customer_id, canonical_customer_id)
      values (${input.organizationId}, ${input.sourceCustomerId}, ${input.targetCustomerId})
      on conflict (organization_id, alias_customer_id)
      do update set canonical_customer_id = excluded.canonical_customer_id
    `.execute(transaction);
    await sql`
      update customers.customers
      set status = 'MERGED', canonical_customer_id = ${input.targetCustomerId},
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update customers.customers
      set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.targetCustomerId}
    `.execute(transaction);
    await sql`
      insert into customers.customer_merges (
        organization_id, source_customer_id, target_customer_id, reason,
        conflict_snapshot, created_by
      ) values (
        ${input.organizationId}, ${input.sourceCustomerId}, ${input.targetCustomerId}, ${reason},
        ${JSON.stringify(conflictSnapshot)}::jsonb, ${input.actorId}
      )
    `.execute(transaction);
    await sql`
      update customers.customer_duplicate_candidates
      set status = 'CONFIRMED', resolved_at = now()
      where organization_id = ${input.organizationId}
        and customer_a_id = least(${input.sourceCustomerId}::uuid, ${input.targetCustomerId}::uuid)
        and customer_b_id = greatest(${input.sourceCustomerId}::uuid, ${input.targetCustomerId}::uuid)
    `.execute(transaction);

    await emitCustomerEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: input.targetCustomerId,
      action: 'customers.customer.merged',
      metadata: { sourceCustomerId: input.sourceCustomerId, reason },
    });
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'customers.customer',
          result_entity_id = ${input.targetCustomerId}::uuid,
          safe_response = ${JSON.stringify({ customerId: input.targetCustomerId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
    return input.targetCustomerId;
  });

  return getCustomerDetail(db, input.organizationId, targetId);
}

export async function anonymizeCustomer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    expectedVersion: number;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
): Promise<CustomerDetailView> {
  const reasonCode = input.reasonCode.trim();
  const reasonText = input.reasonText?.trim() || null;
  if (!reasonCode)
    throw new CustomerDomainError('VALIDATION_FAILED', 'An anonymization reason is required.');

  const customerId = await db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'customers.anonymize',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          customerId: input.customerId,
          expectedVersion: input.expectedVersion,
          reasonCode,
          reasonText,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') return input.customerId;
        throw new CustomerDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This anonymization request is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new CustomerDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const customer = await sql<{
      status: CustomerSummary['status'];
      version: string;
    }>`
      select status, version::text from customers.customers
      where organization_id = ${input.organizationId} and id = ${input.customerId}
      for update
    `.execute(transaction);
    const row = customer.rows[0];
    if (!row) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Customer has changed; reload before anonymizing.',
      );
    if (row.status === 'MERGED')
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        'Anonymize the canonical customer instead of a merged alias.',
      );
    if (row.status === 'ANONYMIZED') {
      await sql`
        update platform.idempotency_records
        set status = 'SUCCEEDED', result_entity_type = 'customers.customer',
            result_entity_id = ${input.customerId}::uuid,
            safe_response = ${JSON.stringify({ customerId: input.customerId })}::jsonb,
            completed_at = now()
        where id = ${idempotencyRecordId}
      `.execute(transaction);
      return input.customerId;
    }

    const blockers = await sql<{
      active_orders: number;
      open_returns: number;
      open_refunds: number;
      alias_count: number;
    }>`
      with family as (
        select ${input.customerId}::uuid as id
        union all
        select alias_customer_id from customers.customer_aliases
        where organization_id = ${input.organizationId}
          and canonical_customer_id = ${input.customerId}
      ), customer_orders as (
        select id from orders.orders
        where organization_id = ${input.organizationId}
          and customer_id in (select id from family)
      )
      select
        (select count(*)::int from orders.orders
          where organization_id = ${input.organizationId}
            and customer_id in (select id from family)
            and order_status in ('PENDING', 'CONFIRMED', 'ON_HOLD')) as active_orders,
        (select count(*)::int from returns.return_cases
          where organization_id = ${input.organizationId}
            and order_id in (select id from customer_orders) and case_status = 'OPEN') as open_returns,
        (select count(*)::int from payments.refunds
          where organization_id = ${input.organizationId}
            and order_id in (select id from customer_orders)
            and status in ('REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME')) as open_refunds,
        (select count(*)::int from customers.customer_aliases
          where organization_id = ${input.organizationId}
            and canonical_customer_id = ${input.customerId}) as alias_count
    `.execute(transaction);
    const blocker = blockers.rows[0]!;
    if (blocker.active_orders || blocker.open_returns || blocker.open_refunds)
      throw new CustomerDomainError(
        'CONFLICT',
        'Customer data cannot be anonymized while orders, returns, or refunds remain active.',
      );

    await sql`delete from customers.customer_phones where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
      transaction,
    );
    await sql`delete from customers.customer_emails where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
      transaction,
    );
    await sql`
      update customers.customer_addresses
      set label = null, recipient_name = 'Anonymized', phone = null,
          address_line_1 = 'Redacted', address_line_2 = null, geography_node_id = null,
          area = null, city = null, district = null, postal_code = null,
          is_default = false, status = 'INACTIVE', version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
    `.execute(transaction);
    await sql`delete from customers.customer_notes where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
      transaction,
    );
    await sql`delete from customers.customer_tag_assignments where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
      transaction,
    );
    await sql`
      update customers.customer_duplicate_candidates
      set status = 'DISMISSED', resolved_at = now()
      where organization_id = ${input.organizationId}
        and (
          customer_a_id = ${input.customerId}::uuid
          or customer_b_id = ${input.customerId}::uuid
        )
        and status = 'OPEN'
    `.execute(transaction);
    await sql`
      update customers.customers
      set display_name = 'Anonymized customer ' || right(replace(id::text, '-', ''), 8),
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId}
        and id in (
          select alias_customer_id from customers.customer_aliases
          where organization_id = ${input.organizationId}
            and canonical_customer_id = ${input.customerId}
        )
    `.execute(transaction);
    await sql`
      update customers.customers
      set display_name = 'Anonymized customer ' || right(replace(id::text, '-', ''), 8),
          status = 'ANONYMIZED', canonical_customer_id = null,
          version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);
    await sql`
      insert into customers.customer_anonymizations (
        organization_id, customer_id, reason_code, reason_text,
        affected_alias_count, created_by
      ) values (
        ${input.organizationId}, ${input.customerId}, ${reasonCode}, ${reasonText},
        ${blocker.alias_count}, ${input.actorId}
      )
    `.execute(transaction);
    await emitCustomerEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: input.customerId,
      action: 'customers.customer.anonymized',
      metadata: { reasonCode, affectedAliasCount: blocker.alias_count },
    });
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'customers.customer',
          result_entity_id = ${input.customerId}::uuid,
          safe_response = ${JSON.stringify({ customerId: input.customerId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
    return input.customerId;
  });

  return getCustomerDetail(db, input.organizationId, customerId);
}

export async function removeCustomerPhone(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; phoneId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const row = await sql<{ is_primary: boolean }>`
      select is_primary from customers.customer_phones
      where organization_id = ${input.organizationId} and id = ${input.phoneId}
        and customer_id = ${input.customerId}
      for update
    `.execute(transaction);
    if (!row.rows[0]) return;
    if (row.rows[0].is_primary) {
      // Check if it's the last phone
      const count = await sql<{
        count: string;
      }>`select count(*)::text as count from customers.customer_phones where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
        transaction,
      );
      if (Number(count.rows[0]?.count) > 1) {
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Cannot remove the primary phone while other phones exist. Make another phone primary first.',
        );
      }
    }
    await sql`delete from customers.customer_phones where organization_id = ${input.organizationId} and id = ${input.phoneId}`.execute(
      transaction,
    );
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
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
      where organization_id = ${input.organizationId} and id = ${input.emailId}
        and customer_id = ${input.customerId}
      for update
    `.execute(transaction);
    if (!row.rows[0]) return;
    if (row.rows[0].is_primary) {
      const count = await sql<{
        count: string;
      }>`select count(*)::text as count from customers.customer_emails where organization_id = ${input.organizationId} and customer_id = ${input.customerId}`.execute(
        transaction,
      );
      if (Number(count.rows[0]?.count) > 1) {
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Cannot remove the primary email while other emails exist. Make another email primary first.',
        );
      }
    }
    await sql`delete from customers.customer_emails where organization_id = ${input.organizationId} and id = ${input.emailId}`.execute(
      transaction,
    );
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function removeCustomerAddress(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; addressId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const removed = await sql<{ id: string }>`
      update customers.customer_addresses
      set status = 'INACTIVE', is_default = false, version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.addressId}
        and customer_id = ${input.customerId} and status = 'ACTIVE'
      returning id
    `.execute(transaction);
    if (!removed.rows[0]) return;
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function addCustomerNote(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; body: string },
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new CustomerDomainError('VALIDATION_FAILED', 'Note body cannot be empty.');
  return db.transaction().execute(async (transaction) => {
    const customer = await sql<{ id: string }>`
      select id from customers.customers
      where organization_id = ${input.organizationId} and id = ${input.customerId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    const created = await sql<{ id: string }>`
      insert into customers.customer_notes (organization_id, customer_id, author_actor_id, body)
      values (${input.organizationId}, ${input.customerId}, ${input.actorId}, ${body})
      returning id
    `.execute(transaction);
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Customer note creation did not return an id.');
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.note_added' });
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Customer Timeline Queries (Orders, Returns, Refunds)
// ---------------------------------------------------------------------------

export async function listCustomerOrders(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
  limit = 20,
): Promise<
  readonly {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currencyCode: string;
    createdAt: string;
  }[]
> {
  const result = await sql<{
    id: string;
    order_number: string;
    order_status: string;
    total_amount: string;
    currency_code: string;
    created_at: Date;
  }>`
    select id, order_number, order_status, total_amount::text, currency_code, created_at
    from orders.orders
    where organization_id = ${organizationId}
      and (
        customer_id = ${customerId} or
        customer_id in (select alias_customer_id from customers.customer_aliases where organization_id = ${organizationId} and canonical_customer_id = ${customerId})
      )
    order by created_at desc
    limit ${Math.min(50, Math.max(1, limit))}
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
  limit = 20,
): Promise<
  readonly {
    id: string;
    caseNumber: string;
    status: string;
    returnType: string;
    orderNumber: string;
    createdAt: string;
  }[]
> {
  const result = await sql<{
    id: string;
    return_number: string;
    case_status: string;
    case_type: string;
    order_number: string;
    created_at: Date;
  }>`
    select r.id, r.return_number, r.case_status, r.case_type, o.order_number, r.created_at
    from returns.return_cases r
    join orders.orders o on o.id = r.order_id and o.organization_id = r.organization_id
    where r.organization_id = ${organizationId}
      and (
        o.customer_id = ${customerId} or
        o.customer_id in (select alias_customer_id from customers.customer_aliases where organization_id = ${organizationId} and canonical_customer_id = ${customerId})
      )
    order by r.created_at desc
    limit ${Math.min(50, Math.max(1, limit))}
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    caseNumber: row.return_number,
    status: row.case_status,
    returnType: row.case_type,
    orderNumber: row.order_number,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listCustomerRefunds(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
  limit = 20,
): Promise<
  readonly {
    id: string;
    amount: string;
    status: string;
    orderNumber: string;
    createdAt: string;
  }[]
> {
  const result = await sql<{
    id: string;
    amount: string;
    status: string;
    order_number: string;
    created_at: Date;
  }>`
    select r.id, r.amount::text, r.status, o.order_number, r.created_at
    from payments.refunds r
    join orders.orders o on o.id = r.order_id and o.organization_id = r.organization_id
    where r.organization_id = ${organizationId}
      and (
        o.customer_id = ${customerId} or
        o.customer_id in (select alias_customer_id from customers.customer_aliases where organization_id = ${organizationId} and canonical_customer_id = ${customerId})
      )
    order by r.created_at desc
    limit ${Math.min(50, Math.max(1, limit))}
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
    const ownership = await sql<{ customer_id: string; tag_id: string }>`
      select customer.id as customer_id, tag.id as tag_id
      from customers.customers customer
      join customers.customer_tags tag on tag.organization_id = customer.organization_id
      where customer.organization_id = ${input.organizationId}
        and customer.id = ${input.customerId} and tag.id = ${input.tagId}
        and customer.status not in ('MERGED', 'ANONYMIZED')
      for update of customer
    `.execute(transaction);
    if (!ownership.rows[0])
      throw new CustomerDomainError('NOT_FOUND', 'Customer or tag was not found.');
    await sql`
      insert into customers.customer_tag_assignments (organization_id, customer_id, tag_id)
      values (${input.organizationId}, ${input.customerId}, ${input.tagId})
      on conflict do nothing
    `.execute(transaction);
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function removeTagFromCustomer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; tagId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const removed = await sql<{ customer_id: string }>`
      delete from customers.customer_tag_assignments
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and tag_id = ${input.tagId}
      returning customer_id
    `.execute(transaction);
    if (!removed.rows[0]) return;
    await sql`update customers.customers set version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.customerId}`.execute(
      transaction,
    );
    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}
