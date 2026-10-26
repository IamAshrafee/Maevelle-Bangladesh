import { sql, type Kysely } from 'kysely';
import type { CrmAnalyticsDto, CustomerCustomFieldDefinitionDto } from '@maevelle/contracts';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { CustomerDomainError } from '../customers.js';

type Db = Kysely<DatabaseSchema>;
type CustomFieldType = CustomerCustomFieldDefinitionDto['valueType'];

function validateCustomValue(
  definition: {
    value_type: CustomFieldType;
    choices: string[];
    validation: Record<string, unknown>;
  },
  value: unknown,
): void {
  const fail = (message: string): never => {
    throw new CustomerDomainError('VALIDATION_FAILED', message);
  };
  if (definition.value_type === 'TEXT') {
    if (typeof value !== 'string') fail('Custom field requires text.');
    const textValue = value as string;
    const minLength = definition.validation.minLength;
    const maxLength = definition.validation.maxLength;
    if (typeof minLength === 'number' && textValue.length < minLength)
      fail(`Custom field must contain at least ${minLength} characters.`);
    if (typeof maxLength === 'number' && textValue.length > maxLength)
      fail(`Custom field may contain at most ${maxLength} characters.`);
    return;
  }
  if (definition.value_type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      fail('Custom field requires a finite number.');
    const numberValue = value as number;
    const minimum = definition.validation.minimum;
    const maximum = definition.validation.maximum;
    if (typeof minimum === 'number' && numberValue < minimum)
      fail(`Custom field must be at least ${minimum}.`);
    if (typeof maximum === 'number' && numberValue > maximum)
      fail(`Custom field must be at most ${maximum}.`);
    return;
  }
  if (definition.value_type === 'BOOLEAN') {
    if (typeof value !== 'boolean') fail('Custom field requires true or false.');
    return;
  }
  if (definition.value_type === 'DATE') {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf())
    )
      fail('Custom field requires an ISO date.');
    return;
  }
  if (definition.value_type === 'SINGLE_CHOICE') {
    if (typeof value !== 'string' || !definition.choices.includes(value))
      fail('Custom field choice is not allowed.');
    return;
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !definition.choices.includes(item))
  )
    fail('Custom field choices contain an unsupported value.');
}

function definitionDto(row: {
  id: string;
  field_key: string;
  label: string;
  description: string | null;
  value_type: CustomFieldType;
  choices: string[];
  validation: Record<string, unknown>;
  is_required: boolean;
  is_searchable: boolean;
  edit_capability: string;
  schema_version: string;
  status: CustomerCustomFieldDefinitionDto['status'];
}): CustomerCustomFieldDefinitionDto {
  return {
    id: row.id,
    key: row.field_key,
    label: row.label,
    description: row.description,
    valueType: row.value_type,
    choices: row.choices,
    validation: row.validation,
    isRequired: row.is_required,
    isSearchable: row.is_searchable,
    editCapability: row.edit_capability,
    schemaVersion: Number(row.schema_version),
    status: row.status,
  };
}

export async function listCustomerCustomFieldDefinitions(
  db: Db,
  organizationId: string,
): Promise<readonly CustomerCustomFieldDefinitionDto[]> {
  const result = await sql<
    Parameters<typeof definitionDto>[0]
  >`select id,field_key,label,description,value_type,choices,validation,is_required,
    is_searchable,edit_capability,schema_version::text,status from customers.customer_custom_field_definitions
    where organization_id=${organizationId} order by case when status='ACTIVE' then 0 else 1 end,label,id`.execute(
    db,
  );
  return result.rows.map(definitionDto);
}

export async function createCustomerCustomFieldDefinition(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    key: string;
    label: string;
    description?: string;
    valueType: CustomFieldType;
    choices?: readonly string[];
    validation?: Record<string, unknown>;
    isRequired?: boolean;
    isSearchable?: boolean;
    editCapability?: string;
  },
): Promise<CustomerCustomFieldDefinitionDto> {
  const key = input.key.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(key) || !input.label.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Custom field key or label is invalid.');
  const choices = [...new Set((input.choices ?? []).map((item) => item.trim()).filter(Boolean))];
  if (
    (input.valueType === 'SINGLE_CHOICE' || input.valueType === 'MULTI_CHOICE') &&
    choices.length === 0
  )
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'Choice fields require at least one allowed choice.',
    );
  if (choices.length > 100)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'A custom field may have at most 100 choices.',
    );
  const result = await sql<
    Parameters<typeof definitionDto>[0]
  >`insert into customers.customer_custom_field_definitions(organization_id,field_key,label,
    description,value_type,choices,validation,is_required,is_searchable,edit_capability,created_by_actor_id)
    values(${input.organizationId},${key},${input.label.trim()},${input.description?.trim() || null},${input.valueType},${JSON.stringify(choices)}::jsonb,
      ${JSON.stringify(input.validation ?? {})}::jsonb,${input.isRequired ?? false},${input.isSearchable ?? false},${input.editCapability ?? 'customers.manage'},${input.actorId})
    returning id,field_key,label,description,value_type,choices,validation,is_required,is_searchable,edit_capability,schema_version::text,status`.execute(
    db,
  );
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.custom_field.created',
    targetType: 'customers.custom_field_definition',
    targetId: result.rows[0]!.id,
  });
  return definitionDto(result.rows[0]!);
}

