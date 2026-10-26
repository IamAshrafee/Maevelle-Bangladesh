import { sql, type Kysely, type RawBuilder } from 'kysely';
import type {
  CustomerSegmentConditionDto,
  CustomerSegmentDto,
  CustomerSegmentRuleDto,
  CustomerSummaryDto,
} from '@maevelle/contracts';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { CustomerDomainError } from '../customers.js';

type Db = Kysely<DatabaseSchema>;
const allowedLifecycleStages = new Set([
  'NEW_CONTACT',
  'PROSPECT',
  'ENGAGED_PROSPECT',
  'FIRST_TIME_BUYER',
  'REPEAT_CUSTOMER',
  'LOYAL_CUSTOMER',
  'INACTIVE_CUSTOMER',
  'RE_ENGAGED_CUSTOMER',
]);
const allowedStatuses = new Set(['ACTIVE', 'INACTIVE', 'BLOCKED']);

function validateCondition(condition: CustomerSegmentConditionDto): void {
  if (condition.field === 'lifecycleStage') {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (values.length === 0 || values.some((value) => !allowedLifecycleStages.has(value)))
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        'Lifecycle segment rule contains an invalid stage.',
      );
    return;
  }
  if (condition.field === 'status') {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (values.length === 0 || values.some((value) => !allowedStatuses.has(value)))
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        'Status segment rule contains an invalid customer status.',
      );
    return;
  }
  if (condition.field === 'tagId') {
    if (!/^[0-9a-f-]{36}$/i.test(condition.value))
      throw new CustomerDomainError('VALIDATION_FAILED', 'Tag rule requires a valid tag id.');
    return;
  }
  if (condition.field === 'hasVerifiedIdentity') return;
  if (!Number.isFinite(condition.value) || condition.value < 0)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      `${condition.field} rule requires a non-negative number.`,
    );
  if (condition.field !== 'netPurchaseValue' && !Number.isInteger(condition.value))
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      `${condition.field} rule requires a whole number.`,
    );
}

export function validateCustomerSegmentRule(rule: CustomerSegmentRuleDto): CustomerSegmentRuleDto {
  const all = rule.all ?? [];
  const any = rule.any ?? [];
  if (all.length + any.length === 0)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'A dynamic segment needs at least one rule.',
    );
  if (all.length + any.length > 12)
    throw new CustomerDomainError('VALIDATION_FAILED', 'A segment may contain at most 12 rules.');
  all.forEach(validateCondition);
  any.forEach(validateCondition);
  return { ...(all.length ? { all } : {}), ...(any.length ? { any } : {}) };
}

function conditionSql(condition: CustomerSegmentConditionDto): RawBuilder<unknown> {
  if (condition.field === 'lifecycleStage') {
    const values = (
      Array.isArray(condition.value) ? condition.value : [condition.value]
    ) as string[];
    return condition.operator === 'EQ'
      ? sql`scope.lifecycle_stage=${values[0]}`
      : sql`scope.lifecycle_stage=any(${values}::text[])`;
  }
  if (condition.field === 'status') {
    const values = (
      Array.isArray(condition.value) ? condition.value : [condition.value]
    ) as string[];
    return condition.operator === 'EQ'
      ? sql`scope.status=${values[0]}`
      : sql`scope.status=any(${values}::text[])`;
  }
  if (condition.field === 'tagId')
    return sql`exists(select 1 from customers.customer_tag_assignments t where t.organization_id=scope.organization_id and t.customer_id=scope.id and t.tag_id=${condition.value}::uuid)`;
  if (condition.field === 'hasVerifiedIdentity')
    return condition.value
      ? sql`scope.has_verified_identity`
      : sql`not scope.has_verified_identity`;
  const column =
    condition.field === 'completedOrderCount'
      ? sql`scope.completed_order_count`
      : condition.field === 'netPurchaseValue'
        ? sql`scope.net_purchase_value`
        : sql`scope.last_purchase_days_ago`;
  if (condition.operator === 'GTE') return sql`${column} >= ${condition.value}`;
  if (condition.operator === 'LTE') return sql`${column} <= ${condition.value}`;
  return sql`${column} = ${condition.value}`;
}

function ruleSql(rule: CustomerSegmentRuleDto): RawBuilder<unknown> {
  const all = (rule.all ?? []).map(conditionSql);
  const any = (rule.any ?? []).map(conditionSql);
  const allSql = all.length ? sql`(${sql.join(all, sql` and `)})` : sql`true`;
  const anySql = any.length ? sql`(${sql.join(any, sql` or `)})` : sql`true`;
  return sql`${allSql} and ${anySql}`;
}

