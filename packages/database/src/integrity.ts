import { createHash } from 'node:crypto';

import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { verifyAnalyticsIntegrity, rebuildAnalyticsProjections } from './analytics.js';
import { verifyCostingIntegrity } from './costing.js';
import { verifyFinanceIntegrity } from './finance.js';
import { verifyInventoryIntegrity } from './inventory.js';
import { verifyNotificationIntegrationIntegrity } from './notifications.js';
import { verifyPaymentIntegrity } from './payments.js';
import { verifyReturnIntegrity } from './returns.js';
import { rebuildRatingSummary } from './reviews.js';
import { appendAuditEvent } from './platform.js';

export type IntegritySeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type IntegrityCategory =
  | 'DATA'
  | 'BUSINESS'
  | 'FINANCIAL'
  | 'OPERATIONAL'
  | 'PROJECTION'
  | 'STORAGE'
  | 'SECURITY_CONFIGURATION';
export type IntegrityFindingStatus =
  'OPEN' | 'INVESTIGATING' | 'REPAIR_PENDING' | 'REPAIRING' | 'RESOLVED' | 'ACCEPTED';

export class IntegrityDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
  }
}

export interface IntegrityEvidence {
  readonly code: string;
  readonly summary: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly severity?: IntegritySeverity;
  readonly confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly expected?: string;
  readonly observed?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface IntegrityCheckDefinition {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly module: string;
  readonly invariant: string;
  readonly category: IntegrityCategory;
  readonly defaultSeverity: IntegritySeverity;
  readonly cost: 'LIGHT' | 'MODERATE' | 'HEAVY';
  readonly supportedScopes: readonly ('ORGANIZATION' | 'MODULE' | 'ENTITY')[];
  readonly schedule: 'FREQUENT' | 'NIGHTLY' | 'MANUAL_ONLY';
  readonly repairKeys: readonly string[];
  readonly requiredCapability: 'admin.integrity.view' | 'admin.integrity.repair';
  readonly run: (
    db: Kysely<DatabaseSchema>,
    organizationId: string,
  ) => Promise<{
    readonly findings: readonly IntegrityEvidence[];
    readonly recordsInspected: number;
  }>;
}

const descriptions: Record<string, string> = {
  RETURN_RECEIVED_EXCEEDS_AUTHORIZATION: 'Received Return quantity exceeds its authorization.',
  RETURN_RECEIPT_MISSING_INVENTORY:
    'A Return Receipt is missing its authoritative Inventory posting.',
  RETURN_RECEIPT_MISSING_COST_PROVENANCE: 'Returned stock is missing Costing provenance.',
  COGS_RECOVERY_WITHOUT_ORIGINAL_COGS: 'A COGS recovery has no original COGS recognition.',
  ACCOUNT_ENTRY_CURRENCY_MISMATCH: 'A Finance entry currency differs from its Account currency.',
  TRANSFER_ENTRY_MISMATCH:
    'An internal Finance Transfer does not have one balanced pair of entries.',
  EXPENSE_OVERPAID: 'Expense payments exceed the authoritative Expense obligation.',
  COD_SETTLEMENT_ENTRY_MISMATCH:
    'A COD Settlement does not reconcile to its allocations and Finance entries.',
  COD_PAYMENT_OVER_SETTLED: 'COD Settlement allocations exceed the collected Payment.',
  PAYMENT_ALLOCATION_EXCEEDS_PAYMENT:
    'Payment allocations exceed the authoritative Payment amount.',
  REFUND_ALLOCATION_MISMATCH: 'Refund allocations do not equal the authoritative Refund amount.',
};

const fromCodes = (codes: readonly string[], entityType?: string): readonly IntegrityEvidence[] =>
  codes.map((code) => ({
    code,
    summary: descriptions[code] ?? code.replaceAll('_', ' '),
    ...(entityType ? { entityType } : {}),
  }));

async function scanReviews(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{ code: string; entity_id: string; summary: string }>`
    select 'ACTIVE_DUPLICATE_REVIEW' code, (array_agg(id order by id))[1]::text entity_id,
      'A Customer has more than one active Review for the same Product.' summary
    from reviews.reviews where organization_id=${organizationId} and lifecycle_status='ACTIVE'
    group by customer_id,product_id having count(*)>1
    union all
    select 'RATING_SUMMARY_DRIFT', product.id::text,
      'The Product rating projection differs from approved visible Reviews.'
    from catalog.products product
    left join reviews.product_rating_summary summary
      on summary.organization_id=product.organization_id and summary.product_id=product.id
    where product.organization_id=${organizationId} and
      coalesce(summary.rating_count,0)<>(select count(*) from reviews.reviews review
        join reviews.review_revisions revision on revision.id=review.published_revision_id
        where review.organization_id=product.organization_id and review.product_id=product.id
          and review.lifecycle_status='ACTIVE' and review.visibility_status='VISIBLE'
          and revision.moderation_status='APPROVED')
  `.execute(db);
  return {
    recordsInspected: rows.rows.length,
    findings: rows.rows.map((row) => ({
      code: row.code,
      summary: row.summary,
      entityType: row.code === 'RATING_SUMMARY_DRIFT' ? 'catalog.product' : 'reviews.review',
      entityId: row.entity_id,
    })),
  };
}

async function scanOperationalRecovery(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{
    code: string;
    count: string;
    summary: string;
    severity: IntegritySeverity;
  }>`
    select 'DEAD_LETTER_JOB' code,count(*)::text count,
      'Durable Worker jobs require operator investigation.' summary,'ERROR' severity
    from platform.jobs where organization_id=${organizationId} and status='DEAD_LETTER' having count(*)>0
    union all
    select 'DEAD_LETTER_OUTBOX_CONSUMER',count(*)::text,
      'Outbox consumer receipts exhausted automatic recovery.','ERROR'
    from platform.event_consumer_receipts receipt join platform.outbox_events event on event.id=receipt.outbox_event_id
    where event.organization_id=${organizationId} and receipt.status='DEAD_LETTER' having count(*)>0
    union all
    select 'UNKNOWN_INTEGRATION_OUTCOME',count(*)::text,
      'External operations have an unknown outcome and must not be blindly replayed.','CRITICAL'
    from integrations.integration_operations where organization_id=${organizationId} and status='UNKNOWN_OUTCOME' having count(*)>0
  `.execute(db);
  return {
    recordsInspected: rows.rows.reduce((sum, row) => sum + Number(row.count), 0),
    findings: rows.rows.map((row) => ({
      code: row.code,
      summary: row.summary,
      severity: row.severity,
      expected: '0 unresolved records',
      observed: `${row.count} unresolved records`,
    })),
  };
}

async function scanCommerceRelationships(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{
    code: string;
    entity_id: string;
    summary: string;
    severity: IntegritySeverity;
  }>`
    select 'ORDER_CUSTOMER_TENANT_MISMATCH' code,order_row.id::text entity_id,
      'Order and Customer cross an Organization boundary.' summary,'CRITICAL' severity
    from orders.orders order_row join customers.customers customer on customer.id=order_row.customer_id
    where order_row.organization_id=${organizationId} and customer.organization_id<>order_row.organization_id
    union all
    select 'FULFILLMENT_QUANTITY_EXCEEDS_ORDER',line.order_line_id::text,
      'Non-cancelled Fulfillment quantity exceeds the Order Line quantity.','ERROR'
    from fulfillment.fulfillment_lines line
    join fulfillment.fulfillments fulfillment on fulfillment.id=line.fulfillment_id
    join orders.order_lines order_line on order_line.id=line.order_line_id
    where line.organization_id=${organizationId} and fulfillment.status<>'CANCELLED'
    group by line.order_line_id,order_line.quantity having sum(line.quantity)>order_line.quantity
    union all
    select 'DELIVERY_FULFILLMENT_ORDER_MISMATCH',delivery.id::text,
      'Delivery and Fulfillment refer to different Orders.','CRITICAL'
    from delivery.deliveries delivery join fulfillment.fulfillments fulfillment on fulfillment.id=delivery.fulfillment_id
    where delivery.organization_id=${organizationId} and delivery.order_id<>fulfillment.order_id
  `.execute(db);
  return {
    recordsInspected: rows.rows.length,
    findings: rows.rows.map((row) => ({
      code: row.code,
      summary: row.summary,
      entityType: row.code.startsWith('ORDER_')
        ? 'orders.order'
        : row.code.startsWith('DELIVERY_')
          ? 'delivery.delivery'
          : 'orders.order_line',
      entityId: row.entity_id,
      severity: row.severity,
    })),
  };
}

async function scanSupplyAndAssets(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{
    code: string;
    entity_id: string;
    summary: string;
    severity: IntegritySeverity;
  }>`
    select 'PURCHASE_LINE_OVER_ALLOCATED' code,line.id::text entity_id,
      'Shipment allocations exceed the purchased quantity.' summary,'ERROR' severity
    from procurement.purchase_lines line
    join inbound_shipment.purchase_line_allocations allocation on allocation.purchase_line_id=line.id
    where line.organization_id=${organizationId}
    group by line.id,line.quantity having sum(allocation.allocated_quantity)>line.quantity
    union all
    select 'SHIPMENT_ALLOCATION_OVER_RECEIVED',allocation.id::text,
      'Posted inbound Receipt quantity exceeds the Shipment allocation.','ERROR'
    from inbound_shipment.purchase_line_allocations allocation
    join receiving.inbound_receipt_lines receipt_line on receipt_line.shipment_allocation_id=allocation.id
    join receiving.inbound_receipts receipt on receipt.id=receipt_line.inbound_receipt_id and receipt.status='POSTED'
    where allocation.organization_id=${organizationId}
    group by allocation.id,allocation.allocated_quantity having sum(receipt_line.quantity)>allocation.allocated_quantity
    union all
    select 'ASSET_PURCHASE_PROVENANCE_MISMATCH',asset.id::text,
      'Asset Purchase provenance does not match its Purchase Line.','ERROR'
    from assets.assets asset join procurement.purchase_lines line on line.id=asset.purchase_line_id
    where asset.organization_id=${organizationId} and asset.purchase_id<>line.purchase_id
  `.execute(db);
  return {
    recordsInspected: rows.rows.length,
    findings: rows.rows.map((row) => ({
      code: row.code,
      summary: row.summary,
      entityType: row.code.startsWith('ASSET_') ? 'assets.asset' : 'supply.record',
      entityId: row.entity_id,
      severity: row.severity,
    })),
  };
}

async function scanMediaMetadata(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{ code: string; entity_id: string; summary: string }>`
    select 'READY_MEDIA_WITHOUT_OBJECT' code,asset.id::text entity_id,
      'A READY Media Asset has no current storage object.' summary
    from media.media_assets asset where asset.organization_id=${organizationId} and asset.status='READY' and asset.current_object_id is null
    union all
    select 'STALE_MEDIA_PROCESSING',asset.id::text,
      'A Media Asset has remained in processing beyond the recovery grace period.'
    from media.media_assets asset where asset.organization_id=${organizationId} and asset.status='PROCESSING' and asset.updated_at<now()-interval '30 minutes'
  `.execute(db);
  return {
    recordsInspected: rows.rows.length,
    findings: rows.rows.map((row) => ({
      code: row.code,
      summary: row.summary,
      entityType: 'media.asset',
      entityId: row.entity_id,
    })),
  };
}

export const integrityCheckRegistry: readonly IntegrityCheckDefinition[] = [
  {
    id: 'inventory.core',
    version: 2,
    name: 'Inventory consistency',
    module: 'Inventory',
    category: 'BUSINESS',
    description:
      'Cross-checks condition balances, immutable movements, reservations, Transfers, and Stocktakes.',
    invariant:
      'Inventory projections and lifecycle owners agree with immutable movement and allocation facts.',
    defaultSeverity: 'ERROR',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyInventoryIntegrity(db, organizationId);
      return {
        recordsInspected: rows.length,
        findings: rows.map((row) => ({
          code: row.code,
          summary: row.summary,
          entityType: 'inventory.record',
          ...(row.entityId ? { entityId: row.entityId } : {}),
        })),
      };
    },
  },
  {
    id: 'costing.core',
    version: 2,
    name: 'Costing consistency',
    module: 'Costing',
    category: 'FINANCIAL',
    description:
      'Cross-checks Cost layers, positions, allocations, landed cost, and COGS provenance.',
    invariant:
      'Physical stock and outbound movement retain complete, non-negative Costing provenance.',
    defaultSeverity: 'CRITICAL',
    cost: 'HEAVY',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyCostingIntegrity(db, organizationId);
      return {
        recordsInspected: rows.length,
        findings: rows.map((row) => ({
          code: row.code,
          summary: row.summary,
          entityType: 'costing.record',
          ...(row.entityId ? { entityId: row.entityId } : {}),
        })),
      };
    },
  },
  {
    id: 'returns.core',
    version: 1,
    name: 'Returns consistency',
    module: 'Returns',
    category: 'BUSINESS',
    description:
      'Checks authorized/received quantities, Inventory posting, and COGS recovery provenance.',
    invariant:
      'Return receipt and recovery facts remain within authorization and preserve provenance.',
    defaultSeverity: 'ERROR',
    cost: 'LIGHT',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyReturnIntegrity(db, organizationId);
      return { recordsInspected: rows.length, findings: fromCodes(rows, 'returns.record') };
    },
  },
  {
    id: 'finance.core',
    version: 2,
    name: 'Finance consistency',
    module: 'Finance',
    category: 'FINANCIAL',
    description: 'Checks Account currencies, balanced Transfers, Expenses, and COD Settlements.',
    invariant:
      'Immutable Finance facts balance and agree with their authoritative source documents.',
    defaultSeverity: 'CRITICAL',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyFinanceIntegrity(db, organizationId);
      return { recordsInspected: rows.length, findings: fromCodes(rows, 'finance.record') };
    },
  },
  {
    id: 'payments.core',
    version: 1,
    name: 'Payments consistency',
    module: 'Payments',
    category: 'FINANCIAL',
    description: 'Checks Payment and Refund allocation totals.',
    invariant: 'Allocations never exceed or contradict immutable Payment and Refund facts.',
    defaultSeverity: 'CRITICAL',
    cost: 'LIGHT',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'FREQUENT',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const result = await verifyPaymentIntegrity(db, organizationId);
      return {
        recordsInspected: result.issues.length,
        findings: fromCodes(result.issues, 'payments.record'),
      };
    },
  },
  {
    id: 'commerce.relationships',
    version: 1,
    name: 'Commerce relationships',
    module: 'Orders',
    category: 'BUSINESS',
    description:
      'Checks cross-tenant Order relationships and quantity/lifecycle consistency through Fulfillment and Delivery.',
    invariant:
      'Commerce relationships remain tenant-safe and quantities do not exceed authoritative Order intent.',
    defaultSeverity: 'ERROR',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: scanCommerceRelationships,
  },
  {
    id: 'reviews.projection',
    version: 2,
    name: 'Review and rating consistency',
    module: 'Reviews',
    category: 'PROJECTION',
    description: 'Checks duplicate active Reviews and Product rating projection drift.',
    invariant:
      'Published Review uniqueness and rating summaries agree with approved visible Reviews.',
    defaultSeverity: 'WARNING',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE', 'ENTITY'],
    schedule: 'NIGHTLY',
    repairKeys: ['REVIEW_RATINGS'],
    requiredCapability: 'admin.integrity.view',
    run: scanReviews,
  },
  {
    id: 'notifications.integrations',
    version: 1,
    name: 'Notification and integration consistency',
    module: 'Notifications',
    category: 'OPERATIONAL',
    description:
      'Checks templates, duplicate success, webhook evidence, provider events, and tenant mappings.',
    invariant:
      'Notification and integration delivery evidence is complete, unique, and tenant-safe.',
    defaultSeverity: 'ERROR',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'FREQUENT',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyNotificationIntegrationIntegrity(db, organizationId);
      return {
        recordsInspected: rows.length,
        findings: rows.map((row) => ({
          code: row.code,
          summary: row.code.replaceAll('_', ' '),
          entityType: 'notifications.record',
          ...(row.entity_id ? { entityId: row.entity_id } : {}),
        })),
      };
    },
  },
  {
    id: 'analytics.projection',
    version: 1,
    name: 'Analytics projection consistency',
    module: 'Analytics',
    category: 'PROJECTION',
    description:
      'Checks reporting facts against authoritative Orders, Refunds, Customers, and Costing.',
    invariant: 'Rebuildable Analytics facts agree with authoritative transactional domains.',
    defaultSeverity: 'WARNING',
    cost: 'HEAVY',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: ['ANALYTICS'],
    requiredCapability: 'admin.integrity.view',
    run: async (db, organizationId) => {
      const rows = await verifyAnalyticsIntegrity(db, organizationId);
      return {
        recordsInspected: rows.length,
        findings: rows.map((row) => ({ code: row.code, summary: row.detail })),
      };
    },
  },
  {
    id: 'platform.recovery',
    version: 1,
    name: 'Worker and external-operation recovery',
    module: 'Platform',
    category: 'OPERATIONAL',
    description:
      'Detects durable work that exhausted recovery and external operations with unknown outcomes.',
    invariant:
      'Failed durable work remains actionable and ambiguous external effects are never silently replayed.',
    defaultSeverity: 'ERROR',
    cost: 'LIGHT',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'FREQUENT',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: scanOperationalRecovery,
  },
  {
    id: 'supply.assets.provenance',
    version: 1,
    name: 'Supply and Asset provenance',
    module: 'Supply',
    category: 'BUSINESS',
    description:
      'Checks purchased, shipped, received, and Asset acquisition provenance without treating legitimate partial receiving as corruption.',
    invariant:
      'Allocated and received quantities remain bounded and Asset purchase references remain coherent.',
    defaultSeverity: 'ERROR',
    cost: 'MODERATE',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: scanSupplyAndAssets,
  },
  {
    id: 'media.metadata',
    version: 1,
    name: 'Media metadata consistency',
    module: 'Media',
    category: 'STORAGE',
    description:
      'Checks database-side Media object ownership and stuck processing state; physical storage existence remains a storage-adapter check.',
    invariant: 'Ready Media has an owned current object and processing leases do not remain stuck.',
    defaultSeverity: 'WARNING',
    cost: 'LIGHT',
    supportedScopes: ['ORGANIZATION', 'MODULE'],
    schedule: 'NIGHTLY',
    repairKeys: [],
    requiredCapability: 'admin.integrity.view',
    run: scanMediaMetadata,
  },
] as const;

