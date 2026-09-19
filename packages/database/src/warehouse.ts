import { sql, type Kysely } from 'kysely';

import { appendAuditEvent } from './platform.js';
import type { DatabaseSchema } from './index.js';

export type LocationCapability =
  | 'STOCK_HOLDING'
  | 'PURCHASE_RECEIVING'
  | 'TRANSFER_SEND'
  | 'TRANSFER_RECEIVE'
  | 'ORDER_FULFILLMENT'
  | 'RETURN_RECEIVING'
  | 'CUSTOMER_PICKUP'
  | 'INTERNAL_STORAGE';

export class WarehouseDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
    this.name = 'WarehouseDomainError';
  }
}

export interface LocationSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly locationType: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly capabilities: readonly LocationCapability[];
  readonly version: number;
}

function mapLocation(row: {
  id: string;
  code: string;
  name: string;
  location_type: string;
  status: LocationSummary['status'];
  version: string;
  capabilities: string[] | null;
}): LocationSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    status: row.status,
    capabilities: (row.capabilities ?? []) as LocationCapability[],
    version: Number(row.version),
  };
}

export async function createLocation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code: string;
    name: string;
    locationType: string;
    capabilities: readonly LocationCapability[];
    address?: Record<string, unknown>;
  },
): Promise<LocationSummary> {
  if (input.capabilities.length === 0)
    throw new WarehouseDomainError(
      'VALIDATION_FAILED',
      'A Location needs at least one capability.',
    );
  return db.transaction().execute(async (transaction) => {
    const created = await sql<{
      id: string;
      code: string;
      name: string;
      location_type: string;
      status: LocationSummary['status'];
      version: string;
    }>`
      insert into warehouse.locations (organization_id, code, name, location_type, status, address_json)
      values (${input.organizationId}, ${input.code.trim().toUpperCase()}, ${input.name.trim()}, ${input.locationType}, 'ACTIVE', ${input.address ? JSON.stringify(input.address) : null}::jsonb)
      returning id, code, name, location_type, status, version::text
    `.execute(transaction);
    const location = created.rows[0];
    if (!location) throw new Error('Location creation did not return a location.');
    for (const capability of [...new Set(input.capabilities)]) {
      await sql`insert into warehouse.location_capabilities (organization_id, location_id, capability_code) values (${input.organizationId}, ${location.id}, ${capability})`.execute(
        transaction,
      );
    }
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'warehouse.location.created',
      targetType: 'warehouse.location',
      targetId: location.id,
      metadata: { code: location.code, capabilities: input.capabilities },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'warehouse.location.created', 1, 'warehouse.location', ${location.id}, 1, ${JSON.stringify({ locationId: location.id })}::jsonb, now())`.execute(
      transaction,
    );
    return {
      ...mapLocation({ ...location, capabilities: [...new Set(input.capabilities)] }),
      version: 1,
    };
  });
}

export async function listLocations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly LocationSummary[]> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    location_type: string;
    status: LocationSummary['status'];
    version: string;
    capabilities: string[] | null;
  }>`
    select location.id, location.code, location.name, location.location_type, location.status, location.version::text,
      array_remove(array_agg(capability.capability_code order by capability.capability_code), null) as capabilities
    from warehouse.locations location
    left join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id
    where location.organization_id = ${organizationId}
    group by location.id order by location.name, location.id
  `.execute(db);
  return result.rows.map(mapLocation);
}

export async function updateLocation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    locationId: string;
    expectedVersion: number;
    name?: string;
    capabilities?: readonly LocationCapability[];
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    address?: Record<string, unknown> | null;
  },
): Promise<LocationSummary> {
  return db.transaction().execute(async (transaction) => {
    const existing = await sql<{
      id: string;
      version: string;
    }>`select id, version::text from warehouse.locations where id = ${input.locationId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    if (!existing.rows[0]) throw new WarehouseDomainError('NOT_FOUND', 'Location was not found.');
    if (Number(existing.rows[0].version) !== input.expectedVersion)
      throw new WarehouseDomainError(
        'STALE_VERSION',
        'Location has changed; reload before saving.',
      );
    if (input.status && input.status !== 'ACTIVE') {
      const stock = await sql<{
        count: string;
      }>`select count(*)::text as count from inventory.inventory_levels where organization_id = ${input.organizationId} and location_id = ${input.locationId} and (sellable_quantity > 0 or unavailable_quantity > 0 or reserved_quantity > 0)`.execute(
        transaction,
      );
      if (Number(stock.rows[0]?.count ?? 0) > 0)
        throw new WarehouseDomainError(
          'VALIDATION_FAILED',
          'A Location with stock or reservations cannot be deactivated or archived.',
        );
    }
    if (input.capabilities && input.capabilities.length === 0)
      throw new WarehouseDomainError(
        'VALIDATION_FAILED',
        'A Location needs at least one capability.',
      );
    const updated = await sql<{
      id: string;
      code: string;
      name: string;
      location_type: string;
      status: LocationSummary['status'];
      version: string;
    }>`
      update warehouse.locations set
        name = coalesce(${input.name?.trim() ?? null}, name),
        status = coalesce(${input.status ?? null}, status),
        address_json = case when ${input.address !== undefined} then ${input.address ? JSON.stringify(input.address) : null}::jsonb else address_json end,
        version = version + 1,
        updated_at = now()
      where id = ${input.locationId} and organization_id = ${input.organizationId}
      returning id, code, name, location_type, status, version::text
    `.execute(transaction);
    if (input.capabilities) {
      await sql`delete from warehouse.location_capabilities where organization_id = ${input.organizationId} and location_id = ${input.locationId}`.execute(
        transaction,
      );
      for (const capability of [...new Set(input.capabilities)])
        await sql`insert into warehouse.location_capabilities (organization_id, location_id, capability_code) values (${input.organizationId}, ${input.locationId}, ${capability})`.execute(
          transaction,
        );
    }
    const location = updated.rows[0]!;
    const capabilities =
      input.capabilities ??
      (
        await sql<{
          capability_code: string;
        }>`select capability_code from warehouse.location_capabilities where location_id = ${input.locationId} order by capability_code`.execute(
          transaction,
        )
      ).rows.map((row) => row.capability_code as LocationCapability);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'warehouse.location.updated',
      targetType: 'warehouse.location',
      targetId: input.locationId,
      metadata: { status: input.status, capabilities: input.capabilities },
    });
    return mapLocation({ ...location, capabilities: [...capabilities] });
  });
}