export async function setCustomerCustomFieldValue(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    fieldDefinitionId: string;
    value: unknown;
    capabilities: readonly string[];
  },
): Promise<void> {
  const definitionResult = await sql<{
    value_type: CustomFieldType;
    choices: string[];
    validation: Record<string, unknown>;
    schema_version: string;
    edit_capability: string;
  }>`
    select d.value_type,d.choices,d.validation,d.schema_version::text,d.edit_capability
    from customers.customer_custom_field_definitions d join customers.customers c on c.organization_id=d.organization_id and c.id=${input.customerId}
    where d.organization_id=${input.organizationId} and d.id=${input.fieldDefinitionId} and d.status='ACTIVE' and c.status not in ('MERGED','ANONYMIZED')`.execute(
    db,
  );
  const definition = definitionResult.rows[0];
  if (!definition)
    throw new CustomerDomainError('NOT_FOUND', 'Customer or custom field was not found.');
  if (!input.capabilities.includes(definition.edit_capability)) {
    throw new CustomerDomainError(
      'FORBIDDEN',
      `Editing this field requires ${definition.edit_capability}.`,
    );
  }
  validateCustomValue(definition, input.value);
  await sql`insert into customers.customer_custom_field_values(organization_id,customer_id,field_definition_id,schema_version,value,updated_by_actor_id)
    values(${input.organizationId},${input.customerId},${input.fieldDefinitionId},${Number(definition.schema_version)},${JSON.stringify(input.value)}::jsonb,${input.actorId})
    on conflict(organization_id,customer_id,field_definition_id) do update set schema_version=excluded.schema_version,value=excluded.value,
      updated_by_actor_id=excluded.updated_by_actor_id,updated_at=now()`.execute(db);
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.custom_field.updated',
    targetType: 'customers.customer',
    targetId: input.customerId,
    metadata: {
      fieldDefinitionId: input.fieldDefinitionId,
      schemaVersion: Number(definition.schema_version),
    },
  });
}

