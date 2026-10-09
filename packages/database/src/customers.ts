import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  CustomerIdentityValidationError,
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from './customer-identities.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { decimal4Minor, decimal4Text } from './orders/types.js';
import { getCustomerDeliveryHistory } from './delivery-intelligence.js';

export * from './customers/types.js';
export * from './customers/restrictions.js';
export * from './customers/accounts.js';
export * from './customers/communications.js';
export * from './customers/timeline.js';
export * from './customers/merge-preview.js';

import type {
  CustomerRestriction,
  CustomerRestrictionType,
  CustomerAccount,
} from './customers/types.js';
import { listCustomerRestrictions } from './customers/restrictions.js';
import { getCustomerAccount } from './customers/accounts.js';

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
      | 'IDEMPOTENCY_CONFLICT'
      | 'RESTRICTION_ACTIVE'
      | 'ACCOUNT_LINK_CONFLICT',
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
  readonly activeRestrictions?: readonly CustomerRestrictionType[];
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
    address?: {
      recipientName: string;
      phone?: string | null | undefined;
      addressLine1: string;
      addressLine2?: string | null | undefined;
      geographyNodeId?: string | null | undefined;
      area?: string | null | undefined;
      city?: string | null | undefined;
      district?: string | null | undefined;
      postalCode?: string | null | undefined;
      countryCode: string;
    };
  },
): Promise<{
  customerId: string;
  created: boolean;
  customerAddressId?: string;
  activeRestrictions: readonly CustomerRestrictionType[];
}> {
  const normalizedPhone = identityInput(() => normalizeCustomerPhone(input.phone));
  const normalizedEmail = input.email
    ? identityInput(() => normalizeCustomerEmail(input.email!))
    : undefined;
  normalizeCustomerName(input.displayName);

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

  const phoneMatches = candidates.rows.filter((c) => c.phone_match);
  const emailMatches = candidates.rows.filter((c) => c.email_match);

  let matchedCustomerId: string | null = null;
  let isCreated = false;

  // 1. Both phone and email match the same customer record: strongest match
  const bothMatch = phoneMatches.find((p) => emailMatches.some((e) => e.id === p.id));
  if (bothMatch) {
    matchedCustomerId = bothMatch.id;
  } else if (phoneMatches.length === 1) {
    // 2. Exact single phone match in organization
    const singlePhoneMatch = phoneMatches[0]!;
    // If order provided an email, but it matched a DIFFERENT customer record
    if (emailMatches.length > 0 && !emailMatches.some((e) => e.id === singlePhoneMatch.id)) {
      // Identity conflict: Phone matches Customer A, email matches Customer B!
      // Queue duplicate candidate / conflict review between A and B
      for (const emailMatch of emailMatches) {
        const ids = [singlePhoneMatch.id, emailMatch.id].toSorted();
        await sql`
          insert into customers.customer_duplicate_candidates
            (organization_id, customer_a_id, customer_b_id, confidence, signals)
          values (${input.organizationId}, ${ids[0]}, ${ids[1]}, 0.8500::numeric,
            ${JSON.stringify(['PHONE_EMAIL_CONFLICT', 'PHONE', 'EMAIL'])}::jsonb)
          on conflict (organization_id, customer_a_id, customer_b_id)
          do update set confidence = greatest(customers.customer_duplicate_candidates.confidence, excluded.confidence),
            signals = excluded.signals, status = 'OPEN', resolved_at = null
        `.execute(db);
      }
      matchedCustomerId = singlePhoneMatch.id;
    } else {
      matchedCustomerId = singlePhoneMatch.id;
      // Auto-learn email if customer didn't have one and this order provided one
      if (normalizedEmail) {
        const hasEmail = await sql<{ id: string }>`
          select id from customers.customer_emails
          where organization_id = ${input.organizationId}
            and customer_id = ${singlePhoneMatch.id}
            and normalized_value = ${normalizedEmail}
        `.execute(db);
        if (!hasEmail.rows[0]) {
          const hasAnyEmail = await sql<{ count: string }>`
            select count(*)::text as count from customers.customer_emails
            where organization_id = ${input.organizationId} and customer_id = ${singlePhoneMatch.id}
          `.execute(db);
          const isPrimary = Number(hasAnyEmail.rows[0]?.count ?? 0) === 0;
          await sql`
            insert into customers.customer_emails
              (organization_id, customer_id, raw_value, normalized_value, is_primary)
            values (${input.organizationId}, ${singlePhoneMatch.id}, ${input.email!.trim()}, ${normalizedEmail}, ${isPrimary})
            on conflict do nothing
          `.execute(db);
        }
      }
    }
  } else if (phoneMatches.length > 1) {
    // 3. Ambiguous phone matches across multiple customer records
    // Pick the oldest active customer, queue duplicate candidates among all matches
    matchedCustomerId = phoneMatches[0]!.id;
    for (let i = 0; i < phoneMatches.length; i++) {
      for (let j = i + 1; j < phoneMatches.length; j++) {
        const ids = [phoneMatches[i]!.id, phoneMatches[j]!.id].toSorted();
        await sql`
          insert into customers.customer_duplicate_candidates
            (organization_id, customer_a_id, customer_b_id, confidence, signals)
          values (${input.organizationId}, ${ids[0]}, ${ids[1]}, 0.9000::numeric,
            ${JSON.stringify(['DUPLICATE_PHONE', 'PHONE'])}::jsonb)
          on conflict (organization_id, customer_a_id, customer_b_id)
          do update set confidence = greatest(customers.customer_duplicate_candidates.confidence, excluded.confidence),
            signals = excluded.signals, status = 'OPEN', resolved_at = null
        `.execute(db);
      }
    }
  }

  let finalCustomerId: string;
  if (matchedCustomerId) {
    finalCustomerId = matchedCustomerId;
    await sql`
      update customers.customers
      set latest_source = ${input.source}, updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${matchedCustomerId}
    `.execute(db);
  } else {
    // 4. Create new customer
    isCreated = true;
    const createdResult = await sql<{ id: string }>`
      insert into customers.customers
        (organization_id, customer_number, display_name, first_source, latest_source)
      values (${input.organizationId}, 'CUS-' || upper(replace(uuidv7()::text, '-', '')),
        ${input.displayName.trim()}, ${input.source}, ${input.source})
      returning id
    `.execute(db);
    const createdId = createdResult.rows[0]?.id;
    if (!createdId) throw new Error('Customer creation did not return a customer.');
    finalCustomerId = createdId;

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
      metadata: { source: input.source, identityResolution: 'NEW_CUSTOMER' },
    });

    // Check if email matched another customer (candidate duplicate for review)
    for (const emailMatch of emailMatches) {
      const ids = [createdId, emailMatch.id].toSorted();
      await sql`
        insert into customers.customer_duplicate_candidates
          (organization_id, customer_a_id, customer_b_id, confidence, signals)
        values (${input.organizationId}, ${ids[0]}, ${ids[1]}, 0.6000::numeric,
          ${JSON.stringify(['EMAIL'])}::jsonb)
        on conflict (organization_id, customer_a_id, customer_b_id)
        do update set confidence = greatest(customers.customer_duplicate_candidates.confidence, excluded.confidence),
          signals = excluded.signals, status = 'OPEN', resolved_at = null
      `.execute(db);
    }
  }

  // Active restrictions check
  const activeRestrictionsRows = await sql<{ restriction_type: CustomerRestrictionType }>`
    select restriction_type from customers.customer_restrictions
    where organization_id = ${input.organizationId}
      and (
        customer_id = ${finalCustomerId}
        or customer_id in (
          select alias_customer_id from customers.customer_aliases
          where organization_id = ${input.organizationId} and canonical_customer_id = ${finalCustomerId}
        )
      )
      and status = 'ACTIVE'
      and (expires_at is null or expires_at > now())
  `.execute(db);

  const activeRestrictions = activeRestrictionsRows.rows.map((r) => r.restriction_type);
  if (activeRestrictions.includes('ORDERING_BLOCKED')) {
    throw new CustomerDomainError(
      'CUSTOMER_BLOCKED',
      'This customer cannot place new orders. Contact support for assistance.',
    );
  }

  // Legacy BLOCKED status check
  const statusCheck = await sql<{ status: string }>`
    select status from customers.customers where organization_id = ${input.organizationId} and id = ${finalCustomerId}
  `.execute(db);
  if (statusCheck.rows[0]?.status === 'BLOCKED') {
    throw new CustomerDomainError(
      'CUSTOMER_BLOCKED',
      'This customer cannot place new orders. Contact support for assistance.',
    );
  }

  // Auto-learn address if provided
  let customerAddressId: string | undefined;
  if (input.address) {
    const addr = input.address;
    const existingAddr = await sql<{ id: string }>`
      select id from customers.customer_addresses
      where organization_id = ${input.organizationId}
        and customer_id = ${finalCustomerId}
        and status = 'ACTIVE'
        and lower(trim(address_line_1)) = lower(trim(${addr.addressLine1}))
        and lower(trim(coalesce(city, ''))) = lower(trim(${addr.city ?? ''}))
        and country_code = ${addr.countryCode}
      limit 1
    `.execute(db);

    if (existingAddr.rows[0]) {
      customerAddressId = existingAddr.rows[0].id;
    } else {
      const hasDefault = await sql<{ count: string }>`
        select count(*)::text as count from customers.customer_addresses
        where organization_id = ${input.organizationId}
          and customer_id = ${finalCustomerId}
          and status = 'ACTIVE' and is_default
      `.execute(db);
      const isDefault = Number(hasDefault.rows[0]?.count ?? 0) === 0;

      const createdAddr = await sql<{ id: string }>`
        insert into customers.customer_addresses (
          organization_id, customer_id, recipient_name, phone,
          address_line_1, address_line_2, geography_node_id, area,
          city, district, postal_code, country_code, is_default, status
        ) values (
          ${input.organizationId}, ${finalCustomerId}, ${addr.recipientName.trim()},
          ${addr.phone?.trim() ?? null}, ${addr.addressLine1.trim()}, ${addr.addressLine2?.trim() ?? null},
          ${addr.geographyNodeId ?? null}, ${addr.area?.trim() ?? null}, ${addr.city?.trim() ?? null},
          ${addr.district?.trim() ?? null}, ${addr.postalCode?.trim() ?? null}, ${addr.countryCode},
          ${isDefault}, 'ACTIVE'
        ) returning id
      `.execute(db);
      customerAddressId = createdAddr.rows[0]?.id;
    }
  }

  return {
    customerId: finalCustomerId,
    created: isCreated,
    ...(customerAddressId ? { customerAddressId } : {}),
    activeRestrictions,
  };
}

