import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { receiveInboundInventoryInTransaction, type InventoryCondition } from './inventory.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

type DatabaseExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export type PurchaseStatus = 'DRAFT' | 'PLACED' | 'CANCELLED';
export type ShipmentStatus = 'PLANNED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
export type ReceivingStatus = 'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';

export class ProcurementDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'CONFLICT'
      | 'STALE_VERSION'
      | 'INVALID_TRANSITION'
      | 'OVER_RECEIPT'
      | 'IDEMPOTENCY_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'ProcurementDomainError';
  }
}

export interface SupplierView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly version: number;
}

export interface PurchaseView {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly status: PurchaseStatus;
  readonly version: number;
  readonly lines: readonly {
    id: string;
    variantId: string;
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string;
  }[];
}

export interface ShipmentView {
  readonly id: string;
  readonly shipmentNumber: string;
  readonly receivingLocationId: string;
  readonly receivingLocationName: string;
  readonly transportMode: string;
  readonly status: ShipmentStatus;
  readonly receivingStatus: ReceivingStatus;
  readonly version: number;
  readonly allocations: readonly {
    id: string;
    purchaseLineId: string;
    purchaseNumber: string;
    supplierName: string;
    variantId: string;
    sku: string;
    productTitle: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}

export interface InboundReceiptView {
  readonly id: string;
  readonly receiptNumber: string;
  readonly shipmentId: string;
  readonly locationId: string;
  readonly inventoryTransactionId: string;
  readonly status: 'POSTED';
  readonly lines: readonly {
    id: string;
    shipmentAllocationId: string;
    variantId: string;
    condition: InventoryCondition;
    quantity: string;
  }[];
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input);
}

function randomNumber(prefix: string): string {
  return `${prefix}-${new Date().getUTCFullYear()}-${crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 12)
    .toUpperCase()}`;
}

function positiveQuantity(value: string, name = 'Quantity'): void {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || /^0(?:\.0{1,6})?$/.test(value))
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      `${name} must be a positive decimal with at most six places.`,
    );
}

function integer(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 1_000_000n + BigInt(`${fraction}000000`.slice(0, 6));
}

async function beginIdempotent(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    request: unknown;
  },
): Promise<{ replay?: unknown; recordId?: string }> {
  try {
    const record = await claimIdempotencyRecord(db, {
      organizationId: input.organizationId,
      principalType: 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input.request),
    });
    if (!record.created) {
      const existing = await sql<{ safe_response: unknown; status: string }>`
        select safe_response, status from platform.idempotency_records where id = ${record.id}
      `.execute(db);
      if (existing.rows[0]?.status === 'SUCCEEDED')
        return { replay: existing.rows[0].safe_response };
      throw new ProcurementDomainError(
        'IDEMPOTENCY_CONFLICT',
        'The same procurement command is already in progress.',
      );
    }
    return { recordId: record.id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new ProcurementDomainError('IDEMPOTENCY_CONFLICT', error.message);
    throw error;
  }
}

async function completeIdempotency(
  db: DatabaseExecutor,
  recordId: string,
  entityType: string,
  entityId: string,
  response: unknown,
): Promise<void> {
  await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = ${entityType}, result_entity_id = ${entityId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${recordId}`.execute(
    db,
  );
}

async function emit(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    eventType: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, ${input.eventType}, 1, ${input.targetType}, ${input.targetId}::uuid, 1, ${JSON.stringify({ id: input.targetId })}::jsonb, now())`.execute(
    db,
  );
}

function mapSupplier(row: {
  id: string;
  code: string;
  name: string;
  status: SupplierView['status'];
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  version: string;
}): SupplierView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    ...(row.contact_name ? { contactName: row.contact_name } : {}),
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
    ...(row.contact_phone ? { contactPhone: row.contact_phone } : {}),
    version: Number(row.version),
  };
}