export async function getCrmAnalytics(
  db: Db,
  organizationId: string,
  filters: {
    from?: Date;
    to?: Date;
    lifecycleStage?: string;
    source?: string;
    segmentId?: string;
  } = {},
): Promise<CrmAnalyticsDto> {
  const customerScope = sql`c.organization_id=${organizationId} and c.status not in ('MERGED','ANONYMIZED')
    and (${filters.from ?? null}::timestamptz is null or c.created_at>=${filters.from ?? null})
    and (${filters.to ?? null}::timestamptz is null or c.created_at<=${filters.to ?? null})
    and (${filters.lifecycleStage ?? null}::text is null or c.lifecycle_stage=${filters.lifecycleStage ?? null})
    and (${filters.source ?? null}::text is null or c.first_source=${filters.source ?? null})
    and (${filters.segmentId ?? null}::uuid is null or exists(select 1 from customers.customer_segment_memberships membership
      where membership.organization_id=c.organization_id and membership.customer_id=c.id and membership.segment_id=${filters.segmentId ?? null}::uuid))`;
  const [totals, lifecycle, sources, commerce, cohorts] = await Promise.all([
    sql<{
      total_customers: number;
      verified_customers: number;
      unlinked_contacts: number;
      duplicate_candidates: number;
      open_follow_ups: number;
      overdue_follow_ups: number;
      missing_contact: number;
      unverified_contact: number;
      without_owner: number;
    }>`select
      (select count(*)::int from customers.customers c where ${customerScope}) total_customers,
      (select count(distinct c.id)::int from customers.customers c where ${customerScope} and
        (exists(select 1 from customers.customer_phones p where p.organization_id=c.organization_id and p.customer_id=c.id and p.verification_status='VERIFIED') or
         exists(select 1 from customers.customer_emails e where e.organization_id=c.organization_id and e.customer_id=c.id and e.verification_status='VERIFIED') or
         exists(select 1 from customers.customer_identity_links l where l.organization_id=c.organization_id and l.customer_id=c.id and l.status='LINKED' and l.assurance in ('MEDIUM','HIGH')))) verified_customers,
      (select count(*)::int from messaging.contacts m where m.organization_id=${organizationId} and m.customer_id is null) unlinked_contacts,
      (select count(*)::int from customers.customer_duplicate_candidates d where d.organization_id=${organizationId} and d.status='OPEN') duplicate_candidates,
      (select count(*)::int from customers.customer_follow_ups f join customers.customers c on c.organization_id=f.organization_id and c.id=f.customer_id where ${customerScope} and f.status='OPEN') open_follow_ups,
      (select count(*)::int from customers.customer_follow_ups f join customers.customers c on c.organization_id=f.organization_id and c.id=f.customer_id where ${customerScope} and f.status='OPEN' and f.due_at<now()) overdue_follow_ups,
      (select count(*)::int from customers.customers c where ${customerScope} and
        not exists(select 1 from customers.customer_phones p where p.organization_id=c.organization_id and p.customer_id=c.id) and
        not exists(select 1 from customers.customer_emails e where e.organization_id=c.organization_id and e.customer_id=c.id)) missing_contact,
      (select count(distinct c.id)::int from customers.customers c where ${customerScope} and
        (exists(select 1 from customers.customer_phones p where p.organization_id=c.organization_id and p.customer_id=c.id) or exists(select 1 from customers.customer_emails e where e.organization_id=c.organization_id and e.customer_id=c.id)) and
        not exists(select 1 from customers.customer_phones p where p.organization_id=c.organization_id and p.customer_id=c.id and p.verification_status='VERIFIED') and
        not exists(select 1 from customers.customer_emails e where e.organization_id=c.organization_id and e.customer_id=c.id and e.verification_status='VERIFIED')) unverified_contact,
      (select count(*)::int from customers.customers c where ${customerScope} and c.relationship_owner_membership_id is null) without_owner`.execute(
      db,
    ),
    sql<{
      stage: CrmAnalyticsDto['lifecycleDistribution'][number]['stage'];
      count: number;
    }>`select c.lifecycle_stage stage,count(*)::int count from customers.customers c
      where ${customerScope} group by c.lifecycle_stage order by c.lifecycle_stage`.execute(db),
    sql<{
      source: string;
      count: number;
    }>`select c.first_source source,count(*)::int count from customers.customers c
      where ${customerScope} group by c.first_source order by count desc,c.first_source`.execute(
      db,
    ),
    sql<{
      first_time_buyers: number;
      repeat_buyers: number;
      completed_order_count: number;
      completed_revenue: string;
      completed_refunds: string;
      average_order_value: string;
      average_orders_per_buyer: string;
    }>`with customer_orders as (
        select c.id,count(o.id) filter(where o.order_status='COMPLETED' and o.currency_code='BDT')::int completed_count,
          coalesce(sum(o.total_amount) filter(where o.order_status='COMPLETED' and o.currency_code='BDT'),0) completed_value
        from customers.customers c left join orders.orders o on o.organization_id=c.organization_id and o.customer_id=c.id
        where ${customerScope} group by c.id
      ), completed_refunds as (
        select coalesce(sum(r.amount),0) amount from payments.refunds r
        join orders.orders o on o.organization_id=r.organization_id and o.id=r.order_id
        where r.organization_id=${organizationId} and r.status='COMPLETED' and r.currency_code='BDT'
          and o.customer_id in (select id from customer_orders)
      )
      select count(*) filter(where completed_count=1)::int first_time_buyers,
        count(*) filter(where completed_count>=2)::int repeat_buyers,
        coalesce(sum(completed_count),0)::int completed_order_count,
        coalesce(sum(completed_value),0)::text completed_revenue,
        (select amount::text from completed_refunds) completed_refunds,
        case when sum(completed_count)>0 then (sum(completed_value)/sum(completed_count))::text else '0' end average_order_value,
        case when count(*) filter(where completed_count>0)>0 then (sum(completed_count)::numeric/count(*) filter(where completed_count>0))::text else '0' end average_orders_per_buyer
      from customer_orders`.execute(db),
    sql<{
      month: string;
      new_customers: number;
      customers_with_completed_orders: number;
      repeat_buyers: number;
    }>`with months as (
        select generate_series(date_trunc('month',now())-interval '11 months',date_trunc('month',now()),interval '1 month') as cohort_month
      ), cohorts as (
        select date_trunc('month',c.created_at) as cohort_month,c.id,count(o.id) filter(where o.order_status='COMPLETED')::int completed_count
        from customers.customers c left join orders.orders o on o.organization_id=c.organization_id and o.customer_id=c.id
        where ${customerScope}
          and c.created_at>=date_trunc('month',now())-interval '11 months'
        group by date_trunc('month',c.created_at),c.id
      )
      select to_char(m.cohort_month,'YYYY-MM') as month,count(c.id)::int new_customers,
        count(c.id) filter(where c.completed_count>0)::int customers_with_completed_orders,
        count(c.id) filter(where c.completed_count>=2)::int repeat_buyers
      from months m left join cohorts c on c.cohort_month=m.cohort_month group by m.cohort_month order by m.cohort_month`.execute(
      db,
    ),
  ]);
  const row = totals.rows[0]!;
  const commerceRow = commerce.rows[0]!;
  const buyers = commerceRow.first_time_buyers + commerceRow.repeat_buyers;
  const completedRevenue = Number(commerceRow.completed_revenue);
  const completedRefunds = Number(commerceRow.completed_refunds);
  return {
    totalCustomers: row.total_customers,
    verifiedCustomers: row.verified_customers,
    unlinkedChannelContacts: row.unlinked_contacts,
    openDuplicateCandidates: row.duplicate_candidates,
    openFollowUps: row.open_follow_ups,
    overdueFollowUps: row.overdue_follow_ups,
    identityCoveragePercent:
      row.total_customers === 0
        ? 0
        : Math.round((row.verified_customers / row.total_customers) * 100),
    commerce: {
      firstTimeBuyers: commerceRow.first_time_buyers,
      repeatBuyers: commerceRow.repeat_buyers,
      repeatBuyerRatePercent:
        buyers === 0 ? 0 : Math.round((commerceRow.repeat_buyers / buyers) * 100),
      completedOrderCount: commerceRow.completed_order_count,
      completedRevenueBdt: completedRevenue.toFixed(4),
      completedRefundsBdt: completedRefunds.toFixed(4),
      netCompletedRevenueBdt: (completedRevenue - completedRefunds).toFixed(4),
      averageOrderValueBdt: Number(commerceRow.average_order_value).toFixed(4),
      averageCompletedOrdersPerBuyer: Number(
        Number(commerceRow.average_orders_per_buyer).toFixed(2),
      ),
    },
    acquisitionCohorts: cohorts.rows.map((item) => ({
      month: item.month,
      newCustomers: item.new_customers,
      customersWithCompletedOrders: item.customers_with_completed_orders,
      repeatBuyers: item.repeat_buyers,
    })),
    lifecycleDistribution: lifecycle.rows,
    sourceDistribution: sources.rows,
    dataQuality: {
      missingContactCount: row.missing_contact,
      unverifiedContactCount: row.unverified_contact,
      profilesWithoutOwnerCount: row.without_owner,
    },
  };
}