export async function resolveOrCreateOrderCustomer(
  db: Kysely<DatabaseSchema>,
  input: Parameters<typeof resolveOrCreateOrderCustomerInTransaction>[1],
): Promise<{
  customerId: string;
  created: boolean;
  customerAddressId?: string;
  activeRestrictions: readonly CustomerRestrictionType[];
}> {
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
  readonly sortBy?: 'CREATED_DESC' | 'CREATED_ASC' | 'ORDERS_DESC' | 'SPEND_DESC' | 'RECENT_ORDER';
  readonly minOrders?: number;
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
    active_restrictions: CustomerRestrictionType[] | null;
    total_count: string;
  }>`
    select
      c.id, c.customer_number, c.display_name, c.status, c.first_source, c.latest_source,
      c.version::text, c.created_at,
      (select raw_value from customers.customer_phones p where p.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_phone,
      (select raw_value from customers.customer_emails e where e.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_email,
      stats.order_count, stats.total_spend, stats.last_order_at,
      restr.active_restrictions,
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
    left join lateral (
      select array_agg(cr.restriction_type) as active_restrictions
      from customers.customer_restrictions cr
      where cr.organization_id = c.organization_id
        and (
          cr.customer_id = c.id or
          cr.customer_id in (select alias_customer_id from customers.customer_aliases where organization_id = c.organization_id and canonical_customer_id = c.id)
        )
        and cr.status = 'ACTIVE'
        and (cr.expires_at is null or cr.expires_at > now())
    ) restr on true
    where c.organization_id = ${organizationId}
      and (${filters?.status ?? null}::text is null or c.status = ${filters?.status ?? null})
      and (${filters?.source ?? null}::text is null or c.first_source = ${filters?.source ?? null})
      and (${filters?.from ?? null}::text is null or c.created_at >= (${filters?.from ?? null})::timestamptz)
      and (${filters?.to ?? null}::text is null or c.created_at <= (${filters?.to ?? null})::timestamptz)
      and (${filters?.minOrders ?? null}::int is null or coalesce(stats.order_count::int, 0) >= (${filters?.minOrders ?? null})::int)
      and (
        ${searchTerm ?? null}::text is null
        or lower(c.display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or lower(c.customer_number) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or exists (select 1 from customers.customer_phones cp where cp.organization_id = c.organization_id and cp.customer_id = c.id and (cp.normalized_value = ${normalizedSearchPhone ?? ''} or cp.raw_value like ${searchTerm ? `%${searchTerm}%` : ''}))
        or exists (select 1 from customers.customer_emails ce where ce.customer_id = c.id and (lower(ce.raw_value) like lower(${searchTerm ? `%${searchTerm}%` : ''}) or ce.normalized_value like lower(${searchTerm ? `%${searchTerm}%` : ''})))
      )
    order by ${
      filters?.sortBy === 'CREATED_ASC'
        ? sql`c.created_at asc, c.id asc`
        : filters?.sortBy === 'ORDERS_DESC'
          ? sql`coalesce(stats.order_count::int, 0) desc, c.created_at desc`
          : filters?.sortBy === 'SPEND_DESC'
            ? sql`coalesce(stats.total_spend::numeric, 0) desc, c.created_at desc`
            : filters?.sortBy === 'RECENT_ORDER'
              ? sql`stats.last_order_at desc nulls last, c.created_at desc`
              : sql`c.updated_at desc, c.id desc`
    }
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
      activeRestrictions: (row.active_restrictions ?? []).filter(
        Boolean,
      ) as readonly CustomerRestrictionType[],
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

export async function verifyCustomerPhone(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    phoneId: string;
    verificationSource?: string;
  },
): Promise<{ id: string; verificationStatus: string; verifiedAt: string }> {
  return db.transaction().execute(async (tx) => {
    const phone = await sql<{ id: string; verification_status: string }>`
      select id, verification_status from customers.customer_phones
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and id = ${input.phoneId}
      for update
    `.execute(tx);
    const row = phone.rows[0];
    if (!row) {
      throw new CustomerDomainError('NOT_FOUND', 'Customer phone was not found.');
    }
    const verifiedAt = new Date();
    await sql`
      update customers.customer_phones
      set verification_status = 'VERIFIED',
          verified_at = ${verifiedAt},
          verification_source = ${input.verificationSource ?? 'MANUAL_OPERATOR'},
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.phoneId}
    `.execute(tx);

    await emitCustomerEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: input.customerId,
      action: 'customers.customer.phone_verified',
      metadata: {
        phoneId: input.phoneId,
        verificationSource: input.verificationSource ?? 'MANUAL_OPERATOR',
      },
    });

    return { id: row.id, verificationStatus: 'VERIFIED', verifiedAt: verifiedAt.toISOString() };
  });
}

export async function verifyCustomerEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    emailId: string;
    verificationSource?: string;
  },
): Promise<{ id: string; verificationStatus: string; verifiedAt: string }> {
  return db.transaction().execute(async (tx) => {
    const email = await sql<{ id: string; verification_status: string }>`
      select id, verification_status from customers.customer_emails
      where organization_id = ${input.organizationId}
        and customer_id = ${input.customerId}
        and id = ${input.emailId}
      for update
    `.execute(tx);
    const row = email.rows[0];
    if (!row) {
      throw new CustomerDomainError('NOT_FOUND', 'Customer email was not found.');
    }
    const verifiedAt = new Date();
    await sql`
      update customers.customer_emails
      set verification_status = 'VERIFIED',
          verified_at = ${verifiedAt},
          verification_source = ${input.verificationSource ?? 'MANUAL_OPERATOR'},
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.emailId}
    `.execute(tx);

    await emitCustomerEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: input.customerId,
      action: 'customers.customer.email_verified',
      metadata: {
        emailId: input.emailId,
        verificationSource: input.verificationSource ?? 'MANUAL_OPERATOR',
      },
    });

    return { id: row.id, verificationStatus: 'VERIFIED', verifiedAt: verifiedAt.toISOString() };
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
): Promise<
  readonly {
    customerId: string;
    confidence: string;
    signals: readonly string[];
    displayName?: string;
    customerNumber?: string;
    status?: string;
    primaryPhone?: string | null;
    primaryEmail?: string | null;
    orderCount?: number;
  }[]
> {
  const result = await sql<{
    customer_id: string;
    confidence: string;
    signals: string[];
    display_name: string;
    customer_number: string;
    status: string;
    primary_phone: string | null;
    primary_email: string | null;
    order_count: string;
  }>`
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
    ), matched_agg as (
      select customer_id, (count(*)::numeric / 2)::text as confidence, array_agg(signal order by signal) as signals
      from (select * from phone_matches union all select * from email_matches) matches
      group by customer_id
    )
    select
      m.customer_id, m.confidence, m.signals,
      c.display_name, c.customer_number, c.status,
      (select raw_value from customers.customer_phones p where p.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_phone,
      (select raw_value from customers.customer_emails e where e.customer_id = c.id order by is_primary desc, created_at, id limit 1) as primary_email,
      (select count(*)::text from orders.orders o where o.organization_id = c.organization_id and o.customer_id = c.id) as order_count
    from matched_agg m
    join customers.customers c on c.id = m.customer_id and c.organization_id = ${input.organizationId}
    where c.status not in ('MERGED', 'ANONYMIZED')
    order by m.confidence desc, m.customer_id
  `.execute(db);
  return result.rows.map((row) => ({
    customerId: row.customer_id,
    confidence: row.confidence,
    signals: row.signals,
    displayName: row.display_name,
    customerNumber: row.customer_number,
    status: row.status,
    primaryPhone: row.primary_phone,
    primaryEmail: row.primary_email,
    orderCount: Number(row.order_count ?? 0),
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
    verifiedAt?: string | null;
    verificationSource?: string | null;
    createdAt: string;
  }[];
  readonly emails: readonly {
    id: string;
    email: string;
    normalizedEmail: string;
    isPrimary: boolean;
    verificationStatus: string;
    verifiedAt?: string | null;
    verificationSource?: string | null;
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
  readonly restrictions: readonly CustomerRestriction[];
  readonly account?: CustomerAccount | null;
  readonly deliveryMetrics?: {
    readonly totalDeliveries: number;
    readonly eligibleDeliveries: number;
    readonly deliveredCount: number;
    readonly failedDeliveryCount: number;
    readonly rtoCount: number;
    readonly successRate: number | null;
    readonly rtoRate: number | null;
    readonly lastSuccessfulDelivery?: string | null;
    readonly lastRto?: string | null;
    readonly riskLevel: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';
    readonly riskReasons: readonly { readonly code: string; readonly explanation: string }[];
  } | null;
  readonly commerceMetrics: {
    readonly totalOrders: number;
    readonly activeOrders: number;
    readonly cancelledOrders: number;
    readonly deliveredOrders?: number;
    readonly returnedOrders?: number;
    readonly lifetimeOrderValue: string;
    readonly collectedAmount: string;
    readonly refundedAmount: string;
    readonly outstandingAmount: string;
    readonly averageOrderValue?: string;
    readonly lastOrderAt: string | null;
  };
}

/**
 * Returns complete customer details including aliases, notes, tags, addresses, contacts,
 * restrictions, account link, delivery metrics, and commerce metrics.
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

  const [phones, emails, addresses, notes, tags] = await Promise.all([
    sql<{
      id: string;
      raw_value: string;
      normalized_value: string;
      is_primary: boolean;
      verification_status: string;
      verified_at: Date | null;
      verification_source: string | null;
      created_at: Date;
    }>`
      select id, raw_value, normalized_value, is_primary, verification_status, verified_at, verification_source, created_at
      from customers.customer_phones
      where organization_id = ${organizationId} and customer_id = ${customerId} order by is_primary desc, created_at
    `.execute(db),
    sql<{
      id: string;
      raw_value: string;
      normalized_value: string;
      is_primary: boolean;
      verification_status: string;
      verified_at: Date | null;
      verification_source: string | null;
      created_at: Date;
    }>`
      select id, raw_value, normalized_value, is_primary, verification_status, verified_at, verification_source, created_at
      from customers.customer_emails
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
  ]);

  const [stats, restrictions, account, deliveryHistory] = await Promise.all([
    // Alias-aware stats
    sql<{
      order_count: string;
      active_order_count: string;
      cancelled_order_count: string;
      delivered_order_count: string;
      returned_order_count: string;
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
          count(*) filter (where order_status = 'DELIVERED')::text as delivered_order_count,
          count(*) filter (where order_status = 'RETURNED')::text as returned_order_count,
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
    listCustomerRestrictions(db, organizationId, customerId),
    getCustomerAccount(db, organizationId, customerId),
    getCustomerDeliveryHistory(db, { organizationId, customerId }),
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
      verifiedAt: p.verified_at?.toISOString() ?? null,
      verificationSource: p.verification_source ?? null,
      createdAt: p.created_at.toISOString(),
    })),
    emails: emails.rows.map((e) => ({
      id: e.id,
      email: e.raw_value,
      normalizedEmail: e.normalized_value,
      isPrimary: e.is_primary,
      verificationStatus: e.verification_status,
      verifiedAt: e.verified_at?.toISOString() ?? null,
      verificationSource: e.verification_source ?? null,
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
    restrictions,
    account,
    deliveryMetrics: deliveryHistory
      ? {
          totalDeliveries: deliveryHistory.totalDeliveries,
          eligibleDeliveries: deliveryHistory.eligibleDeliveries,
          deliveredCount: deliveryHistory.deliveredCount,
          failedDeliveryCount: deliveryHistory.failedDeliveryCount,
          rtoCount: deliveryHistory.rtoCount,
          successRate: deliveryHistory.successRate,
          rtoRate: deliveryHistory.rtoRate,
          lastSuccessfulDelivery: deliveryHistory.lastSuccessfulDelivery ?? null,
          lastRto: deliveryHistory.lastRto ?? null,
          riskLevel: deliveryHistory.risk.level,
          riskReasons: deliveryHistory.risk.reasons,
        }
      : null,
    commerceMetrics: (() => {
      const totalSpend = stats.rows[0]?.total_spend ?? '0';
      const collectedAmount = stats.rows[0]?.collected_amount ?? '0';
      const refundedAmount = stats.rows[0]?.refunded_amount ?? '0';
      const activeOrderCount = Number(stats.rows[0]?.active_order_count ?? 0);
      const totalSpendMinor = decimal4Minor(totalSpend);
      const netCollectedMinor = decimal4Minor(collectedAmount) - decimal4Minor(refundedAmount);
      const outstandingMinor =
        totalSpendMinor > netCollectedMinor ? totalSpendMinor - netCollectedMinor : 0n;
      const aovMinor = activeOrderCount > 0 ? totalSpendMinor / BigInt(activeOrderCount) : 0n;
      return {
        totalOrders: Number(stats.rows[0]?.order_count ?? 0),
        activeOrders: activeOrderCount,
        cancelledOrders: Number(stats.rows[0]?.cancelled_order_count ?? 0),
        deliveredOrders: Number(stats.rows[0]?.delivered_order_count ?? 0),
        returnedOrders: Number(stats.rows[0]?.returned_order_count ?? 0),
        lifetimeOrderValue: totalSpend,
        collectedAmount,
        refundedAmount,
        outstandingAmount: decimal4Text(outstandingMinor),
        averageOrderValue: decimal4Text(aovMinor),
        lastOrderAt: stats.rows[0]?.last_order_at?.toISOString() ?? null,
      };
    })(),
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

    const [sourceAccount, targetAccount] = await Promise.all([
      getCustomerAccount(transaction, input.organizationId, input.sourceCustomerId),
      getCustomerAccount(transaction, input.organizationId, input.targetCustomerId),
    ]);
    if (sourceAccount?.status === 'ACTIVE' && targetAccount?.status === 'ACTIVE') {
      if (sourceAccount.userId !== targetAccount.userId) {
        throw new CustomerDomainError(
          'ACCOUNT_LINK_CONFLICT',
          'Cannot merge customers linked to different user accounts.',
        );
      }
    }

    const counts = await sql<{
      phones: number;
      emails: number;
      addresses: number;
      notes: number;
      tags: number;
      restrictions: number;
    }>`
      select
        (select count(*)::int from customers.customer_phones where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as phones,
        (select count(*)::int from customers.customer_emails where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as emails,
        (select count(*)::int from customers.customer_addresses where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as addresses,
        (select count(*)::int from customers.customer_notes where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as notes,
        (select count(*)::int from customers.customer_tag_assignments where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}) as tags,
        (select count(*)::int from customers.customer_restrictions where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId} and status = 'ACTIVE') as restrictions
    `.execute(transaction);
    const conflictSnapshot = counts.rows[0] ?? {
      phones: 0,
      emails: 0,
      addresses: 0,
      notes: 0,
      tags: 0,
      restrictions: 0,
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

    // Transfer or reconcile customer account links
    if (sourceAccount?.status === 'ACTIVE') {
      if (targetAccount?.status === 'ACTIVE') {
        // Both link to the same user: delete the redundant source account row
        await sql`
          delete from customers.customer_accounts
          where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
        `.execute(transaction);
      } else {
        // Source has active account, target has none: transfer account to target
        await sql`
          delete from customers.customer_accounts
          where organization_id = ${input.organizationId} and customer_id = ${input.targetCustomerId}
        `.execute(transaction);
        await sql`
          update customers.customer_accounts
          set customer_id = ${input.targetCustomerId}, version = version + 1, updated_at = now()
          where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
        `.execute(transaction);
      }
    } else {
      // Clean up any inactive source account records
      await sql`
        delete from customers.customer_accounts
        where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
      `.execute(transaction);
    }

    // Transfer active restrictions from source to target
    await sql`
      update customers.customer_restrictions
      set customer_id = ${input.targetCustomerId}, version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);

    // Update foreign keys in external domain tables
    await sql`
      update orders.orders set customer_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update orders.checkout_sessions set customer_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update cart.carts set customer_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update promotions.promotion_usage set customer_id = ${input.targetCustomerId}
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update returns.return_cases set customer_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);

    // Invariant REV-INV-009: At most one active review per customer per product.
    // If both source and target have an active review for the same product,
    // retain target's review as primary and withdraw/archive the source's duplicate review.
    const conflictingReviews = await sql<{ source_id: string; product_id: string }>`
      select s.id::text as source_id, s.product_id::text
      from reviews.reviews s
      join reviews.reviews t
        on t.organization_id = s.organization_id
        and t.product_id = s.product_id
        and t.customer_id = ${input.targetCustomerId}::uuid
        and t.lifecycle_status = 'ACTIVE'
      where s.organization_id = ${input.organizationId}
        and s.customer_id = ${input.sourceCustomerId}::uuid
        and s.lifecycle_status = 'ACTIVE'
    `.execute(transaction);

    for (const conflict of conflictingReviews.rows) {
      await sql`
        update reviews.reviews
        set lifecycle_status = 'REMOVED',
            visibility_status = 'HIDDEN',
            withdrawn_at = now(),
            updated_at = now(),
            version = version + 1
        where organization_id = ${input.organizationId}
          and id = ${conflict.source_id}::uuid
      `.execute(transaction);
    }

    await sql`
      update reviews.reviews set customer_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update reviews.review_access_tokens set customer_id = ${input.targetCustomerId}
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      update notifications.notifications set customer_id = ${input.targetCustomerId}
      where organization_id = ${input.organizationId} and customer_id = ${input.sourceCustomerId}
    `.execute(transaction);
    await sql`
      delete from notifications.preferences source
      where source.organization_id = ${input.organizationId}
        and source.recipient_type = 'CUSTOMER'
        and source.recipient_id = ${input.sourceCustomerId}
        and exists (
          select 1 from notifications.preferences target
          where target.organization_id = source.organization_id
            and target.recipient_type = 'CUSTOMER'
            and target.recipient_id = ${input.targetCustomerId}
            and target.notification_type = source.notification_type
            and target.channel = source.channel
        )
    `.execute(transaction);
    await sql`
      update notifications.preferences set recipient_id = ${input.targetCustomerId}, updated_at = now()
      where organization_id = ${input.organizationId}
        and recipient_type = 'CUSTOMER' and recipient_id = ${input.sourceCustomerId}
    `.execute(transaction);

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

export async function updateCustomerAddress(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    addressId: string;
    recipientName: string;
    addressLine1: string;
    countryCode: string;
    label?: string | null;
    phone?: string | null;
    addressLine2?: string | null;
    geographyNodeId?: string | null;
    area?: string | null;
    city?: string | null;
    district?: string | null;
    postalCode?: string | null;
    isDefault?: boolean;
  },
): Promise<void> {
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
    const customer = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');

    const address = await sql<{ id: string }>`
      select id from customers.customer_addresses
      where organization_id = ${input.organizationId} and id = ${input.addressId}
        and customer_id = ${input.customerId} and status = 'ACTIVE'
      for update
    `.execute(transaction);
    if (!address.rows[0])
      throw new CustomerDomainError('NOT_FOUND', 'Customer address was not found.');

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
      await sql`
        update customers.customer_addresses
        set is_default = false, version = version + 1, updated_at = now()
        where organization_id = ${input.organizationId} and customer_id = ${input.customerId} and status = 'ACTIVE'
      `.execute(transaction);
    }

    await sql`
      update customers.customer_addresses
      set label = ${input.label?.trim() ?? null},
          recipient_name = ${input.recipientName.trim()},
          phone = ${input.phone?.trim() ?? null},
          address_line_1 = ${input.addressLine1.trim()},
          address_line_2 = ${input.addressLine2?.trim() ?? null},
          geography_node_id = ${input.geographyNodeId ?? null},
          area = ${input.area?.trim() ?? null},
          city = ${input.city?.trim() ?? null},
          district = ${input.district?.trim() ?? null},
          postal_code = ${input.postalCode?.trim() ?? null},
          country_code = ${input.countryCode},
          is_default = coalesce(${input.isDefault ?? null}, is_default),
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.addressId} and customer_id = ${input.customerId}
    `.execute(transaction);

    await sql`
      update customers.customers
      set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);

    await emitCustomerEvent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      customerId: input.customerId,
      action: 'customers.customer.address_updated',
    });
  });
}

export async function setPrimaryCustomerPhone(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; phoneId: string },
): Promise<void> {
  return db.transaction().execute(async (transaction) => {
    const customer = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');

    const targetPhone = await sql<{ id: string }>`
      select id from customers.customer_phones
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and id = ${input.phoneId}
      for update
    `.execute(transaction);
    if (!targetPhone.rows[0])
      throw new CustomerDomainError('NOT_FOUND', 'Customer phone was not found.');

    await sql`
      update customers.customer_phones
      set is_primary = (id = ${input.phoneId}), version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
    `.execute(transaction);

    await sql`
      update customers.customers set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);

    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function setPrimaryCustomerEmail(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; emailId: string },
): Promise<void> {
  return db.transaction().execute(async (transaction) => {
    const customer = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');

    const targetEmail = await sql<{ id: string }>`
      select id from customers.customer_emails
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and id = ${input.emailId}
      for update
    `.execute(transaction);
    if (!targetEmail.rows[0])
      throw new CustomerDomainError('NOT_FOUND', 'Customer email was not found.');

    await sql`
      update customers.customer_emails
      set is_primary = (id = ${input.emailId}), version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
    `.execute(transaction);

    await sql`
      update customers.customers set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);

    await emitCustomerEvent(transaction, { ...input, action: 'customers.customer.updated' });
  });
}

export async function setDefaultCustomerAddress(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; customerId: string; addressId: string },
): Promise<void> {
  return db.transaction().execute(async (transaction) => {
    const customer = await sql<{ id: string }>`
      select id from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
        and status not in ('MERGED', 'ANONYMIZED')
      for update
    `.execute(transaction);
    if (!customer.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');

    const targetAddress = await sql<{ id: string }>`
      select id from customers.customer_addresses
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and id = ${input.addressId} and status = 'ACTIVE'
      for update
    `.execute(transaction);
    if (!targetAddress.rows[0])
      throw new CustomerDomainError('NOT_FOUND', 'Customer address was not found.');

    await sql`
      update customers.customer_addresses
      set is_default = (id = ${input.addressId}), version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and customer_id = ${input.customerId}
        and status = 'ACTIVE'
    `.execute(transaction);

    await sql`
      update customers.customers set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);

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