export async function requireActiveLocationCapability(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  locationId: string,
  capability: LocationCapability,
): Promise<void> {
  const result = await sql<{
    id: string;
  }>`select location.id from warehouse.locations location join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id where location.id = ${locationId} and location.organization_id = ${organizationId} and location.status = 'ACTIVE' and capability.capability_code = ${capability}`.execute(
    db,
  );
  if (!result.rows[0])
    throw new WarehouseDomainError(
      'VALIDATION_FAILED',
      `Location is not active and eligible for ${capability}.`,
    );
}

export async function getLocationDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  locationId: string,
): Promise<
  | (LocationSummary & {
      readonly address: unknown;
      readonly inventorySummary: {
        readonly totalOnHand: string;
        readonly totalAvailable: string;
        readonly totalReserved: string;
        readonly totalDamaged: string;
        readonly totalIncoming: string;
        readonly lowStockSkus: number;
      };
    })
  | undefined
> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    location_type: string;
    status: LocationSummary['status'];
    version: string;
    capabilities: string[] | null;
    address_json: unknown;
    total_on_hand: string;
    total_available: string;
    total_reserved: string;
    total_damaged: string;
    low_stock_skus: string;
  }>`
    select location.id, location.code, location.name, location.location_type, location.status, location.version::text,
      location.address_json,
      array_remove(array_agg(capability.capability_code order by capability.capability_code), null) as capabilities,
      coalesce((select sum(sellable_quantity + unavailable_quantity) from inventory.inventory_levels where organization_id = location.organization_id and location_id = location.id), 0)::text as total_on_hand,
      coalesce((select sum(sellable_quantity - reserved_quantity) from inventory.inventory_levels where organization_id = location.organization_id and location_id = location.id), 0)::text as total_available,
      coalesce((select sum(reserved_quantity) from inventory.inventory_levels where organization_id = location.organization_id and location_id = location.id), 0)::text as total_reserved,
      coalesce((select sum(quantity) from inventory.inventory_level_conditions where organization_id = location.organization_id and location_id = location.id and condition_code = 'DAMAGED'), 0)::text as total_damaged,
      (select count(case when sellable_quantity - reserved_quantity > 0 and sellable_quantity - reserved_quantity <= 5 then 1 end) from inventory.inventory_levels where organization_id = location.organization_id and location_id = location.id)::text as low_stock_skus
    from warehouse.locations location
    left join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id
    where location.id = ${locationId} and location.organization_id = ${organizationId}
    group by location.id
  `.execute(db);

  const row = result.rows[0];
  if (!row) return undefined;

  return {
    ...mapLocation(row),
    address: row.address_json,
    inventorySummary: {
      totalOnHand: String(row.total_on_hand),
      totalAvailable: String(row.total_available),
      totalReserved: String(row.total_reserved),
      totalDamaged: String(row.total_damaged),
      totalIncoming: '0', // Future implementation
      lowStockSkus: Number(row.low_stock_skus),
    },
  };
}