export async function createCustomerPrivacyRequest(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    requestType: 'ACCESS' | 'EXPORT' | 'CORRECTION' | 'ANONYMIZATION' | 'RESTRICTION';
    reason: string;
    requesterReference?: string;
    assignedMembershipId?: string;
    dueAt?: string;
  },
): Promise<{ id: string; status: string; createdAt: string }> {
  if (!input.reason.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Privacy request reason is required.');
  const result = await sql<{
    id: string;
    status: string;
    created_at: Date;
  }>`insert into customers.customer_privacy_requests(organization_id,customer_id,request_type,reason,
    requester_reference,assigned_membership_id,due_at,created_by_actor_id,updated_by_actor_id)
    select ${input.organizationId},c.id,${input.requestType},${input.reason.trim()},${input.requesterReference ?? null},${input.assignedMembershipId ?? null}::uuid,
      ${input.dueAt ? new Date(input.dueAt) : null},${input.actorId},${input.actorId} from customers.customers c
    where c.organization_id=${input.organizationId} and c.id=${input.customerId} returning id,status,created_at`.execute(
    db,
  );
  if (!result.rows[0]) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.privacy_request.created',
    targetType: 'customers.privacy_request',
    targetId: result.rows[0].id,
    reason: input.reason,
    metadata: { customerId: input.customerId, requestType: input.requestType },
  });
  return {
    id: result.rows[0].id,
    status: result.rows[0].status,
    createdAt: result.rows[0].created_at.toISOString(),
  };
}

