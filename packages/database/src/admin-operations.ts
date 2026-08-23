import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

const resourceKeys = new Set([
  'orders',
  'inventory',
  'customers',
  'payments',
  'deliveries',
  'returns',
  'purchases',
  'shipments',
]);

export class AdminOperationsError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function getOperationsOverview(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [payments, deliveries, returns, jobs, outbox, integrity] = await Promise.all([
    sql<{
      count: string;
    }>`select count(*)::text as count from payments.payment_attempts where organization_id=${organizationId} and status='PENDING_VERIFICATION'`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text as count from delivery.deliveries where organization_id=${organizationId} and operational_status in ('READY','BOOKED','HANDED_OVER')`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text as count from returns.return_cases where organization_id=${organizationId} and case_status='OPEN'`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text as count from platform.jobs where organization_id=${organizationId} and status in ('RETRY_WAIT','DEAD_LETTER')`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text as count from platform.event_consumer_receipts receipt join platform.outbox_events event on event.id=receipt.outbox_event_id where event.organization_id=${organizationId} and receipt.status in ('RETRY_WAIT','DEAD_LETTER')`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text as count from platform.integrity_issues where organization_id=${organizationId} and status in ('OPEN','INVESTIGATING')`.execute(
      db,
    ),
  ]);
  return [
    ['Payment verification', payments.rows[0]?.count ?? '0', '/payments'],
    ['Delivery operations', deliveries.rows[0]?.count ?? '0', '/delivery'],
    ['Open returns', returns.rows[0]?.count ?? '0', '/returns'],
    ['Job retries', jobs.rows[0]?.count ?? '0', '/operations/health'],
    ['Outbox retries', outbox.rows[0]?.count ?? '0', '/operations/health'],
    ['Integrity issues', integrity.rows[0]?.count ?? '0', '/operations/integrity'],
  ].map(([label, count, href]) => ({ label, count, href }));
}

export async function globalSearch(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query: string,
) {
  const term = `%${query.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  if (query.trim().length < 2) return [];
  return (
    await sql<{ kind: string; label: string; detail: string; href: string }>`
      select 'Order' as kind,order_number as label,order_status as detail,('/orders/' || id::text) as href from orders.orders where organization_id=${organizationId} and order_number ilike ${term}
      union all select 'Customer',customer_number,display_name,('/customers/' || id::text) from customers.customers where organization_id=${organizationId} and (customer_number ilike ${term} or display_name ilike ${term})
      union all select 'Product',title,handle,('/catalog/products/' || id::text) from catalog.products where organization_id=${organizationId} and (title ilike ${term} or handle ilike ${term})
      union all select 'Delivery',delivery_number,operational_status,('/delivery/' || id::text) from delivery.deliveries where organization_id=${organizationId} and delivery_number ilike ${term}
      limit 30
    `.execute(db)
  ).rows;
}

export async function listSavedViews(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  userId: string,
) {
  return (
    await sql`select id::text,resource_key,name,filters,sort,columns,updated_at::text from platform.saved_views where organization_id=${organizationId} and user_id=${userId}::uuid order by resource_key,name`.execute(
      db,
    )
  ).rows;
}

export async function saveView(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    userId: string;
    resourceKey: string;
    name: string;
    filters?: unknown;
    sort?: unknown;
    columns?: unknown;
  },
) {
  if (!resourceKeys.has(input.resourceKey))
    throw new AdminOperationsError('Unsupported saved view resource.');
  if (!input.name.trim()) throw new AdminOperationsError('A saved view needs a name.');
  return (
    await sql<{
      id: string;
    }>`insert into platform.saved_views(organization_id,user_id,resource_key,name,filters,sort,columns) values(${input.organizationId},${input.userId}::uuid,${input.resourceKey},${input.name.trim()},${JSON.stringify(input.filters ?? {})}::jsonb,${JSON.stringify(input.sort ?? [])}::jsonb,${JSON.stringify(input.columns ?? [])}::jsonb) on conflict(organization_id,user_id,resource_key,name) do update set filters=excluded.filters,sort=excluded.sort,columns=excluded.columns,updated_at=now() returning id::text`.execute(
      db,
    )
  ).rows[0];
}

export async function getOrganizationProfile(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select profile.organization_id::text,profile.schema_version,profile.business_profile,profile.storefront_profile,profile.updated_at::text,organization.display_name,organization.timezone,organization.default_locale,organization.default_currency from platform.organizations organization left join settings.organization_profiles profile on profile.organization_id=organization.id where organization.id=${organizationId}::uuid`.execute(
      db,
    )
  ).rows[0];
}

export async function updateOrganizationProfile(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    businessProfile: Record<string, unknown>;
    storefrontProfile: Record<string, unknown>;
  },
) {
  return (
    await sql`insert into settings.organization_profiles(organization_id,business_profile,storefront_profile,updated_by) values(${input.organizationId},${JSON.stringify(input.businessProfile)}::jsonb,${JSON.stringify(input.storefrontProfile)}::jsonb,${input.actorId}::uuid) on conflict(organization_id) do update set business_profile=excluded.business_profile,storefront_profile=excluded.storefront_profile,updated_at=now(),updated_by=excluded.updated_by returning updated_at::text`.execute(
      db,
    )
  ).rows[0];
}