function toSegment(row: {
  id: string;
  name: string;
  description: string | null;
  segment_type: CustomerSegmentDto['segmentType'];
  rule_definition: CustomerSegmentRuleDto;
  status: CustomerSegmentDto['status'];
  member_count: string;
  version: string;
  created_at: Date;
  updated_at: Date;
}): CustomerSegmentDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    segmentType: row.segment_type,
    ruleDefinition: row.rule_definition,
    status: row.status,
    memberCount: Number(row.member_count),
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createCustomerSegment(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    description?: string;
    segmentType: 'STATIC' | 'DYNAMIC';
    ruleDefinition?: CustomerSegmentRuleDto;
  },
): Promise<CustomerSegmentDto> {
  const name = input.name.trim();
  if (!name) throw new CustomerDomainError('VALIDATION_FAILED', 'Segment name is required.');
  const rule =
    input.segmentType === 'DYNAMIC'
      ? validateCustomerSegmentRule(input.ruleDefinition ?? {})
      : { all: [] };
  const result = await sql<{
    id: string;
    name: string;
    description: string | null;
    segment_type: CustomerSegmentDto['segmentType'];
    rule_definition: CustomerSegmentRuleDto;
    status: CustomerSegmentDto['status'];
    version: string;
    created_at: Date;
    updated_at: Date;
  }>`
    insert into customers.customer_segments(organization_id,name,description,segment_type,rule_definition,created_by_actor_id)
    values(${input.organizationId},${name},${input.description?.trim() || null},${input.segmentType},${JSON.stringify(rule)}::jsonb,${input.actorId})
    returning id,name,description,segment_type,rule_definition,status,version::text,created_at,updated_at`.execute(
    db,
  );
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.segment.created',
    targetType: 'customers.segment',
    targetId: result.rows[0]!.id,
    metadata: { segmentType: input.segmentType },
  });
  return toSegment({ ...result.rows[0]!, member_count: '0' });
}

export async function listCustomerSegments(
  db: Db,
  organizationId: string,
): Promise<readonly CustomerSegmentDto[]> {
  const result = await sql<
    Parameters<typeof toSegment>[0]
  >`select s.id,s.name,s.description,s.segment_type,s.rule_definition,s.status,s.version::text,
    s.created_at,s.updated_at,count(m.customer_id)::text member_count
    from customers.customer_segments s left join customers.customer_segment_memberships m on m.organization_id=s.organization_id and m.segment_id=s.id
    where s.organization_id=${organizationId} and s.status='ACTIVE'
    group by s.id order by s.name,s.id`.execute(db);
  const segments = result.rows.map(toSegment);
  return Promise.all(
    segments.map(async (segment) =>
      segment.segmentType === 'DYNAMIC'
        ? {
            ...segment,
            memberCount: (
              await listCustomerSegmentMembers(db, {
                organizationId,
                segmentId: segment.id,
                pageSize: 1,
              })
            ).totalItems,
          }
        : segment,
    ),
  );
}

const dynamicScope = sql`with scope as (
  select c.organization_id,c.id,c.customer_number,c.display_name,c.status,c.lifecycle_stage,c.created_at,c.last_purchase_at,
    count(o.id) filter(where o.order_status='COMPLETED')::int completed_order_count,
    coalesce(sum(case when o.order_status='COMPLETED' then o.total_amount else 0 end),0)::numeric net_purchase_value,
    case when c.last_purchase_at is null then 2147483647 else extract(day from now()-c.last_purchase_at)::int end last_purchase_days_ago,
    exists(select 1 from customers.customer_identity_links il where il.organization_id=c.organization_id and il.customer_id=c.id and il.status='LINKED' and il.assurance in ('MEDIUM','HIGH')) has_verified_identity,
    (select p.raw_value from customers.customer_phones p where p.organization_id=c.organization_id and p.customer_id=c.id order by p.is_primary desc,p.created_at,p.id limit 1) primary_phone,
    (select e.raw_value from customers.customer_emails e where e.organization_id=c.organization_id and e.customer_id=c.id order by e.is_primary desc,e.created_at,e.id limit 1) primary_email
  from customers.customers c
  left join orders.orders o on o.organization_id=c.organization_id and (o.customer_id=c.id or o.customer_id in(select a.alias_customer_id from customers.customer_aliases a where a.organization_id=c.organization_id and a.canonical_customer_id=c.id))
  where c.organization_id=`;