export async function listCustomerPrivacyRequests(
  db: Db,
  input: {
    organizationId: string;
    status?:
      | 'OPEN'
      | 'IDENTITY_VERIFICATION_REQUIRED'
      | 'IN_PROGRESS'
      | 'COMPLETED'
      | 'REJECTED'
      | 'CANCELLED';
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const result = await sql<{
    id: string;
    customer_id: string;
    customer_number: string;
    display_name: string;
    request_type: string;
    status: string;
    requester_reference: string | null;
    reason: string;
    resolution_notes: string | null;
    due_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    version: string;
    total_count: string;
  }>`select r.id,r.customer_id,c.customer_number,c.display_name,r.request_type,r.status,r.requester_reference,r.reason,r.resolution_notes,r.due_at,r.completed_at,r.created_at,r.updated_at,r.version::text,count(*) over()::text total_count
    from customers.customer_privacy_requests r join customers.customers c on c.organization_id=r.organization_id and c.id=r.customer_id
    where r.organization_id=${input.organizationId} and (${input.status ?? null}::text is null or r.status=${input.status ?? null})
    order by case when r.status in ('OPEN','IDENTITY_VERIFICATION_REQUIRED','IN_PROGRESS') then 0 else 1 end,r.due_at nulls last,r.created_at,r.id
    limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(db);
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerNumber: row.customer_number,
      displayName: row.display_name,
      requestType: row.request_type,
      status: row.status,
      requesterReference: row.requester_reference,
      reason: row.reason,
      resolutionNotes: row.resolution_notes,
      dueAt: row.due_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    })),
    page,
    pageSize,
    totalItems: Number(result.rows[0]?.total_count ?? 0),
  };
}

export async function updateCustomerPrivacyRequest(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    expectedVersion: number;
    status:
      'IDENTITY_VERIFICATION_REQUIRED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
    resolutionNotes: string;
  },
): Promise<void> {
  if (!input.resolutionNotes.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Resolution notes are required.');
  await db.transaction().execute(async (tx) => {
    const current = await sql<{
      status: string;
      version: string;
      customer_id: string;
    }>`select status,version::text,customer_id from customers.customer_privacy_requests where organization_id=${input.organizationId} and id=${input.requestId} for update`.execute(
      tx,
    );
    const row = current.rows[0];
    if (!row) throw new CustomerDomainError('NOT_FOUND', 'Privacy request was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Privacy request has changed; reload before updating.',
      );
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.status))
      throw new CustomerDomainError('CONFLICT', 'A closed privacy request cannot be changed.');
    await sql`update customers.customer_privacy_requests set status=${input.status},resolution_notes=${input.resolutionNotes.trim()},
      completed_at=case when ${input.status} in ('COMPLETED','REJECTED','CANCELLED') then now() else null end,
      updated_by_actor_id=${input.actorId},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.requestId}`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.privacy_request.updated',
      targetType: 'customers.privacy_request',
      targetId: input.requestId,
      reason: input.resolutionNotes,
      metadata: {
        customerId: row.customer_id,
        previousStatus: row.status,
        newStatus: input.status,
      },
    });
  });
}

/**
 * Builds a data-subject bundle from customer-owned records only. Internal notes,
 * risk restrictions, audit events, provider payloads, staff-only messages, and
 * identity-review evidence are deliberately excluded.
 */
export async function exportCustomerDataSubjectBundle(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    requestId: string;
    reason: string;
  },
): Promise<{ fileName: string; bundle: Record<string, unknown> }> {
  if (!input.reason.trim()) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'An export reason is required.');
  }
  return db.transaction().execute(async (transaction) => {
    const requestResult = await sql<{
      customer_id: string;
      customer_number: string;
      request_type: string;
      status: string;
    }>`select r.customer_id,c.customer_number,r.request_type,r.status
      from customers.customer_privacy_requests r
      join customers.customers c on c.organization_id=r.organization_id and c.id=r.customer_id
      where r.organization_id=${input.organizationId} and r.id=${input.requestId}
      for share`.execute(transaction);
    const request = requestResult.rows[0];
    if (!request) throw new CustomerDomainError('NOT_FOUND', 'Privacy request was not found.');
    if (!['ACCESS', 'EXPORT'].includes(request.request_type)) {
      throw new CustomerDomainError(
        'CONFLICT',
        'Only access or export requests can produce a data bundle.',
      );
    }
    if (request.status !== 'IN_PROGRESS') {
      throw new CustomerDomainError(
        'CONFLICT',
        'Identity verification must be completed and the request moved to in progress before export.',
      );
    }

    const result = await sql<{ bundle: Record<string, unknown> }>`
      select jsonb_build_object(
        'schemaVersion', 1,
        'generatedAt', now(),
        'customer', (
          select to_jsonb(c) - 'organization_id' - 'profile_provenance'
          from customers.customers c
          where c.organization_id=${input.organizationId} and c.id=${request.customer_id}
        ),
        'phones', coalesce((
          select jsonb_agg(to_jsonb(p) - 'organization_id' - 'customer_id' order by p.created_at,p.id)
          from customers.customer_phones p where p.organization_id=${input.organizationId} and p.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'emails', coalesce((
          select jsonb_agg(to_jsonb(e) - 'organization_id' - 'customer_id' order by e.created_at,e.id)
          from customers.customer_emails e where e.organization_id=${input.organizationId} and e.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'addresses', coalesce((
          select jsonb_agg(to_jsonb(a) - 'organization_id' - 'customer_id' order by a.created_at,a.id)
          from customers.customer_addresses a where a.organization_id=${input.organizationId} and a.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'preferences', coalesce((
          select jsonb_agg(jsonb_build_object('key',p.preference_key,'value',p.value,'source',p.source,'confidence',p.confidence,'updatedAt',p.updated_at) order by p.preference_key)
          from customers.customer_preferences p where p.organization_id=${input.organizationId} and p.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'consents', coalesce((
          select jsonb_agg(jsonb_build_object('purpose',c.purpose,'channel',c.channel,'status',c.status,'lawfulBasis',c.lawful_basis,'source',c.source,'effectiveAt',c.effective_at) order by c.effective_at,c.id)
          from customers.customer_consents c where c.organization_id=${input.organizationId} and c.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'customFields', coalesce((
          select jsonb_agg(jsonb_build_object('key',d.field_key,'label',d.label,'value',v.value,'updatedAt',v.updated_at) order by d.label,d.id)
          from customers.customer_custom_field_values v join customers.customer_custom_field_definitions d on d.organization_id=v.organization_id and d.id=v.field_definition_id
          where v.organization_id=${input.organizationId} and v.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'channelIdentities', coalesce((
          select jsonb_agg(jsonb_build_object('provider',l.provider,'externalSubjectId',l.external_subject_id,'displayName',i.display_name,'username',i.username,'status',l.status,'linkedAt',l.linked_at,'revokedAt',l.revoked_at) order by l.created_at,l.id)
          from customers.customer_identity_links l join messaging.contact_identities i on i.organization_id=l.organization_id and i.id=l.contact_identity_id
          where l.organization_id=${input.organizationId} and l.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'orders', coalesce((
          select jsonb_agg((to_jsonb(o) - 'organization_id' - 'customer_id') || jsonb_build_object(
            'lines',coalesce((select jsonb_agg(to_jsonb(line) - 'organization_id' - 'order_id' order by line.created_at,line.id) from orders.order_lines line where line.organization_id=o.organization_id and line.order_id=o.id),'[]'::jsonb),
            'addresses',coalesce((select jsonb_agg(to_jsonb(address) - 'organization_id' - 'order_id' order by address.created_at,address.id) from orders.order_addresses address where address.organization_id=o.organization_id and address.order_id=o.id),'[]'::jsonb)
          ) order by o.created_at,o.id)
          from orders.orders o where o.organization_id=${input.organizationId} and o.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object('paymentNumber',p.payment_number,'currencyCode',p.currency_code,'amount',p.amount,'status',p.status,'confirmedAt',p.confirmed_at,'orders',
            coalesce((select jsonb_agg(jsonb_build_object('orderNumber',a.order_number_snapshot,'amount',a.amount) order by a.created_at,a.id) from payments.payment_allocations a where a.organization_id=p.organization_id and a.payment_id=p.id),'[]'::jsonb)) order by p.confirmed_at,p.id)
          from payments.payments p where p.organization_id=${input.organizationId} and exists(select 1 from payments.payment_allocations a join orders.orders o on o.organization_id=a.organization_id and o.id=a.order_id where a.organization_id=p.organization_id and a.payment_id=p.id and o.customer_id=${request.customer_id})
        ), '[]'::jsonb),
        'refunds', coalesce((
          select jsonb_agg(jsonb_build_object('refundNumber',r.refund_number,'orderId',r.order_id,'currencyCode',r.currency_code,'amount',r.amount,'status',r.status,'reasonCode',r.reason_code,'reasonText',r.reason_text,'requestedAt',r.requested_at,'completedAt',r.completed_at) order by r.requested_at,r.id)
          from payments.refunds r join orders.orders o on o.organization_id=r.organization_id and o.id=r.order_id
          where r.organization_id=${input.organizationId} and o.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'returns', coalesce((
          select jsonb_agg(to_jsonb(r) - 'organization_id' - 'customer_id' order by r.created_at,r.id)
          from returns.return_cases r where r.organization_id=${input.organizationId} and r.customer_id=${request.customer_id}
        ), '[]'::jsonb),
        'conversations', coalesce((
          select jsonb_agg(jsonb_build_object('id',conversation.id,'channel',conversation.channel_kind,'subject',conversation.subject,'createdAt',conversation.created_at,
            'messages',coalesce((select jsonb_agg(jsonb_build_object('id',message.id,'sequence',message.sequence,'direction',message.direction,'senderType',message.sender_type,'messageType',message.message_type,'text',message.text_body,'createdAt',message.created_at,'editedAt',message.edited_at,'retractedAt',message.retracted_at) order by message.sequence) from messaging.messages message where message.organization_id=conversation.organization_id and message.conversation_id=conversation.id and message.direction<>'INTERNAL'),'[]'::jsonb)) order by conversation.created_at,conversation.id)
          from messaging.conversations conversation join messaging.contacts contact on contact.organization_id=conversation.organization_id and contact.id=conversation.contact_id
          where conversation.organization_id=${input.organizationId} and contact.customer_id=${request.customer_id}
        ), '[]'::jsonb)
      ) bundle
    `.execute(transaction);
    const bundle = result.rows[0]?.bundle;
    if (!bundle) throw new CustomerDomainError('NOT_FOUND', 'Customer data was not found.');
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.data_subject_export.completed',
      targetType: 'customers.privacy_request',
      targetId: input.requestId,
      reason: input.reason,
      metadata: { customerId: request.customer_id, schemaVersion: 1 },
    });
    return {
      fileName: `maevelle-customer-${request.customer_number}-${new Date().toISOString().slice(0, 10)}.json`,
      bundle,
    };
  });
}

export async function createCustomerSavedView(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    membershipId: string;
    name: string;
    visibility: 'PERSONAL' | 'ORGANIZATION';
    filters: Record<string, unknown>;
  },
): Promise<{ id: string; name: string; visibility: string; filters: Record<string, unknown> }> {
  if (!input.name.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Saved view name is required.');
  const result = await sql<{
    id: string;
    name: string;
    visibility: string;
    filters: Record<string, unknown>;
  }>`insert into customers.customer_saved_views(
    organization_id,owner_membership_id,name,visibility,filters,created_by_actor_id)
    values(${input.organizationId},${input.visibility === 'PERSONAL' ? input.membershipId : null}::uuid,${input.name.trim()},${input.visibility},${JSON.stringify(input.filters)}::jsonb,${input.actorId})
    returning id,name,visibility,filters`.execute(db);
  return result.rows[0]!;
}

export async function listCustomerSavedViews(
  db: Db,
  input: { organizationId: string; membershipId: string },
) {
  const result = await sql<{
    id: string;
    name: string;
    visibility: 'PERSONAL' | 'ORGANIZATION';
    filters: Record<string, unknown>;
    version: string;
  }>`
    select id,name,visibility,filters,version::text from customers.customer_saved_views where organization_id=${input.organizationId}
    and (visibility='ORGANIZATION' or owner_membership_id=${input.membershipId}) order by visibility desc,name,id`.execute(
    db,
  );
  return result.rows.map((row) => ({ ...row, version: Number(row.version) }));
}

export async function applyCustomerBulkAction(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerIds: readonly string[];
    action: 'ADD_TAG' | 'REMOVE_TAG' | 'ASSIGN_OWNER';
    tagId?: string;
    ownerMembershipId?: string | null;
    reason: string;
  },
): Promise<{
  succeeded: readonly string[];
  failed: readonly { customerId: string; code: string }[];
}> {
  const ids = [...new Set(input.customerIds)];
  if (ids.length === 0 || ids.length > 250)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'Bulk actions require 1 to 250 unique customers.',
    );
  if (!input.reason.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'A bulk-action reason is required.');
  return db.transaction().execute(async (transaction) => {
    const eligible = await sql<{
      id: string;
    }>`select id from customers.customers where organization_id=${input.organizationId}
      and id=any(${ids}::uuid[]) and status not in ('MERGED','ANONYMIZED') for update`.execute(
      transaction,
    );
    const succeeded = eligible.rows.map((row) => row.id);
    const succeededSet = new Set(succeeded);
    const failed = ids
      .filter((id) => !succeededSet.has(id))
      .map((customerId) => ({ customerId, code: 'NOT_FOUND_OR_READ_ONLY' }));
    if (input.action === 'ADD_TAG') {
      if (!input.tagId) throw new CustomerDomainError('VALIDATION_FAILED', 'Tag is required.');
      await sql`insert into customers.customer_tag_assignments(organization_id,customer_id,tag_id)
        select ${input.organizationId},customer.id,tag.id from customers.customers customer join customers.customer_tags tag on tag.organization_id=customer.organization_id and tag.id=${input.tagId}
        where customer.organization_id=${input.organizationId} and customer.id=any(${succeeded}::uuid[]) on conflict do nothing`.execute(
        transaction,
      );
    } else if (input.action === 'REMOVE_TAG') {
      if (!input.tagId) throw new CustomerDomainError('VALIDATION_FAILED', 'Tag is required.');
      await sql`delete from customers.customer_tag_assignments where organization_id=${input.organizationId} and customer_id=any(${succeeded}::uuid[]) and tag_id=${input.tagId}`.execute(
        transaction,
      );
    } else {
      await sql`update customers.customers set relationship_owner_membership_id=${input.ownerMembershipId ?? null}::uuid,
        relationship_status=case when ${input.ownerMembershipId ?? null}::uuid is null then 'UNASSIGNED' else 'ACTIVE' end,
        version=version+1,updated_at=now() where organization_id=${input.organizationId} and id=any(${succeeded}::uuid[])`.execute(
        transaction,
      );
    }
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.bulk_action.executed',
      targetType: 'customers.bulk_action',
      reason: input.reason,
      metadata: { action: input.action, customerIds: succeeded, failed },
    });
    return { succeeded, failed };
  });
}

export async function listDuplicateReviewCandidates(
  db: Db,
  input: { organizationId: string; page?: number; pageSize?: number },
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const result = await sql<{
    id: string;
    customer_a_id: string;
    customer_b_id: string;
    confidence: string;
    signals: string[];
    created_at: Date;
    customer_a_number: string;
    customer_a_name: string;
    customer_b_number: string;
    customer_b_name: string;
    total_count: string;
  }>`select d.id,d.customer_a_id,d.customer_b_id,d.confidence::text,d.signals,d.created_at,
      a.customer_number customer_a_number,a.display_name customer_a_name,b.customer_number customer_b_number,b.display_name customer_b_name,
      count(*) over()::text total_count
    from customers.customer_duplicate_candidates d
    join customers.customers a on a.organization_id=d.organization_id and a.id=d.customer_a_id
    join customers.customers b on b.organization_id=d.organization_id and b.id=d.customer_b_id
    where d.organization_id=${input.organizationId} and d.status='OPEN'
    order by d.confidence desc,d.created_at,d.id limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
    db,
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      confidence: row.confidence,
      signals: row.signals,
      createdAt: row.created_at.toISOString(),
      customerA: {
        id: row.customer_a_id,
        customerNumber: row.customer_a_number,
        displayName: row.customer_a_name,
      },
      customerB: {
        id: row.customer_b_id,
        customerNumber: row.customer_b_number,
        displayName: row.customer_b_name,
      },
    })),
    page,
    pageSize,
    totalItems: Number(result.rows[0]?.total_count ?? 0),
  };
}

export async function dismissDuplicateReviewCandidate(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    candidateId: string;
    reason: string;
  },
): Promise<void> {
  if (!input.reason.trim())
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'A duplicate-resolution reason is required.',
    );
  const result = await sql<{
    customer_a_id: string;
    customer_b_id: string;
  }>`update customers.customer_duplicate_candidates set status='DISMISSED',resolved_at=now()
    where organization_id=${input.organizationId} and id=${input.candidateId} and status='OPEN' returning customer_a_id,customer_b_id`.execute(
    db,
  );
  if (!result.rows[0])
    throw new CustomerDomainError('NOT_FOUND', 'Open duplicate candidate was not found.');
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.duplicate.dismissed',
    targetType: 'customers.duplicate_candidate',
    targetId: input.candidateId,
    reason: input.reason,
    metadata: result.rows[0],
  });
}

export async function listCustomerMergeHistory(
  db: Db,
  input: { organizationId: string; page?: number; pageSize?: number },
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const result = await sql<{
    id: string;
    source_customer_id: string;
    source_customer_number: string;
    source_customer_name: string;
    target_customer_id: string;
    target_customer_number: string;
    target_customer_name: string;
    reason: string | null;
    conflict_snapshot: Record<string, unknown>;
    created_by: string | null;
    created_at: Date;
    total_count: string;
  }>`select merge.id,merge.source_customer_id,
      source.customer_number source_customer_number,source.display_name source_customer_name,
      merge.target_customer_id,target.customer_number target_customer_number,target.display_name target_customer_name,
      merge.reason,merge.conflict_snapshot,merge.created_by,merge.created_at,count(*) over()::text total_count
    from customers.customer_merges merge
    join customers.customers source on source.organization_id=merge.organization_id and source.id=merge.source_customer_id
    join customers.customers target on target.organization_id=merge.organization_id and target.id=merge.target_customer_id
    where merge.organization_id=${input.organizationId}
    order by merge.created_at desc,merge.id desc
    limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(db);
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      sourceCustomer: {
        id: row.source_customer_id,
        customerNumber: row.source_customer_number,
        displayName: row.source_customer_name,
      },
      targetCustomer: {
        id: row.target_customer_id,
        customerNumber: row.target_customer_number,
        displayName: row.target_customer_name,
      },
      reason: row.reason,
      conflictSnapshot: row.conflict_snapshot,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    })),
    page,
    pageSize,
    totalItems: Number(result.rows[0]?.total_count ?? 0),
  };
}