export async function createSupplier(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  },
): Promise<SupplierView> {
  if (!input.code.trim() || !input.name.trim())
    throw new ProcurementDomainError('VALIDATION_FAILED', 'Supplier code and name are required.');
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      version: string;
    }>`insert into procurement.suppliers (organization_id, code, name, contact_name, contact_email, contact_phone, notes) values (${input.organizationId}, ${input.code.trim()}, ${input.name.trim()}, ${input.contactName?.trim() || null}, ${input.contactEmail?.trim() || null}, ${input.contactPhone?.trim() || null}, ${input.notes?.trim() || null}) returning id, code, name, status, contact_name, contact_email, contact_phone, version::text`.execute(
      transaction,
    );
    const supplier = mapSupplier(result.rows[0]!);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.supplier.created',
      eventType: 'procurement.supplier.created',
      targetType: 'procurement.supplier',
      targetId: supplier.id,
      metadata: { code: supplier.code },
    });
    return supplier;
  });
}

export async function listSuppliers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly SupplierView[]> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    status: SupplierView['status'];
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    version: string;
  }>`select id, code, name, status, contact_name, contact_email, contact_phone, version::text from procurement.suppliers where organization_id = ${organizationId} order by status, name, id`.execute(
    db,
  );
  return result.rows.map(mapSupplier);
}

export async function archiveSupplier(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; supplierId: string; expectedVersion: number },
): Promise<SupplierView> {
  return db.transaction().execute(async (transaction) => {
    const result = await sql<{
      id: string;
      code: string;
      name: string;
      status: SupplierView['status'];
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      version: string;
    }>`update procurement.suppliers set status = 'ARCHIVED', version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and id = ${input.supplierId} and version = ${input.expectedVersion} returning id, code, name, status, contact_name, contact_email, contact_phone, version::text`.execute(
      transaction,
    );
    const supplier = result.rows[0];
    if (!supplier) {
      const exists = await sql<{
        id: string;
      }>`select id from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId}`.execute(
        transaction,
      );
      throw new ProcurementDomainError(
        exists.rows[0] ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0] ? 'Supplier changed; reload before archiving.' : 'Supplier was not found.',
      );
    }
    const view = mapSupplier(supplier);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.supplier.archived',
      eventType: 'procurement.supplier.archived',
      targetType: 'procurement.supplier',
      targetId: view.id,
    });
    return view;
  });
}

async function getPurchaseIn(
  db: DatabaseExecutor,
  organizationId: string,
  purchaseId: string,
): Promise<PurchaseView> {
  const header = await sql<{
    id: string;
    purchase_number: string;
    supplier_id: string;
    supplier_name: string;
    currency_code: PurchaseView['currencyCode'];
    status: PurchaseStatus;
    version: string;
  }>`select purchase.id, purchase.purchase_number, purchase.supplier_id, supplier.name as supplier_name, purchase.currency_code, purchase.status, purchase.version::text from procurement.purchases purchase join procurement.suppliers supplier on supplier.id = purchase.supplier_id where purchase.organization_id = ${organizationId} and purchase.id = ${purchaseId}`.execute(
    db,
  );
  const row = header.rows[0];
  if (!row) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
  const lines = await sql<{
    id: string;
    variant_id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    quantity: string;
    unit_price: string;
  }>`select id, variant_id, sku_snapshot, product_title_snapshot, quantity::text, unit_price::text from procurement.purchase_lines where organization_id = ${organizationId} and purchase_id = ${purchaseId} order by created_at, id`.execute(
    db,
  );
  return {
    id: row.id,
    purchaseNumber: row.purchase_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    currencyCode: row.currency_code,
    status: row.status,
    version: Number(row.version),
    lines: lines.rows.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      quantity: line.quantity,
      unitPrice: line.unit_price,
    })),
  };
}

export async function getPurchase(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; purchaseId: string },
): Promise<PurchaseView> {
  return getPurchaseIn(db, input.organizationId, input.purchaseId);
}