export async function listCustomerSegmentMembers(
  db: Db,
  input: {
    organizationId: string;
    segmentId: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{
  items: readonly CustomerSummaryDto[];
  page: number;
  pageSize: number;
  totalItems: number;
  explanation: readonly string[];
}> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const segmentResult = await sql<{
    segment_type: 'STATIC' | 'DYNAMIC';
    rule_definition: CustomerSegmentRuleDto;
  }>`
    select segment_type,rule_definition from customers.customer_segments where organization_id=${input.organizationId} and id=${input.segmentId} and status='ACTIVE'`.execute(
    db,
  );
  const segment = segmentResult.rows[0];
  if (!segment) throw new CustomerDomainError('NOT_FOUND', 'Customer segment was not found.');
  const predicate =
    segment.segment_type === 'DYNAMIC'
      ? ruleSql(validateCustomerSegmentRule(segment.rule_definition))
      : sql`exists(select 1 from customers.customer_segment_memberships m where m.organization_id=scope.organization_id and m.segment_id=${input.segmentId} and m.customer_id=scope.id)`;
  const result = await sql<{
    id: string;
    customer_number: string;
    display_name: string;
    status: CustomerSummaryDto['status'];
    created_at: Date;
    primary_phone: string | null;
    primary_email: string | null;
    completed_order_count: number;
    net_purchase_value: string;
    total_count: string;
  }>`${dynamicScope}${input.organizationId}
    group by c.organization_id,c.id
  ) select scope.id,scope.customer_number,scope.display_name,scope.status,scope.created_at,scope.primary_phone,scope.primary_email,
      scope.completed_order_count,scope.net_purchase_value::text,count(*) over()::text total_count
    from scope where scope.status not in ('MERGED','ANONYMIZED') and ${predicate}
    order by scope.net_purchase_value desc,scope.id limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
    db,
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      customerNumber: row.customer_number,
      displayName: row.display_name,
      status: row.status,
      version: 0,
      firstSource: 'ADMIN_CREATED',
      latestSource: 'ADMIN_CREATED',
      primaryPhone: row.primary_phone,
      primaryEmail: row.primary_email,
      orderCount: row.completed_order_count,
      totalSpend: row.net_purchase_value,
      createdAt: row.created_at.toISOString(),
    })),
    page,
    pageSize,
    totalItems: Number(result.rows[0]?.total_count ?? 0),
    explanation:
      segment.segment_type === 'DYNAMIC'
        ? ['Matches the saved validated rule definition.']
        : ['Added to this static segment by an authorized operator.'],
  };
}

export async function setStaticSegmentMembership(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    segmentId: string;
    customerId: string;
    included: boolean;
  },
): Promise<void> {
  const segment = await sql<{
    segment_type: string;
  }>`select segment_type from customers.customer_segments where organization_id=${input.organizationId} and id=${input.segmentId} and status='ACTIVE'`.execute(
    db,
  );
  if (segment.rows[0]?.segment_type !== 'STATIC')
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'Manual membership is only available for static segments.',
    );
  if (input.included) {
    const result =
      await sql`insert into customers.customer_segment_memberships(organization_id,segment_id,customer_id,membership_source,explanation)
      select ${input.organizationId},${input.segmentId},c.id,'MANUAL','["Authorized manual membership"]'::jsonb from customers.customers c
      where c.organization_id=${input.organizationId} and c.id=${input.customerId} and c.status not in ('MERGED','ANONYMIZED') on conflict do nothing`.execute(
        db,
      );
    if (Number(result.numAffectedRows) === 0) {
      const exists = await sql<{
        present: boolean;
      }>`select exists(select 1 from customers.customer_segment_memberships where organization_id=${input.organizationId} and segment_id=${input.segmentId} and customer_id=${input.customerId}) present`.execute(
        db,
      );
      if (!exists.rows[0]?.present)
        throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    }
  } else {
    await sql`delete from customers.customer_segment_memberships where organization_id=${input.organizationId} and segment_id=${input.segmentId} and customer_id=${input.customerId} and membership_source='MANUAL'`.execute(
      db,
    );
  }
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.included ? 'customers.segment.member_added' : 'customers.segment.member_removed',
    targetType: 'customers.segment',
    targetId: input.segmentId,
    metadata: { customerId: input.customerId },
  });
}