const definitionsById = new Map(
  integrityCheckRegistry.map((definition) => [definition.id, definition]),
);
const fingerprint = (checkId: string, finding: IntegrityEvidence) =>
  createHash('sha256')
    .update(`${checkId}|${finding.code}|${finding.entityType ?? ''}|${finding.entityId ?? ''}`)
    .digest('hex');
const safeError = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 500) : 'Integrity check failed.';

export function listIntegrityChecks() {
  return integrityCheckRegistry.map((definition) => {
    const { run, ...metadata } = definition;
    void run;
    return metadata;
  });
}

export async function requestIntegrityRun(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    triggerType: 'SCHEDULED' | 'MANUAL' | 'TARGETED' | 'VERIFICATION';
    module?: string;
    checkIds?: readonly string[];
    executionKey?: string;
  },
) {
  const requested = input.checkIds?.length
    ? [...new Set(input.checkIds)]
    : input.module
      ? integrityCheckRegistry
          .filter((check) => check.module.toLowerCase() === input.module!.toLowerCase())
          .map((check) => check.id)
      : integrityCheckRegistry.map((check) => check.id);
  if (!requested.length || requested.some((id) => !definitionsById.has(id)))
    throw new IntegrityDomainError(
      'VALIDATION_FAILED',
      'One or more Integrity checks are unsupported for this scope.',
    );
  const executionKey =
    input.executionKey ?? `${input.module ?? 'organization'}:${[...requested].sort().join(',')}`;
  if (input.triggerType === 'SCHEDULED') {
    const existing = await sql<{
      id: string;
      status: string;
    }>`select id::text,status from platform.integrity_runs where organization_id=${input.organizationId} and trigger_type='SCHEDULED' and execution_key=${executionKey} limit 1`.execute(
      db,
    );
    if (existing.rows[0]) return existing.rows[0];
  }
  try {
    const row = await sql<{ id: string; status: string }>`insert into platform.integrity_runs
      (organization_id,trigger_type,scope_type,scope_module,selected_check_ids,execution_key,status,requested_by,checks_total)
      values (${input.organizationId},${input.triggerType},${input.module ? 'MODULE' : 'ORGANIZATION'},${input.module ?? null},${requested}::text[],${executionKey},'QUEUED',${input.actorId ?? null}::uuid,${requested.length})
      returning id::text,status`.execute(db);
    return row.rows[0]!;
  } catch (error) {
    if (String(error).includes('integrity_runs_active_scope'))
      throw new IntegrityDomainError(
        'CONFLICT',
        'An equivalent Integrity scan is already queued or running.',
      );
    throw error;
  }
}