export async function listPurchases(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PurchaseView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from procurement.purchases where organization_id = ${organizationId} order by created_at desc, id desc`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getPurchaseIn(db, organizationId, row.id)));
}

export async function createPurchase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    supplierId: string;
    currencyCode: PurchaseView['currencyCode'];
    notes?: string;
  },
): Promise<PurchaseView> {
  return db.transaction().execute(async (transaction) => {
    const supplier = await sql<{
      id: string;
    }>`select id from procurement.suppliers where organization_id = ${input.organizationId} and id = ${input.supplierId} and status = 'ACTIVE' for key share`.execute(
      transaction,
    );
    if (!supplier.rows[0])
      throw new ProcurementDomainError('NOT_FOUND', 'Active Supplier was not found.');
    const created = await sql<{
      id: string;
    }>`insert into procurement.purchases (organization_id, purchase_number, supplier_id, currency_code, notes, created_by_actor_id) values (${input.organizationId}, ${randomNumber('PO')}, ${input.supplierId}, ${input.currencyCode}, ${input.notes?.trim() || null}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const purchase = await getPurchaseIn(transaction, input.organizationId, created.rows[0]!.id);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.created',
      eventType: 'procurement.purchase.created',
      targetType: 'procurement.purchase',
      targetId: purchase.id,
    });
    return purchase;
  });
}

export async function addPurchaseLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    purchaseId: string;
    variantId: string;
    quantity: string;
    unitPrice: string;
  },
): Promise<PurchaseView> {
  positiveQuantity(input.quantity);
  if (!/^\d+(?:\.\d{1,4})?$/.test(input.unitPrice))
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Unit price must be a non-negative decimal.',
    );
  return db.transaction().execute(async (transaction) => {
    const purchase = await sql<{
      status: PurchaseStatus;
    }>`select status from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (purchase.rows[0].status !== 'DRAFT')
      throw new ProcurementDomainError('INVALID_TRANSITION', 'Only Draft Purchases can be edited.');
    const variant = await sql<{
      sku: string;
      title: string;
    }>`select variant.sku, product.title from catalog.product_variants variant join catalog.products product on product.id = variant.product_id where variant.organization_id = ${input.organizationId} and variant.id = ${input.variantId}`.execute(
      transaction,
    );
    if (!variant.rows[0])
      throw new ProcurementDomainError('NOT_FOUND', 'Catalog Variant was not found.');
    await sql`insert into procurement.purchase_lines (organization_id, purchase_id, variant_id, sku_snapshot, product_title_snapshot, quantity, unit_price) values (${input.organizationId}, ${input.purchaseId}, ${input.variantId}, ${variant.rows[0].sku}, ${variant.rows[0].title}, ${input.quantity}::numeric, ${input.unitPrice}::numeric)`.execute(
      transaction,
    );
    await sql`update procurement.purchases set version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.line_added',
      eventType: 'procurement.purchase.line_added',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
      metadata: { variantId: input.variantId, quantity: input.quantity },
    });
    return view;
  });
}

export async function placePurchase(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; purchaseId: string; expectedVersion: number },
): Promise<PurchaseView> {
  return db.transaction().execute(async (transaction) => {
    const purchase = await sql<{
      status: PurchaseStatus;
      version: string;
    }>`select status, version::text from procurement.purchases where organization_id = ${input.organizationId} and id = ${input.purchaseId} for update`.execute(
      transaction,
    );
    if (!purchase.rows[0]) throw new ProcurementDomainError('NOT_FOUND', 'Purchase was not found.');
    if (Number(purchase.rows[0].version) !== input.expectedVersion)
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Purchase changed; reload before placing it.',
      );
    if (purchase.rows[0].status !== 'DRAFT')
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only a Draft Purchase can be placed.',
      );
    const lines = await sql<{
      count: string;
    }>`select count(*)::text as count from procurement.purchase_lines where purchase_id = ${input.purchaseId}`.execute(
      transaction,
    );
    if (Number(lines.rows[0]?.count ?? 0) === 0)
      throw new ProcurementDomainError('VALIDATION_FAILED', 'A Purchase needs at least one line.');
    await sql`update procurement.purchases set status = 'PLACED', placed_at = now(), version = version + 1, updated_at = now() where id = ${input.purchaseId}`.execute(
      transaction,
    );
    const view = await getPurchaseIn(transaction, input.organizationId, input.purchaseId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'procurement.purchase.placed',
      eventType: 'procurement.purchase.placed',
      targetType: 'procurement.purchase',
      targetId: input.purchaseId,
    });
    return view;
  });
}

