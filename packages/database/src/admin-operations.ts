import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { rebuildAnalyticsProjections, verifyAnalyticsIntegrity } from './analytics.js';
import { createCatalogProduct } from './catalog.js';
import { verifyCostingIntegrity } from './costing.js';
import { verifyFinanceIntegrity } from './finance.js';
import { verifyNotificationIntegrationIntegrity } from './notifications.js';
import { verifyPaymentIntegrity } from './payments.js';
import { rebuildRatingSummary, verifyReviewIntegrity } from './reviews.js';
import { verifyReturnIntegrity } from './returns.js';

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

export type AttentionItem = {
  readonly domain: string;
  readonly reason: string;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  readonly count: string;
  readonly href: string;
};

export async function getOperationsOverview(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [payments, deliveries, returns, inventory, supply, integrations, jobs, outbox, integrity] =
    await Promise.all([
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
      }>`select count(*)::text count from inventory.inventory_levels level left join settings.organization_profiles profile on profile.organization_id=level.organization_id where level.organization_id=${organizationId} and level.sellable_quantity-level.reserved_quantity<=coalesce((profile.business_profile->>'lowStockThreshold')::numeric,0)`.execute(
        db,
      ),
      sql<{
        count: string;
      }>`select count(*)::text count from inbound_shipment.shipments where organization_id=${organizationId} and status<>'CANCELLED' and receiving_status<>'RECEIVED'`.execute(
        db,
      ),
      sql<{
        count: string;
      }>`select count(*)::text count from integrations.integration_operations where organization_id=${organizationId} and status in ('UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED')`.execute(
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
    {
      domain: 'Payments',
      reason: 'Verification pending',
      severity: 'WARNING',
      count: payments.rows[0]?.count ?? '0',
      href: '/payments',
    },
    {
      domain: 'Delivery',
      reason: 'Operational action required',
      severity: 'WARNING',
      count: deliveries.rows[0]?.count ?? '0',
      href: '/deliveries',
    },
    {
      domain: 'Returns',
      reason: 'Open reverse-logistics case',
      severity: 'WARNING',
      count: returns.rows[0]?.count ?? '0',
      href: '/returns',
    },
    {
      domain: 'Inventory',
      reason: 'No available-to-sell quantity',
      severity: 'ERROR',
      count: inventory.rows[0]?.count ?? '0',
      href: '/inventory/stock',
    },
    {
      domain: 'Supply',
      reason: 'Inbound Shipment in progress',
      severity: 'INFO',
      count: supply.rows[0]?.count ?? '0',
      href: '/inbound-shipments',
    },
    {
      domain: 'Integrations',
      reason: 'Reconciliation required',
      severity: 'ERROR',
      count: integrations.rows[0]?.count ?? '0',
      href: '/integrations',
    },
    {
      domain: 'Worker',
      reason: 'Job retry or dead letter',
      severity: 'ERROR',
      count: jobs.rows[0]?.count ?? '0',
      href: '/operations',
    },
    {
      domain: 'Outbox',
      reason: 'Consumer retry or dead letter',
      severity: 'ERROR',
      count: outbox.rows[0]?.count ?? '0',
      href: '/operations',
    },
    {
      domain: 'Integrity',
      reason: 'Open integrity finding',
      severity: 'CRITICAL',
      count: integrity.rows[0]?.count ?? '0',
      href: '/integrity',
    },
  ] satisfies AttentionItem[];
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
      select 'Order' as kind,order_number as label,order_status as detail,('/orders?order=' || id::text) as href from orders.orders where organization_id=${organizationId} and order_number ilike ${term}
      union all select 'Customer',customer_number,display_name,('/customers?customer=' || id::text) from customers.customers where organization_id=${organizationId} and (customer_number ilike ${term} or display_name ilike ${term})
      union all select 'Product',title,handle,('/products?product=' || id::text) from catalog.products where organization_id=${organizationId} and (title ilike ${term} or handle ilike ${term})
      union all select 'Delivery',delivery_number,operational_status,('/deliveries?delivery=' || id::text) from delivery.deliveries where organization_id=${organizationId} and delivery_number ilike ${term}
      union all select 'Payment',payment_number,status,('/payments?payment=' || id::text) from payments.payments where organization_id=${organizationId} and (payment_number ilike ${term} or external_reference ilike ${term})
      union all select 'Purchase',purchase_number,status,('/purchases?purchase=' || id::text) from procurement.purchases where organization_id=${organizationId} and purchase_number ilike ${term}
      union all select 'Shipment',shipment_number,status,('/inbound-shipments?shipment=' || id::text) from inbound_shipment.shipments where organization_id=${organizationId} and shipment_number ilike ${term}
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
    await sql`select id::text,resource_key,name,filters,sort,columns,status,is_default,updated_at::text from platform.saved_views where organization_id=${organizationId} and user_id=${userId}::uuid and status='ACTIVE' order by resource_key,is_default desc,name`.execute(
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
  const businessName = input.businessProfile.businessName;
  const threshold = input.businessProfile.lowStockThreshold;
  const publicStoreName = input.storefrontProfile.publicStoreName;
  if (businessName !== undefined && (typeof businessName !== 'string' || businessName.length > 160))
    throw new AdminOperationsError('Business name must be text no longer than 160 characters.');
  if (
    threshold !== undefined &&
    (typeof threshold !== 'number' ||
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > 100_000)
  )
    throw new AdminOperationsError('Low-stock threshold must be an integer from 0 to 100000.');
  if (
    publicStoreName !== undefined &&
    (typeof publicStoreName !== 'string' || publicStoreName.length > 160)
  )
    throw new AdminOperationsError('Public store name must be text no longer than 160 characters.');
  return (
    await sql`insert into settings.organization_profiles(organization_id,business_profile,storefront_profile,updated_by) values(${input.organizationId},${JSON.stringify(input.businessProfile)}::jsonb,${JSON.stringify(input.storefrontProfile)}::jsonb,${input.actorId}::uuid) on conflict(organization_id) do update set business_profile=excluded.business_profile,storefront_profile=excluded.storefront_profile,updated_at=now(),updated_by=excluded.updated_by returning updated_at::text`.execute(
      db,
    )
  ).rows[0];
}

export async function updateSavedView(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    userId: string;
    viewId: string;
    name?: string;
    filters?: unknown;
    sort?: unknown;
    status?: 'ACTIVE' | 'ARCHIVED';
    isDefault?: boolean;
  },
) {
  return db.transaction().execute(async (tx) => {
    const owned = await sql<{
      id: string;
      resource_key: string;
    }>`select id,resource_key from platform.saved_views where id=${input.viewId}::uuid and organization_id=${input.organizationId} and user_id=${input.userId}::uuid for update`.execute(
      tx,
    );
    if (!owned.rows[0]) throw new AdminOperationsError('Saved view was not found.');
    if (input.isDefault)
      await sql`update platform.saved_views set is_default=false where organization_id=${input.organizationId} and user_id=${input.userId}::uuid and resource_key=${owned.rows[0].resource_key}`.execute(
        tx,
      );
    return (
      await sql`update platform.saved_views set name=coalesce(${input.name?.trim() || null},name),filters=case when ${input.filters === undefined} then filters else ${JSON.stringify(input.filters ?? {})}::jsonb end,sort=case when ${input.sort === undefined} then sort else ${JSON.stringify(input.sort ?? [])}::jsonb end,status=coalesce(${input.status ?? null},status),is_default=coalesce(${input.isDefault ?? null},is_default),updated_at=now() where id=${input.viewId}::uuid returning id::text,resource_key,name,filters,sort,columns,status,is_default`.execute(
        tx,
      )
    ).rows[0];
  });
}

export async function listTeam(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select membership.id,membership.user_id,u.name,u.email,u.two_factor_enabled,membership.membership_type,membership.status,membership.created_at::text,coalesce(array_agg(g.capability_code order by g.capability_code) filter(where g.capability_code is not null),'{}') capabilities from iam.organization_memberships membership join iam.users u on u.id=membership.user_id left join iam.membership_capability_grants g on g.membership_id=membership.id where membership.organization_id=${organizationId} group by membership.id,u.id order by membership.created_at`.execute(
      db,
    )
  ).rows;
}

export async function updateTeamMember(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorMembershipId: string;
    membershipId: string;
    status?: 'ACTIVE' | 'DISABLED';
    grant?: string;
    revoke?: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const target = await sql<{
      membership_type: string;
      status: string;
    }>`select membership_type,status from iam.organization_memberships where id=${input.membershipId}::uuid and organization_id=${input.organizationId} for update`.execute(
      tx,
    );
    if (!target.rows[0]) throw new AdminOperationsError('Team member was not found.');
    if (target.rows[0].membership_type === 'OWNER')
      throw new AdminOperationsError('The protected Owner membership cannot be changed here.');
    if (
      input.membershipId === input.actorMembershipId &&
      (input.grant || input.revoke || input.status === 'DISABLED')
    )
      throw new AdminOperationsError('Self privilege escalation or self-disable is not allowed.');
    if (input.status)
      await sql`update iam.organization_memberships set status=${input.status},updated_at=now(),version=version+1 where id=${input.membershipId}::uuid`.execute(
        tx,
      );
    if (input.grant)
      await sql`insert into iam.membership_capability_grants(membership_id,capability_code) select ${input.membershipId}::uuid,capability_code from iam.capability_definitions where capability_code=${input.grant} on conflict do nothing`.execute(
        tx,
      );
    if (input.revoke)
      await sql`delete from iam.membership_capability_grants where membership_id=${input.membershipId}::uuid and capability_code=${input.revoke}`.execute(
        tx,
      );
    return { updated: true };
  });
}

export async function getIntegrityCenter(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [costing, returns, finance, payments, reviews, notifications, analytics, persisted] =
    await Promise.all([
      verifyCostingIntegrity(db, organizationId),
      verifyReturnIntegrity(db, organizationId),
      verifyFinanceIntegrity(db, organizationId),
      verifyPaymentIntegrity(db, organizationId),
      verifyReviewIntegrity(db, organizationId),
      verifyNotificationIntegrationIntegrity(db, organizationId),
      verifyAnalyticsIntegrity(db, organizationId),
      sql`select id::text,domain,issue_type code,severity,entity_type,entity_id::text,status,summary description,detected_at::text,repair_reference from platform.integrity_issues where organization_id=${organizationId} and status in ('OPEN','INVESTIGATING') order by detected_at desc`.execute(
        db,
      ),
    ]);
  const normalize = (domain: string, items: readonly unknown[]) =>
    items.map((item) => ({
      domain,
      severity: 'ERROR',
      code:
        typeof item === 'string'
          ? item
          : String(
              (item as { code?: string }).code ??
                (item as { issueType?: string }).issueType ??
                'INTEGRITY_FINDING',
            ),
      description:
        typeof item === 'string'
          ? item
          : String(
              (item as { detail?: string }).detail ??
                (item as { summary?: string }).summary ??
                'Integrity verification found an inconsistency.',
            ),
      repairability:
        domain === 'Analytics' || domain === 'Reviews'
          ? 'REBUILDABLE_PROJECTION'
          : 'DIAGNOSIS_ONLY',
    }));
  return [
    ...normalize('Costing', costing),
    ...normalize('Returns', returns),
    ...normalize('Finance', finance),
    ...normalize('Payments', payments.issues),
    ...normalize('Reviews', reviews),
    ...normalize('Notifications/Integrations', notifications),
    ...normalize('Analytics', analytics),
    ...persisted.rows,
  ];
}

export async function repairProjection(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    projection: 'ANALYTICS' | 'REVIEW_RATINGS' | 'SEARCH';
    resourceId?: string;
  },
) {
  const run = await sql<{
    id: string;
  }>`insert into platform.projection_repair_runs(organization_id,projection_type,resource_id,requested_by,status) values(${input.organizationId},${input.projection},${input.resourceId ?? null}::uuid,${input.actorId}::uuid,'RUNNING') returning id`.execute(
    db,
  );
  const id = run.rows[0]!.id;
  try {
    if (input.projection === 'ANALYTICS')
      await rebuildAnalyticsProjections(db, input.organizationId);
    else if (input.projection === 'REVIEW_RATINGS' && input.resourceId)
      await rebuildRatingSummary(db, input.organizationId, input.resourceId);
    else if (input.projection !== 'SEARCH')
      throw new AdminOperationsError('A Product is required for Review Rating repair.');
    await sql`update platform.projection_repair_runs set status='SUCCEEDED',completed_at=now() where id=${id}::uuid`.execute(
      db,
    );
    return { id, status: 'SUCCEEDED' as const };
  } catch (error) {
    await sql`update platform.projection_repair_runs set status='FAILED',completed_at=now(),error_code='REBUILD_FAILED' where id=${id}::uuid`.execute(
      db,
    );
    throw error;
  }
}

type CatalogImportRow = {
  productTypeId?: string;
  title?: string;
  handle?: string;
  description?: string;
};
export async function createCatalogImport(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    rows: readonly CatalogImportRow[];
    filename: string;
  },
) {
  if (input.rows.length === 0 || input.rows.length > 500)
    throw new AdminOperationsError('Import must contain between 1 and 500 rows.');
  return db.transaction().execute(async (tx) => {
    const job = await sql<{
      id: string;
    }>`insert into platform.import_jobs(organization_id,requested_by,import_type,status,source_metadata) values(${input.organizationId},${input.actorId}::uuid,'CATALOG_PRODUCTS','UPLOADED',${JSON.stringify({ filename: input.filename, rows: input.rows.length })}::jsonb) returning id`.execute(
      tx,
    );
    const id = job.rows[0]!.id;
    const handles = new Set<string>();
    let invalid = 0;
    for (const [index, row] of input.rows.entries()) {
      const errors: string[] = [];
      if (!row.title?.trim()) errors.push('TITLE_REQUIRED');
      if (!row.handle?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) errors.push('INVALID_HANDLE');
      if (!row.productTypeId) errors.push('PRODUCT_TYPE_REQUIRED');
      else if (
        !(
          await sql`select 1 from catalog.product_types where id=${row.productTypeId}::uuid and organization_id=${input.organizationId} and status='ACTIVE'`.execute(
            tx,
          )
        ).rows[0]
      )
        errors.push('PRODUCT_TYPE_NOT_AVAILABLE');
      const duplicate = row.handle ? handles.has(row.handle) : false;
      if (row.handle) handles.add(row.handle);
      if (duplicate) errors.push('DUPLICATE_HANDLE_IN_FILE');
      if (errors.length) invalid++;
      await sql`insert into platform.import_job_rows(organization_id,import_job_id,row_number,source_data,validation_status,validation_errors) values(${input.organizationId},${id}::uuid,${index + 1},${JSON.stringify(row)}::jsonb,${duplicate ? 'DUPLICATE' : errors.length ? 'INVALID' : 'VALID'},${JSON.stringify(errors)}::jsonb)`.execute(
        tx,
      );
    }
    await sql`update platform.import_jobs set status='VALIDATED',validation_result=${JSON.stringify({ valid: input.rows.length - invalid, invalid, allOrNothing: true })}::jsonb where id=${id}::uuid`.execute(
      tx,
    );
    return { id, valid: input.rows.length - invalid, invalid, confirmable: invalid === 0 };
  });
}

export async function confirmCatalogImport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  importJobId: string,
) {
  const row = await sql<{
    id: string;
  }>`update platform.import_jobs set status='CONFIRMED',confirmed_at=now() where id=${importJobId}::uuid and organization_id=${organizationId} and status in ('VALIDATED','FAILED') and not exists(select 1 from platform.import_job_rows r where r.import_job_id=platform.import_jobs.id and r.validation_status<>'VALID') returning id`.execute(
    db,
  );
  if (!row.rows[0]) throw new AdminOperationsError('Only a fully valid import can be confirmed.');
}

export async function listImportJobs(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select id::text,import_type,status,source_metadata,validation_result,result_summary,attempt_count,created_at::text,confirmed_at::text,completed_at::text from platform.import_jobs where organization_id=${organizationId} order by created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}

export async function listExportJobs(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  actorId: string,
) {
  return (
    await sql`select id::text,export_type,status,row_count,created_at::text,completed_at::text from platform.export_jobs where organization_id=${organizationId} and requested_by=${actorId}::uuid order by created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}

export async function processCatalogImports(db: Kysely<DatabaseSchema>, limit = 5) {
  const jobs = await sql<{
    id: string;
    organization_id: string;
    requested_by: string;
  }>`update platform.import_jobs job set status='PROCESSING',attempt_count=attempt_count+1 from (select id from platform.import_jobs where status='CONFIRMED' order by created_at for update skip locked limit ${limit}) candidate where job.id=candidate.id returning job.id,job.organization_id,job.requested_by`.execute(
    db,
  );
  for (const job of jobs.rows) {
    try {
      const rows = await sql<{
        id: string;
        source_data: CatalogImportRow;
      }>`select id::text,source_data from platform.import_job_rows where import_job_id=${job.id}::uuid and validation_status='VALID' order by row_number`.execute(
        db,
      );
      for (const row of rows.rows) {
        const data = row.source_data;
        const product = await createCatalogProduct(db, {
          organizationId: job.organization_id,
          actorId: job.requested_by,
          productTypeId: data.productTypeId!,
          title: data.title!,
          handle: data.handle!,
          ...(data.description ? { description: data.description } : {}),
        });
        await sql`update platform.import_job_rows set result_resource_id=${product.id}::uuid,processed_at=now() where id=${Number(row.id)}`.execute(
          db,
        );
      }
      await sql`update platform.import_jobs set status='COMPLETED',completed_at=now(),result_summary=${JSON.stringify({ created: rows.rows.length })}::jsonb where id=${job.id}::uuid`.execute(
        db,
      );
    } catch {
      await sql`update platform.import_jobs set status='FAILED',completed_at=now(),result_summary='{"error":"DOMAIN_COMMAND_REJECTED"}'::jsonb where id=${job.id}::uuid`.execute(
        db,
      );
    }
  }
  return jobs.rows.length;
}

export async function createExport(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    exportType: 'ORDERS' | 'CUSTOMERS' | 'INVENTORY';
  },
) {
  const job = await sql<{
    id: string;
  }>`insert into platform.export_jobs(organization_id,requested_by,export_type,status) values(${input.organizationId},${input.actorId}::uuid,${input.exportType},'PENDING') returning id`.execute(
    db,
  );
  const id = job.rows[0]!.id;
  const rows =
    input.exportType === 'ORDERS'
      ? (
          await sql`select order_number,order_status,currency_code,total_amount::text,created_at::text from orders.orders where organization_id=${input.organizationId} order by created_at desc limit 1000`.execute(
            db,
          )
        ).rows
      : input.exportType === 'CUSTOMERS'
        ? (
            await sql`select customer_number,display_name,status,created_at::text from customers.customers where organization_id=${input.organizationId} order by created_at desc limit 1000`.execute(
              db,
            )
          ).rows
        : (
            await sql`select variant.sku,location.name location,level.sellable_quantity::text,level.reserved_quantity::text from inventory.inventory_levels level join inventory.inventory_items item on item.id=level.inventory_item_id left join catalog.product_variants variant on variant.id=item.variant_id join warehouse.locations location on location.id=level.location_id where level.organization_id=${input.organizationId} limit 1000`.execute(
              db,
            )
          ).rows;
  await sql`update platform.export_jobs set status='COMPLETED',row_count=${rows.length},result_data=${JSON.stringify(rows)}::jsonb,completed_at=now() where id=${id}::uuid`.execute(
    db,
  );
  return { id, rows };
}

