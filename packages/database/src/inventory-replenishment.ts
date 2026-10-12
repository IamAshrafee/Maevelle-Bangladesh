import { createHash } from 'node:crypto';

import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  appendAuditEvent,
  claimIdempotencyRecord,
  IdempotencyKeyReuseError,
} from './platform.js';
import { resolveInventorySettings } from './settings.js';

export interface ReplenishmentPolicyDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly leadTimeDays: number | null;
  readonly preferredSourceLocationId: string | null;
  readonly preferredSourceLocationName: string | null;
  readonly preferredSupplierId: string | null;
  readonly preferredSupplierName: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReplenishmentPolicyInput {
  readonly inventoryItemId: string;
  readonly locationId: string | null;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly leadTimeDays: number | null;
  readonly preferredSourceLocationId: string | null;
  readonly preferredSupplierId: string | null;
  readonly expectedVersion: number;
}

export interface ReplenishmentPolicyListDto {
  readonly items: readonly ReplenishmentPolicyDto[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface ReplenishmentRecommendationListDto {
  readonly items: readonly ReplenishmentRecommendationDto[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export type ReplenishmentRecommendationAction =
  | {
      readonly type: 'TRANSFER';
      readonly sourceLocationId: string;
      readonly sourceLocationName: string;
      readonly availableSurplus: string;
      readonly href: string;
    }
  | {
      readonly type: 'PURCHASE';
      readonly supplierId: string;
      readonly supplierName: string;
      readonly href: string;
    }
  | { readonly type: 'REVIEW_SOURCE'; readonly href: string };

export interface ReplenishmentRecommendationDto {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly availableToSell: string;
  readonly incomingSupply: string;
  readonly incomingTransfer: string;
  readonly outgoingTransfer: string;
  readonly projectedAvailable: string;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly policySource: 'LOCATION_POLICY' | 'ITEM_POLICY' | 'VARIANT' | 'ORGANIZATION_DEFAULT';
  readonly suggestedQuantity: string;
  readonly status: 'REPLENISH' | 'BELOW_THRESHOLD' | 'HEALTHY';
  readonly explanation: string;
  readonly suggestedAction: ReplenishmentRecommendationAction | null;
}

export class ReplenishmentDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'STALE_VERSION'
      | 'IDEMPOTENCY_KEY_REUSED',
    message: string,
  ) {
    super(message);
  }
}

const quantityPattern = /^\d+(?:\.\d{1,6})?$/;

function assertPolicy(input: ReplenishmentPolicyInput): void {
  for (const [label, value] of [
    ['Reorder point', input.reorderPoint],
    ['Safety stock', input.safetyStock],
    ['Target stock', input.targetStock],
  ] as const) {
    if (!quantityPattern.test(value))
      throw new ReplenishmentDomainError(
        'VALIDATION_FAILED',
        `${label} must be a non-negative quantity with no more than six decimal places.`,
      );
  }
  if (Number(input.targetStock) < Number(input.reorderPoint))
    throw new ReplenishmentDomainError(
      'VALIDATION_FAILED',
      'Target stock must be at least the reorder point.',
    );
  if (Number(input.targetStock) < Number(input.safetyStock))
    throw new ReplenishmentDomainError(
      'VALIDATION_FAILED',
      'Target stock must be at least the safety stock.',
    );
  if (input.leadTimeDays !== null && (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0))
    throw new ReplenishmentDomainError(
      'VALIDATION_FAILED',
      'Lead time must be a non-negative whole number of days.',
    );
  if (input.locationId && input.locationId === input.preferredSourceLocationId)
    throw new ReplenishmentDomainError(
      'VALIDATION_FAILED',
      'The preferred source must differ from the destination location.',
    );
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

interface PolicyRow {
  id: string;
  inventory_item_id: string;
  variant_id: string;
  sku: string;
  product_title: string;
  location_id: string | null;
  location_name: string | null;
  reorder_point: string;
  safety_stock: string;
  target_stock: string;
  lead_time_days: number | null;
  preferred_source_location_id: string | null;
  preferred_source_location_name: string | null;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  version: string;
  created_at: string;
  updated_at: string;
  total_count?: string;
}

function mapPolicy(row: PolicyRow): ReplenishmentPolicyDto {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    variantId: row.variant_id,
    sku: row.sku,
    productTitle: row.product_title,
    locationId: row.location_id,
    locationName: row.location_name,
    reorderPoint: row.reorder_point,
    safetyStock: row.safety_stock,
    targetStock: row.target_stock,
    leadTimeDays: row.lead_time_days,
    preferredSourceLocationId: row.preferred_source_location_id,
    preferredSourceLocationName: row.preferred_source_location_name,
    preferredSupplierId: row.preferred_supplier_id,
    preferredSupplierName: row.preferred_supplier_name,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const policySelection = sql<PolicyRow>`
  select policy.id,policy.inventory_item_id,item.variant_id,variant.sku,product.title as product_title,
    policy.location_id,location.name as location_name,policy.reorder_point::text,
    policy.safety_stock::text,policy.target_stock::text,policy.lead_time_days,
    policy.preferred_source_location_id,source.name as preferred_source_location_name,
    policy.preferred_supplier_id,supplier.name as preferred_supplier_name,
    policy.version::text,policy.created_at::text,policy.updated_at::text
  from inventory.replenishment_policies policy
  join inventory.inventory_items item
    on item.organization_id=policy.organization_id and item.id=policy.inventory_item_id
  join catalog.product_variants variant
    on variant.organization_id=item.organization_id and variant.id=item.variant_id
  join catalog.products product
    on product.organization_id=variant.organization_id and product.id=variant.product_id
  left join warehouse.locations location
    on location.organization_id=policy.organization_id and location.id=policy.location_id
  left join warehouse.locations source
    on source.organization_id=policy.organization_id and source.id=policy.preferred_source_location_id
  left join procurement.suppliers supplier
    on supplier.organization_id=policy.organization_id and supplier.id=policy.preferred_supplier_id
`;

async function getPolicy(
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  organizationId: string,
  policyId: string,
): Promise<ReplenishmentPolicyDto | undefined> {
  const result = await sql<PolicyRow>`${policySelection}
    where policy.organization_id=${organizationId} and policy.id=${policyId}::uuid
  `.execute(db);
  return result.rows[0] ? mapPolicy(result.rows[0]) : undefined;
}

export async function getReplenishmentPolicy(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  policyId: string,
): Promise<ReplenishmentPolicyDto | undefined> {
  return getPolicy(db, organizationId, policyId);
}

export async function listReplenishmentPolicies(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    readonly search?: string;
    readonly inventoryItemId?: string;
    readonly locationIds?: readonly string[];
    readonly page?: number;
    readonly limit?: number;
  } = {},
): Promise<ReplenishmentPolicyListDto> {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const filters = sql`
    where policy.organization_id=${organizationId}
      and (${input.inventoryItemId ?? null}::uuid is null or policy.inventory_item_id=${input.inventoryItemId ?? null}::uuid)
      and (${input.search ?? null}::text is null or variant.sku ilike ${`%${input.search ?? ''}%`} or product.title ilike ${`%${input.search ?? ''}%`})
      and (${input.locationIds === undefined} or policy.location_id is null or policy.location_id=any(${input.locationIds ?? []}::uuid[]))
  `;
  const total = await sql<{ count: string }>`select count(*)::text as count
    from inventory.replenishment_policies policy
    join inventory.inventory_items item
      on item.organization_id=policy.organization_id and item.id=policy.inventory_item_id
    join catalog.product_variants variant
      on variant.organization_id=item.organization_id and variant.id=item.variant_id
    join catalog.products product
      on product.organization_id=variant.organization_id and product.id=variant.product_id
    ${filters}
  `.execute(db);
  const result = await sql<PolicyRow>`${policySelection} ${filters}
    order by product.title,variant.sku,location.name nulls first,policy.id
    limit ${limit} offset ${(page - 1) * limit}
  `.execute(db);
  return {
    items: result.rows.map(mapPolicy),
    page,
    limit,
    total: Number(total.rows[0]?.count ?? 0),
  };
}

async function requireValidReferences(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  input: ReplenishmentPolicyInput,
): Promise<void> {
  const item = await sql<{ exists: boolean }>`select exists(
    select 1 from inventory.inventory_items
    where organization_id=${organizationId} and id=${input.inventoryItemId}::uuid and status='ACTIVE'
  ) as exists`.execute(transaction);
  if (!item.rows[0]?.exists)
    throw new ReplenishmentDomainError('NOT_FOUND', 'The active inventory item was not found.');

  for (const [locationId, label] of [
    [input.locationId, 'destination'],
    [input.preferredSourceLocationId, 'preferred source'],
  ] as const) {
    if (!locationId) continue;
    const location = await sql<{ exists: boolean }>`select exists(
      select 1 from warehouse.locations location
      join warehouse.location_capabilities capability
        on capability.organization_id=location.organization_id and capability.location_id=location.id
        and capability.capability_code='STOCK_HOLDING'
      where location.organization_id=${organizationId} and location.id=${locationId}::uuid and location.status='ACTIVE'
    ) as exists`.execute(transaction);
    if (!location.rows[0]?.exists)
      throw new ReplenishmentDomainError(
        'VALIDATION_FAILED',
        `The ${label} must be an active stock-holding location.`,
      );
  }

  if (input.preferredSupplierId) {
    const supplier = await sql<{ exists: boolean }>`select exists(
      select 1 from procurement.suppliers
      where organization_id=${organizationId} and id=${input.preferredSupplierId}::uuid and status='ACTIVE'
    ) as exists`.execute(transaction);
    if (!supplier.rows[0]?.exists)
      throw new ReplenishmentDomainError(
        'VALIDATION_FAILED',
        'The preferred supplier must be active.',
      );
  }
}

export async function putReplenishmentPolicy(
  db: Kysely<DatabaseSchema>,
  command: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly input: ReplenishmentPolicyInput;
  },
): Promise<ReplenishmentPolicyDto> {
  assertPolicy(command.input);
  return db.transaction().execute(async (transaction) => {
    let claim;
    try {
      claim = await claimIdempotencyRecord(transaction, {
        organizationId: command.organizationId,
        principalType: 'USER',
        principalId: command.actorId,
        operationType: 'inventory.replenishment-policy.put',
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: fingerprint(command.input),
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new ReplenishmentDomainError('IDEMPOTENCY_KEY_REUSED', error.message);
      throw error;
    }
    if (!claim.created) {
      const replay = await sql<{ status: string; safe_response: ReplenishmentPolicyDto | null }>`
        select status,safe_response from platform.idempotency_records where id=${claim.id}
      `.execute(transaction);
      if (replay.rows[0]?.status === 'SUCCEEDED' && replay.rows[0].safe_response)
        return replay.rows[0].safe_response;
      throw new ReplenishmentDomainError('CONFLICT', 'The same policy command is already in progress.');
    }

    await requireValidReferences(transaction, command.organizationId, command.input);
    const existing = await sql<{ id: string; version: string }>`
      select id,version::text from inventory.replenishment_policies
      where organization_id=${command.organizationId}
        and inventory_item_id=${command.input.inventoryItemId}::uuid
        and location_id is not distinct from ${command.input.locationId}::uuid
      for update
    `.execute(transaction);
    const current = existing.rows[0];
    if ((!current && command.input.expectedVersion !== 0) || (current && Number(current.version) !== command.input.expectedVersion))
      throw new ReplenishmentDomainError(
        'STALE_VERSION',
        'The replenishment policy changed. Refresh it before saving again.',
      );

    const written = current
      ? await sql<{ id: string }>`update inventory.replenishment_policies set
          reorder_point=${command.input.reorderPoint},safety_stock=${command.input.safetyStock},
          target_stock=${command.input.targetStock},lead_time_days=${command.input.leadTimeDays},
          preferred_source_location_id=${command.input.preferredSourceLocationId}::uuid,
          preferred_supplier_id=${command.input.preferredSupplierId}::uuid,
          updated_by_actor_id=${command.actorId},updated_at=now(),version=version+1
        where organization_id=${command.organizationId} and id=${current.id}::uuid
        returning id`.execute(transaction)
      : await sql<{ id: string }>`insert into inventory.replenishment_policies (
          organization_id,inventory_item_id,location_id,reorder_point,safety_stock,target_stock,
          lead_time_days,preferred_source_location_id,preferred_supplier_id,created_by_actor_id,updated_by_actor_id
        ) values (
          ${command.organizationId},${command.input.inventoryItemId}::uuid,${command.input.locationId}::uuid,
          ${command.input.reorderPoint},${command.input.safetyStock},${command.input.targetStock},
          ${command.input.leadTimeDays},${command.input.preferredSourceLocationId}::uuid,
          ${command.input.preferredSupplierId}::uuid,${command.actorId},${command.actorId}
        ) returning id`.execute(transaction);
    const policyId = written.rows[0]!.id;
    const policy = (await getPolicy(transaction, command.organizationId, policyId))!;

    await appendAuditEvent(transaction, {
      organizationId: command.organizationId,
      actorType: 'USER',
      actorId: command.actorId,
      action: current ? 'inventory.replenishment_policy.updated' : 'inventory.replenishment_policy.created',
      targetType: 'inventory.replenishment_policy',
      targetId: policyId,
      afterDiff: policy,
    });
    await sql`insert into platform.outbox_events (
      organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at
    ) values (
      ${command.organizationId},'inventory.replenishment_policy.changed',1,'inventory.replenishment_policy',
      ${policyId}::uuid,${policy.version},${JSON.stringify({ policyId })}::jsonb,now()
    )`.execute(transaction);
    await sql`update platform.idempotency_records set status='SUCCEEDED',
      result_entity_type='inventory.replenishment_policy',result_entity_id=${policyId}::uuid,
      safe_response=${JSON.stringify(policy)}::jsonb,completed_at=now()
      where id=${claim.id}`.execute(transaction);
    return policy;
  });
}

export async function deleteReplenishmentPolicy(
  db: Kysely<DatabaseSchema>,
  command: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly policyId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  },
): Promise<{ readonly id: string; readonly deleted: true }> {
  return db.transaction().execute(async (transaction) => {
    let claim;
    try {
      claim = await claimIdempotencyRecord(transaction, {
        organizationId: command.organizationId,
        principalType: 'USER',
        principalId: command.actorId,
        operationType: 'inventory.replenishment-policy.delete',
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: fingerprint({
          policyId: command.policyId,
          expectedVersion: command.expectedVersion,
        }),
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new ReplenishmentDomainError('IDEMPOTENCY_KEY_REUSED', error.message);
      throw error;
    }
    if (!claim.created) {
      const replay = await sql<{
        status: string;
        safe_response: { id: string; deleted: true } | null;
      }>`select status,safe_response from platform.idempotency_records where id=${claim.id}`.execute(
        transaction,
      );
      if (replay.rows[0]?.status === 'SUCCEEDED' && replay.rows[0].safe_response)
        return replay.rows[0].safe_response;
      throw new ReplenishmentDomainError('CONFLICT', 'The same policy command is already in progress.');
    }

    const before = await sql<{ id: string; version: string }>`select id,version::text
      from inventory.replenishment_policies
      where organization_id=${command.organizationId} and id=${command.policyId}::uuid
      for update`.execute(transaction);
    const current = before.rows[0];
    if (!current)
      throw new ReplenishmentDomainError('NOT_FOUND', 'The replenishment policy was not found.');
    if (Number(current.version) !== command.expectedVersion)
      throw new ReplenishmentDomainError(
        'STALE_VERSION',
        'The replenishment policy changed. Refresh it before resetting.',
      );
    const policy = (await getPolicy(transaction, command.organizationId, command.policyId))!;
    await sql`delete from inventory.replenishment_policies
      where organization_id=${command.organizationId} and id=${command.policyId}::uuid`.execute(
        transaction,
      );
    await appendAuditEvent(transaction, {
      organizationId: command.organizationId,
      actorType: 'USER',
      actorId: command.actorId,
      action: 'inventory.replenishment_policy.deleted',
      targetType: 'inventory.replenishment_policy',
      targetId: command.policyId,
      beforeDiff: policy,
    });
    await sql`insert into platform.outbox_events (
      organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at
    ) values (
      ${command.organizationId},'inventory.replenishment_policy.deleted',1,'inventory.replenishment_policy',
      ${command.policyId}::uuid,${command.expectedVersion},${JSON.stringify({ policyId: command.policyId })}::jsonb,now()
    )`.execute(transaction);
    const response = { id: command.policyId, deleted: true as const };
    await sql`update platform.idempotency_records set status='SUCCEEDED',
      result_entity_type='inventory.replenishment_policy',result_entity_id=${command.policyId}::uuid,
      safe_response=${JSON.stringify(response)}::jsonb,completed_at=now()
      where id=${claim.id}`.execute(transaction);
    return response;
  });
}

interface RecommendationRow {
  inventory_item_id: string;
  variant_id: string;
  sku: string;
  product_title: string;
  location_id: string;
  location_name: string;
  available: string;
  incoming_supply: string;
  incoming_transfer: string;
  outgoing_transfer: string;
  projected: string;
  reorder_point: string;
  safety_stock: string;
  target_stock: string;
  policy_source: 'LOCATION_POLICY' | 'ITEM_POLICY' | 'VARIANT' | 'ORGANIZATION_DEFAULT';
  preferred_source_location_id: string | null;
  preferred_source_location_name: string | null;
  source_surplus: string;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  total_count: string;
}

export async function listReplenishmentRecommendations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    readonly search?: string;
    readonly locationIds?: readonly string[];
    readonly attentionOnly?: boolean;
    readonly page?: number;
    readonly limit?: number;
  } = {},
): Promise<ReplenishmentRecommendationListDto> {
  const { lowStockThreshold } = await resolveInventorySettings(db, organizationId);
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const result = await sql<RecommendationRow>`
    with base as (
      select item.id as inventory_item_id,item.variant_id,variant.sku,product.title as product_title,
        location.id as location_id,location.name as location_name,
        (level.sellable_quantity-level.reserved_quantity) as available,
        coalesce(supply.quantity,0) as incoming_supply,
        coalesce(incoming.quantity,0) as incoming_transfer,
        coalesce(outgoing.quantity,0) as outgoing_transfer,
        coalesce(location_policy.reorder_point,item_policy.reorder_point,variant.reorder_point,${lowStockThreshold}) as reorder_point,
        coalesce(location_policy.safety_stock,item_policy.safety_stock,0) as safety_stock,
        coalesce(location_policy.target_stock,item_policy.target_stock,variant.reorder_point,${lowStockThreshold}) as target_stock,
        case when location_policy.id is not null then 'LOCATION_POLICY'
          when item_policy.id is not null then 'ITEM_POLICY'
          when variant.reorder_point is not null then 'VARIANT' else 'ORGANIZATION_DEFAULT' end as policy_source,
        coalesce(location_policy.preferred_source_location_id,item_policy.preferred_source_location_id) as preferred_source_location_id,
        coalesce(location_policy.preferred_supplier_id,item_policy.preferred_supplier_id) as preferred_supplier_id
      from inventory.inventory_levels level
      join inventory.inventory_items item
        on item.organization_id=level.organization_id and item.id=level.inventory_item_id and item.status='ACTIVE'
      join catalog.product_variants variant
        on variant.organization_id=item.organization_id and variant.id=item.variant_id and variant.status='ACTIVE'
      join catalog.products product
        on product.organization_id=variant.organization_id and product.id=variant.product_id
      join warehouse.locations location
        on location.organization_id=level.organization_id and location.id=level.location_id and location.status='ACTIVE'
      left join inventory.replenishment_policies location_policy
        on location_policy.organization_id=level.organization_id
        and location_policy.inventory_item_id=level.inventory_item_id and location_policy.location_id=level.location_id
      left join inventory.replenishment_policies item_policy
        on item_policy.organization_id=level.organization_id
        and item_policy.inventory_item_id=level.inventory_item_id and item_policy.location_id is null
      left join lateral (
        select sum(greatest(allocation.allocated_quantity-coalesce(received.quantity,0),0)) as quantity
        from inbound_shipment.purchase_line_allocations allocation
        join inbound_shipment.shipments shipment
          on shipment.organization_id=allocation.organization_id and shipment.id=allocation.shipment_id
        left join lateral (
          select sum(line.quantity) as quantity from receiving.inbound_receipt_lines line
          where line.organization_id=allocation.organization_id and line.shipment_allocation_id=allocation.id
        ) received on true
        where allocation.organization_id=level.organization_id and allocation.variant_id=item.variant_id
          and shipment.receiving_location_id=level.location_id
          and shipment.status in ('IN_TRANSIT','ARRIVED') and shipment.receiving_status<>'RECEIVED'
      ) supply on true
      left join lateral (
        select sum(line.dispatched_quantity-line.received_quantity-coalesce(discrepancy.quantity,0)) as quantity
        from warehouse.transfer_lines line
        join warehouse.transfers transfer
          on transfer.organization_id=line.organization_id and transfer.id=line.transfer_id
        left join warehouse.transfer_line_discrepancies discrepancy
          on discrepancy.organization_id=line.organization_id and discrepancy.transfer_line_id=line.id
        where line.organization_id=level.organization_id and line.inventory_item_id=level.inventory_item_id
          and transfer.destination_location_id=level.location_id
          and transfer.status in ('IN_TRANSIT','PARTIALLY_RECEIVED')
      ) incoming on true
      left join lateral (
        select sum(line.requested_quantity-line.dispatched_quantity-line.cancelled_quantity) as quantity
        from warehouse.transfer_lines line
        join warehouse.transfers transfer
          on transfer.organization_id=line.organization_id and transfer.id=line.transfer_id
        where line.organization_id=level.organization_id and line.inventory_item_id=level.inventory_item_id
          and transfer.source_location_id=level.location_id and transfer.status='READY'
      ) outgoing on true
      where level.organization_id=${organizationId}
        and (${input.locationIds === undefined} or level.location_id=any(${input.locationIds ?? []}::uuid[]))
        and (${input.search ?? null}::text is null or variant.sku ilike ${`%${input.search ?? ''}%`} or product.title ilike ${`%${input.search ?? ''}%`})
    ), projected as (
      select base.*,(available+incoming_supply+incoming_transfer-outgoing_transfer) as projected
      from base
    )
    select projected.*,source.name as preferred_source_location_name,
      supplier.name as preferred_supplier_name,
      greatest(coalesce(source_level.sellable_quantity-source_level.reserved_quantity,0)
        - coalesce(source_location_policy.reorder_point,source_item_policy.reorder_point,source_variant.reorder_point,${lowStockThreshold}),0)::text as source_surplus,
      count(*) over()::text as total_count,
      projected.available::text,projected.incoming_supply::text,projected.incoming_transfer::text,
      projected.outgoing_transfer::text,projected.projected::text,projected.reorder_point::text,
      projected.safety_stock::text,projected.target_stock::text
    from projected
    left join warehouse.locations source
      on source.organization_id=${organizationId} and source.id=projected.preferred_source_location_id and source.status='ACTIVE'
    left join inventory.inventory_levels source_level
      on source_level.organization_id=${organizationId}
      and source_level.inventory_item_id=projected.inventory_item_id and source_level.location_id=source.id
    left join inventory.replenishment_policies source_location_policy
      on source_location_policy.organization_id=${organizationId}
      and source_location_policy.inventory_item_id=projected.inventory_item_id and source_location_policy.location_id=source.id
    left join inventory.replenishment_policies source_item_policy
      on source_item_policy.organization_id=${organizationId}
      and source_item_policy.inventory_item_id=projected.inventory_item_id and source_item_policy.location_id is null
    left join inventory.inventory_items source_item
      on source_item.organization_id=${organizationId} and source_item.id=projected.inventory_item_id
    left join catalog.product_variants source_variant
      on source_variant.organization_id=${organizationId} and source_variant.id=source_item.variant_id
    left join procurement.suppliers supplier
      on supplier.organization_id=${organizationId} and supplier.id=projected.preferred_supplier_id and supplier.status='ACTIVE'
    where (${input.attentionOnly ?? true}=false or projected.projected<projected.reorder_point)
    order by (projected.projected<=0) desc,(projected.reorder_point-projected.projected) desc,
      projected.product_title,projected.sku,projected.location_name
    limit ${limit} offset ${(page - 1) * limit}
  `.execute(db);

  return {
    items: result.rows.map((row) => {
      const projected = Number(row.projected);
      const reorder = Number(row.reorder_point);
      const target = Number(row.target_stock);
      const suggested = Math.max(0, target - projected);
      const sourceSurplus = Number(row.source_surplus);
      const canTransfer =
        Boolean(row.preferred_source_location_id && row.preferred_source_location_name) &&
        sourceSurplus > 0 && sourceSurplus >= suggested;
      const query = new URLSearchParams({
        inventoryItemId: row.inventory_item_id,
        variantId: row.variant_id,
        quantity: String(suggested),
        destinationLocationId: row.location_id,
      });
      return {
        inventoryItemId: row.inventory_item_id,
        variantId: row.variant_id,
        sku: row.sku,
        productTitle: row.product_title,
        locationId: row.location_id,
        locationName: row.location_name,
        availableToSell: row.available,
        incomingSupply: row.incoming_supply,
        incomingTransfer: row.incoming_transfer,
        outgoingTransfer: row.outgoing_transfer,
        projectedAvailable: row.projected,
        reorderPoint: row.reorder_point,
        safetyStock: row.safety_stock,
        targetStock: row.target_stock,
        policySource: row.policy_source,
        suggestedQuantity: String(suggested),
        status: projected < reorder ? 'REPLENISH' : projected < target ? 'BELOW_THRESHOLD' : 'HEALTHY',
        explanation:
          projected < reorder
            ? `Projected availability is ${row.projected}, below the ${row.policy_source.toLowerCase().replaceAll('_', ' ')} reorder point of ${row.reorder_point}.`
            : projected < target
              ? `Projected availability is below the target of ${row.target_stock}.`
              : `Projected availability meets the target of ${row.target_stock}.`,
        suggestedAction:
          suggested <= 0
            ? null
            : canTransfer
              ? {
                  type: 'TRANSFER',
                  sourceLocationId: row.preferred_source_location_id!,
                  sourceLocationName: row.preferred_source_location_name!,
                  availableSurplus: row.source_surplus,
                  href: `/inventory/transfers/new?${query.toString()}&sourceLocationId=${row.preferred_source_location_id}`,
                }
              : row.preferred_supplier_id && row.preferred_supplier_name
                ? {
                    type: 'PURCHASE',
                    supplierId: row.preferred_supplier_id,
                    supplierName: row.preferred_supplier_name,
                    href: `/purchases?create=purchase&${query.toString()}&supplier=${row.preferred_supplier_id}`,
                  }
                : {
                    type: 'REVIEW_SOURCE',
                    href: `/inventory/replenishment?inventoryItemId=${row.inventory_item_id}&locationId=${row.location_id}`,
                  },
      };
    }),
    page,
    limit,
    total: Number(result.rows[0]?.total_count ?? 0),
  };
}