async function getShipmentIn(
  db: DatabaseExecutor,
  organizationId: string,
  shipmentId: string,
): Promise<ShipmentView> {
  const header = await sql<{
    id: string;
    shipment_number: string;
    receiving_location_id: string;
    receiving_location_name: string;
    transport_mode: string;
    status: ShipmentStatus;
    receiving_status: ReceivingStatus;
    version: string;
  }>`select shipment.id, shipment.shipment_number, shipment.receiving_location_id, location.name as receiving_location_name, shipment.transport_mode, shipment.status, shipment.receiving_status, shipment.version::text from inbound_shipment.shipments shipment join warehouse.locations location on location.id = shipment.receiving_location_id where shipment.organization_id = ${organizationId} and shipment.id = ${shipmentId}`.execute(
    db,
  );
  const row = header.rows[0];
  if (!row) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
  const allocations = await sql<{
    id: string;
    purchase_line_id: string;
    purchase_number: string;
    supplier_name: string;
    variant_id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    allocated_quantity: string;
    received_quantity: string;
  }>`select allocation.id, allocation.purchase_line_id, purchase.purchase_number, supplier.name as supplier_name, allocation.variant_id, allocation.sku_snapshot, allocation.product_title_snapshot, allocation.allocated_quantity::text, coalesce(sum(receipt_line.quantity), 0)::text as received_quantity from inbound_shipment.purchase_line_allocations allocation join procurement.purchase_lines purchase_line on purchase_line.id = allocation.purchase_line_id join procurement.purchases purchase on purchase.id = purchase_line.purchase_id join procurement.suppliers supplier on supplier.id = purchase.supplier_id left join receiving.inbound_receipt_lines receipt_line on receipt_line.shipment_allocation_id = allocation.id where allocation.organization_id = ${organizationId} and allocation.shipment_id = ${shipmentId} group by allocation.id, purchase.purchase_number, supplier.name order by allocation.created_at, allocation.id`.execute(
    db,
  );
  return {
    id: row.id,
    shipmentNumber: row.shipment_number,
    receivingLocationId: row.receiving_location_id,
    receivingLocationName: row.receiving_location_name,
    transportMode: row.transport_mode,
    status: row.status,
    receivingStatus: row.receiving_status,
    version: Number(row.version),
    allocations: allocations.rows.map((allocation) => ({
      id: allocation.id,
      purchaseLineId: allocation.purchase_line_id,
      purchaseNumber: allocation.purchase_number,
      supplierName: allocation.supplier_name,
      variantId: allocation.variant_id,
      sku: allocation.sku_snapshot,
      productTitle: allocation.product_title_snapshot,
      allocatedQuantity: allocation.allocated_quantity,
      receivedQuantity: allocation.received_quantity,
    })),
  };
}

export async function getShipment(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; shipmentId: string },
): Promise<ShipmentView> {
  return getShipmentIn(db, input.organizationId, input.shipmentId);
}