export async function getOrderTimeline(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderId: string,
) {
  return (
    await sql<{
      domain: string;
      event: string;
      occurred_at: string;
      resource_id: string;
    }>`select 'Order' domain,'Created' event,created_at::text occurred_at,id::text resource_id from orders.orders where id=${orderId}::uuid and organization_id=${organizationId}
    union all select 'Payment',status,p.confirmed_at::text,p.id::text from payments.payments p join payments.payment_allocations a on a.payment_id=p.id where a.order_id=${orderId}::uuid and p.organization_id=${organizationId}
    union all select 'Fulfillment',status,coalesce(dispatched_at,created_at)::text,id::text from fulfillment.fulfillments where order_id=${orderId}::uuid and organization_id=${organizationId}
    union all select 'Delivery',outcome_status,coalesce(delivered_at,failed_at,created_at)::text,id::text from delivery.deliveries where order_id=${orderId}::uuid and organization_id=${organizationId}
    union all select 'Return',case_status,created_at::text,id::text from returns.return_cases where order_id=${orderId}::uuid and organization_id=${organizationId}
    union all select 'Refund',status,coalesce(completed_at,requested_at)::text,id::text from payments.refunds where order_id=${orderId}::uuid and organization_id=${organizationId}
    order by occurred_at,domain`.execute(db)
  ).rows;
}