async function persistFindings(
  db: Kysely<DatabaseSchema>,
  input: {
    runId: string;
    organizationId: string;
    definition: IntegrityCheckDefinition;
    findings: readonly IntegrityEvidence[];
  },
) {
  const seen: string[] = [];
  for (const finding of input.findings) {
    const key = fingerprint(input.definition.id, finding);
    seen.push(key);
    const previous = await sql<{
      status: string;
    }>`select status from platform.integrity_issues where organization_id=${input.organizationId} and fingerprint=${key}`.execute(
      db,
    );
    const evidence = {
      expected: finding.expected ?? null,
      observed: finding.observed ?? null,
      metadata: finding.metadata ?? {},
    };
    const upsert = await sql<{ id: string; inserted: boolean; previous_status: string }>`
      insert into platform.integrity_issues
        (organization_id,check_id,check_version,fingerprint,domain,category,issue_type,severity,confidence,entity_type,entity_id,status,summary,details,last_seen_run_id)
      values (${input.organizationId},${input.definition.id},${input.definition.version},${key},${input.definition.module},${input.definition.category},${finding.code},${finding.severity ?? input.definition.defaultSeverity},${finding.confidence ?? 'HIGH'},${finding.entityType ?? null},${finding.entityId ?? null}::uuid,'OPEN',${finding.summary},${JSON.stringify(evidence)}::jsonb,${input.runId}::uuid)
      on conflict (organization_id,fingerprint) do update set
        check_version=excluded.check_version,severity=excluded.severity,confidence=excluded.confidence,summary=excluded.summary,details=excluded.details,
        last_detected_at=now(),last_seen_run_id=excluded.last_seen_run_id,occurrence_count=platform.integrity_issues.occurrence_count+1,
        status=case when platform.integrity_issues.status='RESOLVED' then 'OPEN' else platform.integrity_issues.status end,
        resolved_at=case when platform.integrity_issues.status='RESOLVED' then null else platform.integrity_issues.resolved_at end,
        resolved_by=case when platform.integrity_issues.status='RESOLVED' then null else platform.integrity_issues.resolved_by end,
        version=platform.integrity_issues.version+1
      returning id::text,(xmax=0) inserted
    `.execute(db);
    const row = upsert.rows[0]!;
    const eventType = row.inserted
      ? 'DETECTED'
      : previous.rows[0]?.status === 'RESOLVED'
        ? 'REOPENED'
        : 'RECURRED';
    await sql`insert into platform.integrity_finding_events(organization_id,finding_id,run_id,event_type,metadata)
      values(${input.organizationId},${row.id}::uuid,${input.runId}::uuid,${eventType},${JSON.stringify({ checkId: input.definition.id, checkVersion: input.definition.version })}::jsonb)`.execute(
      db,
    );
    if (row.inserted && (finding.severity ?? input.definition.defaultSeverity) === 'CRITICAL') {
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
        values(${input.organizationId},'integrity.critical_finding.detected',1,'platform.integrity_issue',${row.id}::uuid,${JSON.stringify({ findingId: row.id, domain: input.definition.module, severity: 'CRITICAL' })}::jsonb,now())`.execute(
        db,
      );
    }
  }
  await sql`with resolved as (
      update platform.integrity_issues set status='RESOLVED',resolved_at=now(),version=version+1
      where organization_id=${input.organizationId} and check_id=${input.definition.id}
        and status in ('OPEN','INVESTIGATING','REPAIR_PENDING') and not (fingerprint=any(${seen}::text[]))
      returning id
    ) insert into platform.integrity_finding_events(organization_id,finding_id,run_id,event_type,to_status)
      select ${input.organizationId},id,${input.runId}::uuid,'VERIFIED_RESOLVED','RESOLVED' from resolved`.execute(
    db,
  );
}

export async function executeIntegrityRun(
  db: Kysely<DatabaseSchema>,
  runId: string,
  leaseOwner = 'inline',
) {
  const claimed = await db.transaction().execute(async (tx) => {
    const row = await sql<{
      id: string;
      organization_id: string;
      selected_check_ids: string[];
    }>`select id::text,organization_id::text,selected_check_ids from platform.integrity_runs where id=${runId}::uuid and status='QUEUED' for update skip locked`.execute(
      tx,
    );
    if (!row.rows[0]) return undefined;
    await sql`update platform.integrity_runs set status='RUNNING',started_at=now(),lease_owner=${leaseOwner},lease_expires_at=now()+interval '10 minutes' where id=${runId}::uuid`.execute(
      tx,
    );
    return row.rows[0];
  });
  if (!claimed) return undefined;
  let completed = 0;
  let failed = 0;
  let records = 0;
  let findings = 0;
  const errors: string[] = [];
  for (const checkId of claimed.selected_check_ids) {
    const definition = definitionsById.get(checkId);
    if (!definition) {
      failed += 1;
      errors.push(`${checkId}: definition unavailable`);
      continue;
    }
    const started = Date.now();
    await sql`insert into platform.integrity_run_checks(organization_id,run_id,check_id,check_version,status,started_at)
      values(${claimed.organization_id},${runId}::uuid,${definition.id},${definition.version},'RUNNING',now()) on conflict(run_id,check_id) do nothing`.execute(
      db,
    );
    try {
      const result = await definition.run(db, claimed.organization_id);
      await persistFindings(db, {
        runId,
        organizationId: claimed.organization_id,
        definition,
        findings: result.findings,
      });
      completed += 1;
      records += result.recordsInspected;
      findings += result.findings.length;
      await sql`update platform.integrity_run_checks set status='SUCCEEDED',records_inspected=${result.recordsInspected},findings_detected=${result.findings.length},completed_at=now(),duration_ms=${Date.now() - started} where run_id=${runId}::uuid and check_id=${checkId}`.execute(
        db,
      );
    } catch (error) {
      failed += 1;
      errors.push(`${checkId}: ${safeError(error)}`);
      await sql`update platform.integrity_run_checks set status='FAILED',completed_at=now(),duration_ms=${Date.now() - started},error_code='CHECK_EXECUTION_FAILED',error_summary=${safeError(error)} where run_id=${runId}::uuid and check_id=${checkId}`.execute(
        db,
      );
    }
    await sql`update platform.integrity_runs set lease_expires_at=now()+interval '10 minutes' where id=${runId}::uuid and status='RUNNING'`.execute(
      db,
    );
  }
  const status = failed === 0 ? 'SUCCEEDED' : completed > 0 ? 'PARTIAL' : 'FAILED';
  await sql`update platform.integrity_runs set status=${status},completed_at=now(),lease_owner=null,lease_expires_at=null,checks_completed=${completed},checks_failed=${failed},records_inspected=${records},findings_detected=${findings},error_summary=${errors.length ? errors.join('; ').slice(0, 2000) : null} where id=${runId}::uuid`.execute(
    db,
  );
  return {
    id: runId,
    status,
    checksCompleted: completed,
    checksFailed: failed,
    recordsInspected: records,
    findingsDetected: findings,
  };
}

export async function processIntegrityRuns(
  db: Kysely<DatabaseSchema>,
  leaseOwner: string,
  limit = 1,
) {
  await sql`update platform.integrity_runs set status='INTERRUPTED',completed_at=now(),lease_owner=null,error_summary='Worker lease expired before the scan completed.' where status='RUNNING' and lease_expires_at<now()`.execute(
    db,
  );
  const candidates = await sql<{
    id: string;
  }>`select id::text from platform.integrity_runs where status='QUEUED' order by created_at,id limit ${Math.min(5, Math.max(1, limit))}`.execute(
    db,
  );
  let processed = 0;
  for (const row of candidates.rows)
    if (await executeIntegrityRun(db, row.id, leaseOwner)) processed += 1;
  return processed;
}

export async function scheduleDueIntegrityRuns(db: Kysely<DatabaseSchema>) {
  const organizations = await sql<{
    id: string;
  }>`select id::text from platform.organizations where status='ACTIVE'`.execute(db);
  let scheduled = 0;
  for (const organization of organizations.rows) {
    const bucket = new Date().toISOString().slice(0, 13);
    try {
      await requestIntegrityRun(db, {
        organizationId: organization.id,
        triggerType: 'SCHEDULED',
        checkIds: integrityCheckRegistry
          .filter((check) => check.schedule === 'FREQUENT')
          .map((check) => check.id),
        executionKey: `frequent:${bucket}`,
      });
      scheduled += 1;
    } catch (error) {
      if (!(error instanceof IntegrityDomainError && error.code === 'CONFLICT')) throw error;
    }
    if (new Date().getUTCHours() === 18) {
      const day = new Date().toISOString().slice(0, 10);
      try {
        await requestIntegrityRun(db, {
          organizationId: organization.id,
          triggerType: 'SCHEDULED',
          checkIds: integrityCheckRegistry
            .filter((check) => check.schedule === 'NIGHTLY')
            .map((check) => check.id),
          executionKey: `nightly:${day}`,
        });
        scheduled += 1;
      } catch (error) {
        if (!(error instanceof IntegrityDomainError && error.code === 'CONFLICT')) throw error;
      }
    }
  }
  return scheduled;
}

export async function listIntegrityRuns(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    sql`select id::text,trigger_type,scope_type,scope_module,selected_check_ids,status,started_at::text,completed_at::text,checks_total,checks_completed,checks_failed,records_inspected::text,findings_detected,error_summary,created_at::text from platform.integrity_runs where organization_id=${organizationId} order by created_at desc,id desc limit ${pageSize} offset ${offset}`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text count from platform.integrity_runs where organization_id=${organizationId}`.execute(
      db,
    ),
  ]);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  return {
    items: rows.rows,
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  };
}