export async function listShipments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly ShipmentView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from inbound_shipment.shipments where organization_id = ${organizationId} order by created_at desc, id desc`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getShipmentIn(db, organizationId, row.id)));
}

export async function createShipment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receivingLocationId: string;
    transportMode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
    originText?: string;
    trackingReference?: string;
    allocations: readonly { purchaseLineId: string; quantity: string }[];
  },
): Promise<ShipmentView> {
  if (!input.allocations.length)
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'A Shipment needs at least one Purchase line allocation.',
    );
  const unique = new Set(input.allocations.map((allocation) => allocation.purchaseLineId));
  if (unique.size !== input.allocations.length)
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'Each Purchase line may be allocated once per Shipment.',
    );
  for (const allocation of input.allocations)
    positiveQuantity(allocation.quantity, 'Allocation quantity');
  return db.transaction().execute(async (transaction) => {
    const location = await sql<{
      id: string;
    }>`select location.id from warehouse.locations location join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id where location.organization_id = ${input.organizationId} and location.id = ${input.receivingLocationId} and location.status = 'ACTIVE' and capability.capability_code = 'PURCHASE_RECEIVING'`.execute(
      transaction,
    );
    if (!location.rows[0])
      throw new ProcurementDomainError(
        'VALIDATION_FAILED',
        'Receiving Location must be active and have PURCHASE_RECEIVING capability.',
      );
    const inserted = await sql<{
      id: string;
    }>`insert into inbound_shipment.shipments (organization_id, shipment_number, receiving_location_id, transport_mode, origin_text, tracking_reference, created_by_actor_id) values (${input.organizationId}, ${randomNumber('SH')}, ${input.receivingLocationId}, ${input.transportMode}, ${input.originText?.trim() || null}, ${input.trackingReference?.trim() || null}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const shipmentId = inserted.rows[0]!.id;
    for (const allocation of [...input.allocations].sort((left, right) =>
      left.purchaseLineId.localeCompare(right.purchaseLineId),
    )) {
      const line = await sql<{
        id: string;
        variant_id: string;
        sku_snapshot: string;
        product_title_snapshot: string;
        quantity: string;
      }>`select line.id, line.variant_id, line.sku_snapshot, line.product_title_snapshot, line.quantity::text from procurement.purchase_lines line join procurement.purchases purchase on purchase.id = line.purchase_id where line.organization_id = ${input.organizationId} and line.id = ${allocation.purchaseLineId} and purchase.status = 'PLACED' for update of line`.execute(
        transaction,
      );
      const purchaseLine = line.rows[0];
      if (!purchaseLine)
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Placed Purchase Line was not found in this organization.',
        );
      const assigned = await sql<{
        quantity: string;
      }>`select coalesce(sum(allocated_quantity), 0)::text as quantity from inbound_shipment.purchase_line_allocations where organization_id = ${input.organizationId} and purchase_line_id = ${allocation.purchaseLineId}`.execute(
        transaction,
      );
      if (
        integer(assigned.rows[0]?.quantity ?? '0') + integer(allocation.quantity) >
        integer(purchaseLine.quantity)
      )
        throw new ProcurementDomainError(
          'CONFLICT',
          'Shipment allocation exceeds the unresolved Purchase Line quantity.',
        );
      await sql`insert into inbound_shipment.purchase_line_allocations (organization_id, shipment_id, purchase_line_id, variant_id, sku_snapshot, product_title_snapshot, allocated_quantity) values (${input.organizationId}, ${shipmentId}, ${purchaseLine.id}, ${purchaseLine.variant_id}, ${purchaseLine.sku_snapshot}, ${purchaseLine.product_title_snapshot}, ${allocation.quantity}::numeric)`.execute(
        transaction,
      );
    }
    const shipment = await getShipmentIn(transaction, input.organizationId, shipmentId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.created',
      eventType: 'inbound_shipment.created',
      targetType: 'inbound_shipment.shipment',
      targetId: shipmentId,
      metadata: { allocationCount: input.allocations.length },
    });
    return shipment;
  });
}

export async function markShipmentArrived(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<ShipmentView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inbound-shipment.arrive',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as ShipmentView;
    const result = await sql<{
      id: string;
      status: ShipmentStatus;
      version: string;
    }>`select id, status, version::text from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    const shipment = result.rows[0];
    if (!shipment) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    if (Number(shipment.version) !== input.expectedVersion)
      throw new ProcurementDomainError(
        'STALE_VERSION',
        'Shipment changed; reload before marking arrival.',
      );
    if (!['PLANNED', 'IN_TRANSIT'].includes(shipment.status))
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only planned or in-transit Shipments can arrive.',
      );
    await sql`update inbound_shipment.shipments set status = 'ARRIVED', arrived_at = now(), version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );
    const view = await getShipmentIn(transaction, input.organizationId, input.shipmentId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inbound_shipment.shipment',
      view.id,
      view,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inbound_shipment.arrived',
      eventType: 'inbound_shipment.arrived',
      targetType: 'inbound_shipment.shipment',
      targetId: view.id,
    });
    return view;
  });
}