type WarehouseTransferListRow = {
  id: string;
  transfer_number: string;
  source_location_id: string;
  destination_location_id: string;
  status: string;
  version: string;
  created_at: Date;
  dispatched_at: Date | null;
  completed_at: Date | null;
  source_location_name: string;
  destination_location_name: string;
  total_requested: string;
  total_dispatched: string;
  total_received: string;
  line_count: string;
};

export async function listWarehouseTransfers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    search?: string;
    status?: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: readonly {
    id: string;
    transferNumber: string;
    sourceLocationId: string;
    sourceLocationName: string;
    destinationLocationId: string;
    destinationLocationName: string;
    status: string;
    version: number;
    totalRequested: string;
    totalDispatched: string;
    totalReceived: string;
    lineCount: number;
    createdAt: Date;
    dispatchedAt: Date | null;
    completedAt: Date | null;
  }[];
  totalCount: number;
}> {
  const offset = ((input.page || 1) - 1) * (input.limit || 25);

  const statusFilter = input.status ? sql`t.status = ${input.status}` : sql`1=1`;
  const searchFilter = input.search
    ? sql`t.transfer_number ilike '%' || ${input.search} || '%'`
    : sql`1=1`;
  const sourceFilter = input.sourceLocationId
    ? sql`t.source_location_id = ${input.sourceLocationId}::uuid`
    : sql`1=1`;
  const destFilter = input.destinationLocationId
    ? sql`t.destination_location_id = ${input.destinationLocationId}::uuid`
    : sql`1=1`;

  const countResult = await sql<{ count: string }>`
    select count(*)::text as count
    from warehouse.transfers t
    where t.organization_id = ${organizationId}
      and ${statusFilter}
      and ${searchFilter}
      and ${sourceFilter}
      and ${destFilter}
  `.execute(db);

  const transfers = await sql<WarehouseTransferListRow>`
    select t.id, t.transfer_number, t.source_location_id, t.destination_location_id, t.status, t.version::text, t.created_at,
      t.dispatched_at, t.completed_at, sl.name as source_location_name, dl.name as destination_location_name,
      coalesce(sum(line.requested_quantity), 0)::text as total_requested,
      coalesce(sum(line.dispatched_quantity), 0)::text as total_dispatched,
      coalesce(sum(line.received_quantity), 0)::text as total_received,
      count(line.id)::text as line_count
    from warehouse.transfers t
    join warehouse.locations sl on sl.id = t.source_location_id
    join warehouse.locations dl on dl.id = t.destination_location_id
    left join warehouse.transfer_lines line on line.organization_id = t.organization_id and line.transfer_id = t.id
    where t.organization_id = ${organizationId}
      and ${statusFilter}
      and ${searchFilter}
      and ${sourceFilter}
      and ${destFilter}
    group by t.id, sl.name, dl.name
    order by t.created_at desc
    limit ${input.limit || 25} offset ${offset}
  `.execute(db);

  return {
    items: transfers.rows.map((t) => ({
      id: t.id,
      transferNumber: t.transfer_number,
      sourceLocationId: t.source_location_id,
      sourceLocationName: t.source_location_name,
      destinationLocationId: t.destination_location_id,
      destinationLocationName: t.destination_location_name,
      status: t.status,
      version: Number(t.version),
      totalRequested: t.total_requested,
      totalDispatched: t.total_dispatched,
      totalReceived: t.total_received,
      lineCount: Number(t.line_count),
      createdAt: t.created_at,
      dispatchedAt: t.dispatched_at,
      completedAt: t.completed_at,
    })),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function getTransferDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  transferId: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await sql<{
    id: string;
    transfer_number: string;
    source_location_id: string;
    destination_location_id: string;
    status: string;
    notes: string | null;
    created_by_actor_id: string | null;
    approved_at: Date | null;
    dispatched_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    version: string;
    source_location_name: string;
    destination_location_name: string;
  }>`
    select t.id, t.transfer_number, t.source_location_id, t.destination_location_id, t.status, t.notes, 
      t.created_by_actor_id, t.approved_at, t.dispatched_at, t.completed_at, t.created_at, t.version::text,
      sl.name as source_location_name, dl.name as destination_location_name
    from warehouse.transfers t
    join warehouse.locations sl on sl.id = t.source_location_id
    join warehouse.locations dl on dl.id = t.destination_location_id
    where t.id = ${transferId} and t.organization_id = ${organizationId}
  `.execute(db);

  const transfer = result.rows[0];
  if (!transfer) return undefined;

  const linesResult = await sql<{
    id: string;
    inventory_item_id: string;
    requested_quantity: string;
    dispatched_quantity: string;
    received_quantity: string;
    cancelled_quantity: string;
    discrepancy_disposition_code: 'MISSING' | 'LOST' | null;
    discrepancy_quantity: string | null;
    discrepancy_reason_code: string | null;
    discrepancy_notes: string | null;
    discrepancy_recorded_at: Date | null;
    variant_id: string;
    sku: string;
    product_title: string;
  }>`
    select tl.id, tl.inventory_item_id, tl.requested_quantity::text, tl.dispatched_quantity::text, tl.received_quantity::text, tl.cancelled_quantity::text,
      discrepancy.disposition_code as discrepancy_disposition_code, discrepancy.quantity::text as discrepancy_quantity,
      discrepancy.reason_code as discrepancy_reason_code, discrepancy.notes as discrepancy_notes, discrepancy.recorded_at as discrepancy_recorded_at,
      item.variant_id, variant.sku, product.title as product_title
    from warehouse.transfer_lines tl
    left join warehouse.transfer_line_discrepancies discrepancy on discrepancy.organization_id = tl.organization_id and discrepancy.transfer_line_id = tl.id
    join inventory.inventory_items item on item.id = tl.inventory_item_id
    join catalog.product_variants variant on variant.id = item.variant_id
    join catalog.products product on product.id = variant.product_id
    where tl.transfer_id = ${transferId} and tl.organization_id = ${organizationId}
    order by product.title, variant.sku
  `.execute(db);

  const totals = await sql<{
    requested: string;
    dispatched: string;
    received: string;
  }>`select coalesce(sum(requested_quantity), 0)::text as requested, coalesce(sum(dispatched_quantity), 0)::text as dispatched, coalesce(sum(received_quantity), 0)::text as received from warehouse.transfer_lines where organization_id = ${organizationId} and transfer_id = ${transferId}`.execute(
    db,
  );

  const lines = linesResult.rows.map((line) => ({
    id: line.id,
    inventoryItemId: line.inventory_item_id,
    variantId: line.variant_id,
    sku: line.sku,
    productTitle: line.product_title,
    requestedQuantity: String(line.requested_quantity),
    dispatchedQuantity: String(line.dispatched_quantity),
    receivedQuantity: String(line.received_quantity),
    cancelledQuantity: String(line.cancelled_quantity),
    discrepancy: line.discrepancy_quantity
      ? {
          dispositionCode: line.discrepancy_disposition_code!,
          quantity: line.discrepancy_quantity,
          reasonCode: line.discrepancy_reason_code!,
          notes: line.discrepancy_notes ?? undefined,
          recordedAt: line.discrepancy_recorded_at!.toISOString(),
        }
      : undefined,
  }));

  return {
    id: transfer.id,
    transferNumber: transfer.transfer_number,
    sourceLocationId: transfer.source_location_id,
    sourceLocationName: transfer.source_location_name,
    destinationLocationId: transfer.destination_location_id,
    destinationLocationName: transfer.destination_location_name,
    status: transfer.status,
    notes: transfer.notes,
    createdByActorId: transfer.created_by_actor_id,
    createdAt: transfer.created_at,
    approvedAt: transfer.approved_at,
    dispatchedAt: transfer.dispatched_at,
    completedAt: transfer.completed_at,
    version: Number(transfer.version),
    totalRequested: totals.rows[0]?.requested ?? '0',
    totalDispatched: totals.rows[0]?.dispatched ?? '0',
    totalReceived: totals.rows[0]?.received ?? '0',
    lineCount: lines.length,
    lines,
  };
}