export async function getIntegrityRun(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  runId: string,
) {
  const run =
    await sql`select id::text,trigger_type,scope_type,scope_module,selected_check_ids,status,started_at::text,completed_at::text,checks_total,checks_completed,checks_failed,records_inspected::text,findings_detected,error_summary,created_at::text from platform.integrity_runs where organization_id=${organizationId} and id=${runId}::uuid`.execute(
      db,
    );
  if (!run.rows[0]) throw new IntegrityDomainError('NOT_FOUND', 'Integrity run was not found.');
  const checks =
    await sql`select check_id,check_version,status,records_inspected::text,findings_detected,started_at::text,completed_at::text,duration_ms::text,error_code,error_summary from platform.integrity_run_checks where organization_id=${organizationId} and run_id=${runId}::uuid order by id`.execute(
      db,
    );
  return { ...run.rows[0], checks: checks.rows };
}

export async function listIntegrityFindings(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    status?: string;
    severity?: string;
    module?: string;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const [rows, count] = await Promise.all([
    sql`select id::text,check_id,check_version,domain,category,issue_type code,severity,confidence,entity_type,entity_id::text,status,summary,summary description,details,first_detected_at::text,first_detected_at::text detected_at,last_detected_at::text,occurrence_count,repair_reference,case when check_id='analytics.projection' or (check_id='reviews.projection' and issue_type='RATING_SUMMARY_DRIFT' and entity_id is not null) then 'REBUILDABLE_PROJECTION' else 'DIAGNOSIS_ONLY' end repairability,version::text from platform.integrity_issues where organization_id=${input.organizationId} and (${input.status ?? null}::text is null or status=${input.status ?? null}) and (${input.severity ?? null}::text is null or severity=${input.severity ?? null}) and (${input.module ?? null}::text is null or domain=${input.module ?? null}) order by case severity when 'CRITICAL' then 0 when 'ERROR' then 1 when 'WARNING' then 2 else 3 end,last_detected_at desc,id desc limit ${input.pageSize} offset ${offset}`.execute(
      db,
    ),
    sql<{
      count: string;
    }>`select count(*)::text count from platform.integrity_issues where organization_id=${input.organizationId} and (${input.status ?? null}::text is null or status=${input.status ?? null}) and (${input.severity ?? null}::text is null or severity=${input.severity ?? null}) and (${input.module ?? null}::text is null or domain=${input.module ?? null})`.execute(
      db,
    ),
  ]);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  return {
    items: rows.rows,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function getIntegrityFinding(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  findingId: string,
) {
  const finding =
    await sql`select id::text,check_id,check_version,domain,category,issue_type code,severity,confidence,entity_type,entity_id::text,status,summary,details,first_detected_at::text,last_detected_at::text,occurrence_count,repair_reference,version::text from platform.integrity_issues where organization_id=${organizationId} and id=${findingId}::uuid`.execute(
      db,
    );
  if (!finding.rows[0])
    throw new IntegrityDomainError('NOT_FOUND', 'Integrity finding was not found.');
  const [events, repairs] = await Promise.all([
    sql`select event_type,actor_id::text,from_status,to_status,metadata,created_at::text from platform.integrity_finding_events where organization_id=${organizationId} and finding_id=${findingId}::uuid order by created_at,id`.execute(
      db,
    ),
    sql`select id::text,repair_key,status,preview,result,verification_run_id::text,created_at::text,started_at::text,completed_at::text from platform.integrity_repair_runs where organization_id=${organizationId} and finding_id=${findingId}::uuid order by created_at desc,id desc`.execute(
      db,
    ),
  ]);
  return { ...finding.rows[0], events: events.rows, repairs: repairs.rows };
}

export async function updateFindingStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    findingId: string;
    version: number;
    status: 'OPEN' | 'INVESTIGATING' | 'ACCEPTED';
    reason?: string;
  },
) {
  if (input.status === 'ACCEPTED' && (!input.reason || input.reason.trim().length < 8))
    throw new IntegrityDomainError(
      'VALIDATION_FAILED',
      'Accepted findings require an explicit reason.',
    );
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      status: string;
    }>`select status from platform.integrity_issues where organization_id=${input.organizationId} and id=${input.findingId}::uuid for update`.execute(
      tx,
    );
    if (!current.rows[0])
      throw new IntegrityDomainError('NOT_FOUND', 'Integrity finding was not found.');
    const changed = await sql<{
      version: string;
    }>`update platform.integrity_issues set status=${input.status},accepted_reason=${input.status === 'ACCEPTED' ? input.reason!.trim() : null},version=version+1 where id=${input.findingId}::uuid and organization_id=${input.organizationId} and version=${input.version} returning version::text`.execute(
      tx,
    );
    if (!changed.rows[0])
      throw new IntegrityDomainError(
        'STALE_VERSION',
        'Integrity finding changed; reload before updating it.',
      );
    await sql`insert into platform.integrity_finding_events(organization_id,finding_id,event_type,actor_id,from_status,to_status,metadata) values(${input.organizationId},${input.findingId}::uuid,'STATUS_CHANGED',${input.actorId}::uuid,${current.rows[0].status},${input.status},${JSON.stringify({ reason: input.reason ?? null })}::jsonb)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'integrity.finding.status_changed',
      targetType: 'platform.integrity_issue',
      targetId: input.findingId,
      ...(input.reason ? { reason: input.reason } : {}),
      afterDiff: { status: input.status },
    });
    return { version: Number(changed.rows[0].version), status: input.status };
  });
}

function repairFor(finding: { check_id: string; code: string; entity_id: string | null }) {
  if (finding.check_id === 'analytics.projection')
    return {
      key: 'ANALYTICS',
      risk: 'LOW',
      description:
        'Rebuild Analytics projections from authoritative Orders, Refunds, Customers, and Costing facts.',
      effects: ['Replaces rebuildable Analytics facts for this Organization.'],
    };
  if (
    finding.check_id === 'reviews.projection' &&
    finding.code === 'RATING_SUMMARY_DRIFT' &&
    finding.entity_id
  )
    return {
      key: 'REVIEW_RATINGS',
      risk: 'LOW',
      description: 'Rebuild this Product rating summary from approved visible Reviews.',
      effects: ['Replaces only the derived Product rating summary.'],
    };
  return undefined;
}

export async function previewIntegrityRepair(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; findingId: string },
) {
  const row = await sql<{
    id: string;
    check_id: string;
    issue_type: string;
    entity_id: string | null;
    status: string;
    version: string;
  }>`select id::text,check_id,issue_type,entity_id::text,status,version::text from platform.integrity_issues where organization_id=${input.organizationId} and id=${input.findingId}::uuid`.execute(
    db,
  );
  const finding = row.rows[0];
  if (!finding) throw new IntegrityDomainError('NOT_FOUND', 'Integrity finding was not found.');
  const repair = repairFor({
    check_id: finding.check_id,
    code: finding.issue_type,
    entity_id: finding.entity_id,
  });
  if (!repair)
    throw new IntegrityDomainError(
      'VALIDATION_FAILED',
      'This finding is diagnosis-only and has no allow-listed repair.',
    );
  const preview = {
    ...repair,
    findingId: finding.id,
    findingVersion: Number(finding.version),
    preconditions: [
      'Finding is still open and unchanged.',
      'The authoritative source query still reports this discrepancy.',
    ],
    verification: 'The owning Integrity check runs again after the rebuild.',
  };
  return preview;
}

export async function executeIntegrityRepair(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    findingId: string;
    findingVersion: number;
    repairKey: 'ANALYTICS' | 'REVIEW_RATINGS';
    idempotencyKey: string;
  },
) {
  const preview = await previewIntegrityRepair(db, input);
  if (preview.key !== input.repairKey)
    throw new IntegrityDomainError('VALIDATION_FAILED', 'Repair key does not match the finding.');
  const requestFingerprint = createHash('sha256')
    .update(`${input.findingId}|${input.findingVersion}|${input.repairKey}`)
    .digest('hex');
  const existing = await sql<{
    id: string;
    status: string;
    request_fingerprint: string;
  }>`select id::text,status,request_fingerprint from platform.integrity_repair_runs where organization_id=${input.organizationId} and idempotency_key=${input.idempotencyKey}`.execute(
    db,
  );
  if (existing.rows[0]) {
    if (existing.rows[0].request_fingerprint !== requestFingerprint)
      throw new IntegrityDomainError(
        'VALIDATION_FAILED',
        'Idempotency key was reused with a different repair request.',
      );
    return existing.rows[0];
  }
  const claimed = await db.transaction().execute(async (tx) => {
    const finding = await sql<{
      entity_id: string | null;
    }>`update platform.integrity_issues set status='REPAIRING',version=version+1 where organization_id=${input.organizationId} and id=${input.findingId}::uuid and version=${input.findingVersion} and status in ('OPEN','INVESTIGATING','REPAIR_PENDING') returning entity_id::text`.execute(
      tx,
    );
    if (!finding.rows[0])
      throw new IntegrityDomainError(
        'STALE_VERSION',
        'Finding changed or is no longer repairable; reload before retrying.',
      );
    const run = await sql<{
      id: string;
    }>`insert into platform.integrity_repair_runs(organization_id,finding_id,repair_key,idempotency_key,request_fingerprint,requested_by,status,preview,started_at) values(${input.organizationId},${input.findingId}::uuid,${input.repairKey},${input.idempotencyKey},${requestFingerprint},${input.actorId}::uuid,'RUNNING',${JSON.stringify(preview)}::jsonb,now()) returning id::text`.execute(
      tx,
    );
    await sql`insert into platform.integrity_finding_events(organization_id,finding_id,event_type,actor_id,from_status,to_status,metadata) values(${input.organizationId},${input.findingId}::uuid,'REPAIR_STARTED',${input.actorId}::uuid,'OPEN','REPAIRING',${JSON.stringify({ repairKey: input.repairKey, repairRunId: run.rows[0]!.id })}::jsonb)`.execute(
      tx,
    );
    return { repairRunId: run.rows[0]!.id, entityId: finding.rows[0].entity_id };
  });
  try {
    if (input.repairKey === 'ANALYTICS')
      await rebuildAnalyticsProjections(db, input.organizationId);
    else if (claimed.entityId)
      await rebuildRatingSummary(db, input.organizationId, claimed.entityId);
    else
      throw new IntegrityDomainError('STALE_VERSION', 'The Product target is no longer available.');
    const checkId = input.repairKey === 'ANALYTICS' ? 'analytics.projection' : 'reviews.projection';
    const verification = await requestIntegrityRun(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      triggerType: 'VERIFICATION',
      checkIds: [checkId],
      executionKey: `verification:${claimed.repairRunId}`,
    });
    const result = await executeIntegrityRun(db, verification.id, `repair:${claimed.repairRunId}`);
    const stillOpen =
      await sql`select 1 from platform.integrity_issues where organization_id=${input.organizationId} and id=${input.findingId}::uuid and last_seen_run_id=${verification.id}::uuid`.execute(
        db,
      );
    const status = stillOpen.rows[0] ? 'VERIFICATION_FAILED' : 'SUCCEEDED';
    await sql`update platform.integrity_repair_runs set status=${status},verification_run_id=${verification.id}::uuid,result=${JSON.stringify({ verificationStatus: result?.status ?? 'FAILED' })}::jsonb,completed_at=now() where id=${claimed.repairRunId}::uuid`.execute(
      db,
    );
    await sql`update platform.integrity_issues set status=${stillOpen.rows[0] ? 'OPEN' : 'RESOLVED'},resolved_at=${stillOpen.rows[0] ? null : new Date()},resolved_by=${stillOpen.rows[0] ? null : input.actorId}::uuid,version=version+1 where id=${input.findingId}::uuid`.execute(
      db,
    );
    await appendAuditEvent(db, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'integrity.repair.completed',
      targetType: 'platform.integrity_issue',
      targetId: input.findingId,
      metadata: { repairRunId: claimed.repairRunId, repairKey: input.repairKey, status },
    });
    return { id: claimed.repairRunId, status, verificationRunId: verification.id };
  } catch (error) {
    await sql`update platform.integrity_repair_runs set status='FAILED',result=${JSON.stringify({ errorCode: 'DOMAIN_COMMAND_REJECTED' })}::jsonb,completed_at=now() where id=${claimed.repairRunId}::uuid`.execute(
      db,
    );
    await sql`update platform.integrity_issues set status='OPEN',version=version+1 where id=${input.findingId}::uuid`.execute(
      db,
    );
    await sql`insert into platform.integrity_finding_events(organization_id,finding_id,event_type,actor_id,metadata) values(${input.organizationId},${input.findingId}::uuid,'REPAIR_FAILED',${input.actorId}::uuid,${JSON.stringify({ repairRunId: claimed.repairRunId, errorCode: 'DOMAIN_COMMAND_REJECTED' })}::jsonb)`.execute(
      db,
    );
    throw error;
  }
}