async function getReceiptIn(
  db: DatabaseExecutor,
  organizationId: string,
  receiptId: string,
): Promise<InboundReceiptView> {
  const header = await sql<{
    id: string;
    receipt_number: string;
    shipment_id: string;
    receiving_location_id: string;
    posted_inventory_transaction_id: string;
  }>`select id, receipt_number, shipment_id, receiving_location_id, posted_inventory_transaction_id from receiving.inbound_receipts where organization_id = ${organizationId} and id = ${receiptId}`.execute(
    db,
  );
  const receipt = header.rows[0];
  if (!receipt) throw new ProcurementDomainError('NOT_FOUND', 'Inbound Receipt was not found.');
  const lines = await sql<{
    id: string;
    shipment_allocation_id: string;
    variant_id: string;
    condition_code: InventoryCondition;
    quantity: string;
  }>`select id, shipment_allocation_id, variant_id, condition_code, quantity::text from receiving.inbound_receipt_lines where organization_id = ${organizationId} and inbound_receipt_id = ${receiptId} order by created_at, id`.execute(
    db,
  );
  return {
    id: receipt.id,
    receiptNumber: receipt.receipt_number,
    shipmentId: receipt.shipment_id,
    locationId: receipt.receiving_location_id,
    inventoryTransactionId: receipt.posted_inventory_transaction_id,
    status: 'POSTED',
    lines: lines.rows.map((line) => ({
      id: line.id,
      shipmentAllocationId: line.shipment_allocation_id,
      variantId: line.variant_id,
      condition: line.condition_code,
      quantity: line.quantity,
    })),
  };
}

export async function listInboundReceipts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly InboundReceiptView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from receiving.inbound_receipts where organization_id = ${organizationId} order by posted_at desc, id desc`.execute(
    db,
  );
  return Promise.all(ids.rows.map((row) => getReceiptIn(db, organizationId, row.id)));
}

export async function postInboundReceipt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    lines: readonly {
      shipmentAllocationId: string;
      condition: InventoryCondition;
      quantity: string;
    }[];
    idempotencyKey: string;
    /** Test-only transactional probe; production callers must never provide it. */
    fault?: () => void;
  },
): Promise<InboundReceiptView> {
  if (!input.lines.length)
    throw new ProcurementDomainError(
      'VALIDATION_FAILED',
      'An Inbound Receipt needs at least one counted line.',
    );
  for (const line of input.lines) positiveQuantity(line.quantity, 'Received quantity');
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'receiving.post-inbound-receipt',
      idempotencyKey: input.idempotencyKey,
      request: { ...input, fault: undefined },
    });
    if (started.replay) return started.replay as InboundReceiptView;
    const shipment = await sql<{
      id: string;
      status: ShipmentStatus;
      receiving_location_id: string;
    }>`select id, status, receiving_location_id from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
      transaction,
    );
    const shipmentRow = shipment.rows[0];
    if (!shipmentRow)
      throw new ProcurementDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    if (shipmentRow.status !== 'ARRIVED')
      throw new ProcurementDomainError(
        'INVALID_TRANSITION',
        'Only an arrived Shipment can be physically received.',
      );
    const byAllocation = new Map<string, { condition: InventoryCondition; quantity: string }[]>();
    for (const line of input.lines) {
      const existing = byAllocation.get(line.shipmentAllocationId) ?? [];
      existing.push({ condition: line.condition, quantity: line.quantity });
      byAllocation.set(line.shipmentAllocationId, existing);
    }
    const allocationRows = new Map<
      string,
      { id: string; variant_id: string; allocated_quantity: string }
    >();
    for (const allocationId of [...byAllocation.keys()].sort()) {
      const locked = await sql<{
        id: string;
        variant_id: string;
        allocated_quantity: string;
      }>`select id, variant_id, allocated_quantity::text from inbound_shipment.purchase_line_allocations where organization_id = ${input.organizationId} and shipment_id = ${input.shipmentId} and id = ${allocationId} for update`.execute(
        transaction,
      );
      const allocation = locked.rows[0];
      if (!allocation)
        throw new ProcurementDomainError(
          'NOT_FOUND',
          'Shipment Allocation was not found in this Shipment.',
        );
      const alreadyReceived = await sql<{
        quantity: string;
      }>`select coalesce(sum(quantity), 0)::text as quantity from receiving.inbound_receipt_lines where shipment_allocation_id = ${allocationId}`.execute(
        transaction,
      );
      const newQuantity = byAllocation
        .get(allocationId)!
        .reduce((sum, line) => sum + integer(line.quantity), 0n);
      if (
        integer(alreadyReceived.rows[0]?.quantity ?? '0') + newQuantity >
        integer(allocation.allocated_quantity)
      )
        throw new ProcurementDomainError(
          'OVER_RECEIPT',
          'Receipt quantity exceeds the Shipment Allocation quantity.',
        );
      allocationRows.set(allocationId, allocation);
    }
    const receipt = await sql<{
      id: string;
    }>`insert into receiving.inbound_receipts (organization_id, receipt_number, shipment_id, receiving_location_id, created_by_actor_id) values (${input.organizationId}, ${randomNumber('RCV')}, ${input.shipmentId}, ${shipmentRow.receiving_location_id}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const receiptId = receipt.rows[0]!.id;
    const inventory = await receiveInboundInventoryInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId,
      locationId: shipmentRow.receiving_location_id,
      idempotencyRecordId: started.recordId!,
      lines: input.lines.map((line) => ({
        variantId: allocationRows.get(line.shipmentAllocationId)!.variant_id,
        condition: line.condition,
        quantity: line.quantity,
      })),
    });
    await sql`update receiving.inbound_receipts set posted_inventory_transaction_id = ${inventory.transactionId}::uuid where id = ${receiptId}`.execute(
      transaction,
    );
    for (const line of input.lines) {
      const allocation = allocationRows.get(line.shipmentAllocationId)!;
      await sql`insert into receiving.inbound_receipt_lines (organization_id, inbound_receipt_id, shipment_allocation_id, variant_id, condition_code, quantity) values (${input.organizationId}, ${receiptId}, ${line.shipmentAllocationId}, ${allocation.variant_id}, ${line.condition}, ${line.quantity}::numeric)`.execute(
        transaction,
      );
    }
    const totals = await sql<{
      allocated: string;
      received: string;
    }>`select coalesce(sum(allocation.allocated_quantity), 0)::text as allocated, coalesce((select sum(line.quantity) from receiving.inbound_receipt_lines line join inbound_shipment.purchase_line_allocations allocation_line on allocation_line.id = line.shipment_allocation_id where allocation_line.shipment_id = ${input.shipmentId}), 0)::text as received from inbound_shipment.purchase_line_allocations allocation where allocation.shipment_id = ${input.shipmentId}`.execute(
      transaction,
    );
    const total = totals.rows[0]!;
    const receivingStatus: ReceivingStatus =
      integer(total.received) >= integer(total.allocated) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await sql`update inbound_shipment.shipments set receiving_status = ${receivingStatus}, version = version + 1, updated_at = now() where id = ${input.shipmentId}`.execute(
      transaction,
    );
    input.fault?.();
    const view = await getReceiptIn(transaction, input.organizationId, receiptId);
    await completeIdempotency(
      transaction,
      started.recordId!,
      'receiving.inbound_receipt',
      receiptId,
      view,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'receiving.inbound_receipt.posted',
      eventType: 'receiving.inbound_receipt.posted',
      targetType: 'receiving.inbound_receipt',
      targetId: receiptId,
      metadata: { shipmentId: input.shipmentId, inventoryTransactionId: inventory.transactionId },
    });
    return view;
  });
}
