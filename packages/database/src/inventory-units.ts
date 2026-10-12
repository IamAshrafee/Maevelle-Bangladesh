import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  moveInventoryConditionInTransaction,
  writeOffInventoryInTransaction,
  type InventoryCondition,
} from './inventory.js';
import { requireActiveLocationCapability } from './warehouse.js';

export type UnitCondition =
  | 'GRADE_A'
  | 'GRADE_B'
  | 'REPAIR_REQUIRED'
  | 'DAMAGED_UNSELLABLE';

export type UnitStatus =
  | 'AWAITING_QC'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_FULFILLMENT'
  | 'IN_TRANSFER'
  | 'DISPATCHED'
  | 'ON_HOLD'
  | 'RETURNED'
  | 'WRITTEN_OFF';

export type UnitSourceType =
  | 'INBOUND_RECEIPT'
  | 'STOCK_CONVERSION'
  | 'RETURN_RECEIPT'
  | 'MANUAL_INTAKE';

export type InspectionStage =
  | 'INBOUND_INTAKE'
  | 'REINSPECTION'
  | 'RETURN_INSPECTION'
  | 'ROUTINE_AUDIT';

export type InspectionOutcome =
  | 'PASSED'
  | 'PASSED_WITH_DEFECT'
  | 'HOLD_FOR_REPAIR'
  | 'QUARANTINE_DAMAGED';

export type InspectionDisposition =
  | 'RELEASE_SELLABLE'
  | 'RESTRICTED_SALE'
  | 'MOVE_TO_REPAIR'
  | 'WRITE_OFF'
  | 'HOLD';

export type RepairStatus =
  | 'REQUESTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type UnitEventType =
  | 'REGISTERED'
  | 'INSPECTED'
  | 'CONDITION_CHANGED'
  | 'STATUS_CHANGED'
  | 'REPAIR_REQUESTED'
  | 'REPAIR_STARTED'
  | 'REPAIR_COMPLETED'
  | 'LOCATION_MOVED'
  | 'REPACKAGED'
  | 'ALLOCATED_TO_FULFILLMENT'
  | 'RELEASED_FROM_FULFILLMENT'
  | 'PICKED'
  | 'PACKED'
  | 'DISPATCHED'
  | 'TRANSFER_DISPATCHED'
  | 'TRANSFER_RECEIVED'
  | 'RETURNED'
  | 'RETURN_INSPECTED'
  | 'RELEASED_FOR_SALE'
  | 'QUARANTINED'
  | 'WRITTEN_OFF'
  | 'AUTHORIZED_CORRECTION';

export type VariantTrackingMode = 'STANDARD' | 'SERIAL';

export class UnitTraceabilityDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'INVALID_TRANSITION'
      | 'STALE_VERSION'
      | 'RESERVATION_CONFLICT'
      | 'UNAUTHORIZED_ACCESS',
    message: string,
  ) {
    super(message);
    this.name = 'UnitTraceabilityDomainError';
  }
}

export type DatabaseExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export function withUnitTransaction<T>(
  db: DatabaseExecutor,
  callback: (trx: Transaction<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if ('isTransaction' in db && (db as { isTransaction?: boolean }).isTransaction) {
    return callback(db as unknown as Transaction<DatabaseSchema>);
  }
  return (db as Kysely<DatabaseSchema>).transaction().execute(callback);
}

/**
 * Generates an atomic sequential Unit Code with the format MVU-000101
 * using platform.number_sequences with a NEVER reset policy.
 */
export async function nextUnitCode(
  db: DatabaseExecutor,
  organizationId: string,
): Promise<string> {
  await sql`
    insert into platform.number_sequences (
      organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding
    )
    values (${organizationId}, 'INVENTORY_UNIT', 'MVU-', 0, 'NEVER', null, 6)
    on conflict (organization_id, sequence_type) where sequence_year is null do nothing
  `.execute(db);

  const updated = await sql<{ prefix: string; counter_value: string; padding: number }>`
    update platform.number_sequences
    set counter_value = counter_value + 1, version = version + 1, updated_at = now()
    where organization_id = ${organizationId} and sequence_type = 'INVENTORY_UNIT' and sequence_year is null
    returning prefix, counter_value::text, padding
  `.execute(db);

  const row = updated.rows[0];
  if (!row) {
    throw new UnitTraceabilityDomainError(
      'CONFLICT',
      'Inventory unit number sequence could not be updated.',
    );
  }
  return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
}

async function nextInspectionNumber(
  db: DatabaseExecutor,
  organizationId: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `INSP-${year}-`;
  await sql`
    insert into platform.number_sequences (
      organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding
    )
    values (${organizationId}, 'UNIT_INSPECTION', ${prefix}, 0, 'YEARLY', ${year}, 6)
    on conflict (organization_id, sequence_type, sequence_year) where sequence_year is not null do nothing
  `.execute(db);

  const updated = await sql<{ prefix: string; counter_value: string; padding: number }>`
    update platform.number_sequences
    set counter_value = counter_value + 1, version = version + 1, updated_at = now()
    where organization_id = ${organizationId} and sequence_type = 'UNIT_INSPECTION' and sequence_year = ${year}
    returning prefix, counter_value::text, padding
  `.execute(db);

  const row = updated.rows[0];
  if (!row) {
    throw new UnitTraceabilityDomainError(
      'CONFLICT',
      'Unit inspection number sequence could not be updated.',
    );
  }
  return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
}

async function nextRepairNumber(
  db: DatabaseExecutor,
  organizationId: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `REP-${year}-`;
  await sql`
    insert into platform.number_sequences (
      organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding
    )
    values (${organizationId}, 'UNIT_REPAIR', ${prefix}, 0, 'YEARLY', ${year}, 6)
    on conflict (organization_id, sequence_type, sequence_year) where sequence_year is not null do nothing
  `.execute(db);

  const updated = await sql<{ prefix: string; counter_value: string; padding: number }>`
    update platform.number_sequences
    set counter_value = counter_value + 1, version = version + 1, updated_at = now()
    where organization_id = ${organizationId} and sequence_type = 'UNIT_REPAIR' and sequence_year = ${year}
    returning prefix, counter_value::text, padding
  `.execute(db);

  const row = updated.rows[0];
  if (!row) {
    throw new UnitTraceabilityDomainError(
      'CONFLICT',
      'Unit repair number sequence could not be updated.',
    );
  }
  return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
}

/**
 * Append-only immutable unit event logger.
 */
export async function appendUnitEventInTransaction(
  trx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    unitId: string;
    eventType: UnitEventType;
    actorId?: string | null;
    actorType?: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    fromCondition?: string | null;
    toCondition?: string | null;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await sql`
    insert into inventory.unit_events (
      organization_id, unit_id, event_type, actor_type, actor_id,
      from_status, to_status, from_condition, to_condition,
      from_location_id, to_location_id, reference_type, reference_id,
      reason, metadata
    ) values (
      ${input.organizationId}, ${input.unitId}, ${input.eventType},
      ${input.actorType ?? 'USER'}, ${input.actorId ?? null},
      ${input.fromStatus ?? null}, ${input.toStatus ?? null},
      ${input.fromCondition ?? null}, ${input.toCondition ?? null},
      ${input.fromLocationId ?? null}, ${input.toLocationId ?? null},
      ${input.referenceType ?? null}, ${input.referenceId ?? null},
      ${input.reason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `.execute(trx);
}

export interface InventoryUnitRow {
  readonly id: string;
  readonly unit_code: string;
  readonly inventory_item_id: string;
  readonly variant_id: string;
  readonly location_id: string;
  readonly inventory_condition_code: InventoryCondition;
  readonly current_condition: UnitCondition;
  readonly status: UnitStatus;
  readonly source_type: UnitSourceType;
  readonly source_receipt_id: string | null;
  readonly source_receipt_line_id: string | null;
  readonly source_return_receipt_id: string | null;
  readonly package_reference: string | null;
  readonly storage_notes: string | null;
  readonly barcode_payload: string;
  readonly current_fulfillment_id: string | null;
  readonly current_fulfillment_line_id: string | null;
  readonly current_order_id: string | null;
  readonly current_order_line_id: string | null;
  readonly registered_by_actor_id: string | null;
  readonly version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly product_id?: string;
  readonly product_title?: string;
  readonly sku?: string;
  readonly option_summary?: string | null;
  readonly location_name?: string;
  readonly location_code?: string;
  readonly source_receipt_number?: string | null;
  readonly current_fulfillment_number?: string | null;
  readonly current_order_number?: string | null;
}

export interface InventoryUnitView {
  readonly id: string;
  readonly unitCode: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly sku: string;
  readonly optionSummary: string | null;
  readonly locationId: string;
  readonly locationName: string;
  readonly locationCode: string;
  readonly inventoryCondition: InventoryCondition;
  readonly currentCondition: UnitCondition;
  readonly status: UnitStatus;
  readonly sourceType: UnitSourceType;
  readonly sourceReceiptId: string | null;
  readonly sourceReceiptNumber: string | null;
  readonly sourceReceiptLineId: string | null;
  readonly sourceReturnReceiptId: string | null;
  readonly packageReference: string | null;
  readonly storageNotes: string | null;
  readonly barcodePayload: string;
  readonly currentFulfillmentId: string | null;
  readonly currentFulfillmentNumber: string | null;
  readonly currentOrderId: string | null;
  readonly currentOrderNumber: string | null;
  readonly registeredByActorId: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UnitInspectionView {
  readonly id: string;
  readonly unitId: string;
  readonly unitCode: string;
  readonly inspectionNumber: string;
  readonly inspectorActorId: string | null;
  readonly inspectorName: string | null;
  readonly inspectionStage: InspectionStage;
  readonly conditionResult: UnitCondition;
  readonly defectDescription: string | null;
  readonly notes: string | null;
  readonly mediaAssetIds: readonly string[];
  readonly inspectionOutcome: InspectionOutcome;
  readonly disposition: InspectionDisposition | null;
  readonly createdAt: string;
}

export interface UnitRepairView {
  readonly id: string;
  readonly unitId: string;
  readonly unitCode: string;
  readonly repairNumber: string;
  readonly repairStatus: RepairStatus;
  readonly defectDescription: string;
  readonly actionRequired: string | null;
  readonly actionPerformed: string | null;
  readonly technicianName: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string;
  readonly mediaAssetIds: readonly string[];
  readonly notes: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UnitEventView {
  readonly id: string;
  readonly eventId: string;
  readonly unitId: string;
  readonly unitCode: string;
  readonly eventType: UnitEventType;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly fromCondition: string | null;
  readonly toCondition: string | null;
  readonly fromLocationId: string | null;
  readonly toLocationId: string | null;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly reason: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

function mapUnitRow(row: InventoryUnitRow): InventoryUnitView {
  return {
    id: row.id,
    unitCode: row.unit_code,
    inventoryItemId: row.inventory_item_id,
    variantId: row.variant_id,
    productId: row.product_id ?? '',
    productTitle: row.product_title ?? '',
    sku: row.sku ?? '',
    optionSummary: row.option_summary ?? null,
    locationId: row.location_id,
    locationName: row.location_name ?? '',
    locationCode: row.location_code ?? '',
    inventoryCondition: row.inventory_condition_code,
    currentCondition: row.current_condition,
    status: row.status,
    sourceType: row.source_type,
    sourceReceiptId: row.source_receipt_id,
    sourceReceiptNumber: row.source_receipt_number ?? null,
    sourceReceiptLineId: row.source_receipt_line_id,
    sourceReturnReceiptId: row.source_return_receipt_id,
    packageReference: row.package_reference,
    storageNotes: row.storage_notes,
    barcodePayload: row.barcode_payload,
    currentFulfillmentId: row.current_fulfillment_id,
    currentFulfillmentNumber: row.current_fulfillment_number ?? null,
    currentOrderId: row.current_order_id,
    currentOrderNumber: row.current_order_number ?? null,
    registeredByActorId: row.registered_by_actor_id,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Register one or more physical serialized units for a variant at a location.
 * Does not increase aggregate inventory quantity unless specified, to preserve
 * accounting correctness with existing receiving workflows.
 */
export async function registerInventoryUnits(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    locationId: string;
    quantity: number;
    sourceType?: UnitSourceType | undefined;
    sourceReceiptId?: string | null | undefined;
    sourceReceiptLineId?: string | null | undefined;
    sourceReturnReceiptId?: string | null | undefined;
    inventoryCondition?: InventoryCondition | undefined;
    initialCondition?: UnitCondition | undefined;
    initialStatus?: UnitStatus | undefined;
    packageReference?: string | null | undefined;
    storageNotes?: string | null | undefined;
    notes?: string | null | undefined;
  },
): Promise<readonly InventoryUnitView[]> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 500) {
    throw new UnitTraceabilityDomainError(
      'VALIDATION_FAILED',
      'Registration quantity must be an integer between 1 and 500.',
    );
  }

  return withUnitTransaction(db, async (trx) => {
    await requireActiveLocationCapability(
      trx,
      input.organizationId,
      input.locationId,
      'STOCK_HOLDING',
    );

    // Look up location info
    const locQuery = await sql<{ name: string; code: string }>`
      select name, code from warehouse.locations
      where id = ${input.locationId} and organization_id = ${input.organizationId}
    `.execute(trx);
    const locInfo = locQuery.rows[0];

    // Look up inventory item & variant
    const variantQuery = await sql<{
      inventory_item_id: string;
      variant_id: string;
      product_id: string;
      sku: string;
      product_title: string;
      tracking_mode: string;
    }>`
      select item.id as inventory_item_id, item.variant_id, variant.product_id,
        variant.sku, p.title as product_title, item.tracking_mode
      from catalog.product_variants variant
      join catalog.products p
        on p.id = variant.product_id and p.organization_id = variant.organization_id
      join inventory.inventory_items item
        on item.variant_id = variant.id and item.organization_id = variant.organization_id
      where variant.id = ${input.variantId} and variant.organization_id = ${input.organizationId}
    `.execute(trx);

    let variantInfo = variantQuery.rows[0];
    if (!variantInfo) {
      // Ensure inventory item exists for variant
      const ensureRes = await sql<{ id: string }>`
        insert into inventory.inventory_items (organization_id, variant_id, tracking_mode)
        values (${input.organizationId}, ${input.variantId}, 'SERIAL')
        on conflict (variant_id) do update set updated_at = now()
        returning id
      `.execute(trx);
      const itemId = ensureRes.rows[0]?.id;
      if (!itemId) {
        throw new UnitTraceabilityDomainError(
          'NOT_FOUND',
          'Catalog variant was not found in this organization.',
        );
      }
      const recheck = await sql<{
        inventory_item_id: string;
        variant_id: string;
        product_id: string;
        sku: string;
        product_title: string;
        tracking_mode: string;
      }>`
        select item.id as inventory_item_id, item.variant_id, variant.product_id,
          variant.sku, p.title as product_title, item.tracking_mode
        from catalog.product_variants variant
        join catalog.products p
          on p.id = variant.product_id and p.organization_id = variant.organization_id
        join inventory.inventory_items item
          on item.variant_id = variant.id and item.organization_id = variant.organization_id
        where variant.id = ${input.variantId} and variant.organization_id = ${input.organizationId}
      `.execute(trx);
      variantInfo = recheck.rows[0];
    }

    if (!variantInfo) {
      throw new UnitTraceabilityDomainError(
        'NOT_FOUND',
        'Variant or associated inventory item was not found.',
      );
    }

    const sourceType = input.sourceType ?? 'MANUAL_INTAKE';
    let inventoryCondition = input.inventoryCondition ?? 'INSPECTION';

    if (sourceType === 'INBOUND_RECEIPT') {
      if (!input.sourceReceiptId || !input.sourceReceiptLineId) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'Inbound unit registration requires both the receipt and receipt line.',
        );
      }
      const receiptLine = await sql<{
        condition_code: InventoryCondition;
        quantity: string;
        registered_quantity: string;
      }>`
        select line.condition_code, line.quantity::text,
          (select count(*)::text from inventory.inventory_units registered
            where registered.organization_id = line.organization_id
              and registered.source_receipt_line_id = line.id) as registered_quantity
        from receiving.inbound_receipt_lines line
        join receiving.inbound_receipts receipt
          on receipt.id = line.inbound_receipt_id
          and receipt.organization_id = line.organization_id
        where line.id = ${input.sourceReceiptLineId}
          and line.inbound_receipt_id = ${input.sourceReceiptId}
          and line.organization_id = ${input.organizationId}
          and line.variant_id = ${input.variantId}
          and receipt.receiving_location_id = ${input.locationId}
          and receipt.status = 'POSTED'
        for update of line
      `.execute(trx);
      const source = receiptLine.rows[0];
      if (!source) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'The posted inbound receipt line does not match this variant and location.',
        );
      }
      if (Number(source.registered_quantity) + input.quantity > Number(source.quantity)) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          'Unit registration would exceed the quantity on the inbound receipt line.',
        );
      }
      inventoryCondition = source.condition_code;
    } else if (sourceType === 'RETURN_RECEIPT') {
      if (!input.sourceReturnReceiptId) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'Returned unit registration requires a posted return receipt.',
        );
      }
      const returnSource = await sql<{ quantity: string; registered_quantity: string }>`
        select (
            select sum(source_line.quantity)::text
            from returns.return_receipt_lines source_line
            where source_line.organization_id = receipt.organization_id
              and source_line.return_receipt_id = receipt.id
              and source_line.inventory_item_id = ${variantInfo.inventory_item_id}
          ) as quantity,
          (select count(*)::text from inventory.inventory_units registered
            where registered.organization_id = receipt.organization_id
              and registered.source_return_receipt_id = receipt.id
              and registered.inventory_item_id = ${variantInfo.inventory_item_id}) as registered_quantity
        from returns.return_receipts receipt
        where receipt.id = ${input.sourceReturnReceiptId}
          and receipt.organization_id = ${input.organizationId}
          and receipt.receiving_location_id = ${input.locationId}
          and receipt.status = 'POSTED'
          and exists (
            select 1 from returns.return_receipt_lines line
            where line.organization_id = receipt.organization_id
              and line.return_receipt_id = receipt.id
              and line.inventory_item_id = ${variantInfo.inventory_item_id}
          )
        for update of receipt
      `.execute(trx);
      const source = returnSource.rows[0];
      if (!source) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'The posted return receipt does not match this variant and location.',
        );
      }
      if (Number(source.registered_quantity) + input.quantity > Number(source.quantity)) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          'Unit registration would exceed the received return quantity.',
        );
      }
      inventoryCondition = 'INSPECTION';
    } else {
      if (input.sourceReceiptId || input.sourceReceiptLineId || input.sourceReturnReceiptId) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'Receipt references are only valid for receipt-backed registration.',
        );
      }
      const capacity = await sql<{ quantity: string; registered_quantity: string }>`
        select condition.quantity::text,
          (select count(*)::text from inventory.inventory_units registered
            where registered.organization_id = condition.organization_id
              and registered.inventory_item_id = condition.inventory_item_id
              and registered.location_id = condition.location_id
              and registered.inventory_condition_code = condition.condition_code
              and registered.status not in ('IN_TRANSFER', 'DISPATCHED', 'WRITTEN_OFF')) as registered_quantity
        from inventory.inventory_level_conditions condition
        where condition.organization_id = ${input.organizationId}
          and condition.inventory_item_id = ${variantInfo.inventory_item_id}
          and condition.location_id = ${input.locationId}
          and condition.condition_code = ${inventoryCondition}
        for update of condition
      `.execute(trx);
      const availableCapacity = capacity.rows[0];
      if (
        !availableCapacity ||
        Number(availableCapacity.registered_quantity) + input.quantity > Number(availableCapacity.quantity)
      ) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          'Serialized units cannot exceed the authoritative ledger quantity for this condition and location.',
        );
      }
    }

    // Automatically set tracking_mode to SERIAL if not already
    if (variantInfo.tracking_mode !== 'SERIAL') {
      await sql`
        update inventory.inventory_items
        set tracking_mode = 'SERIAL', updated_at = now(), version = version + 1
        where id = ${variantInfo.inventory_item_id} and organization_id = ${input.organizationId}
      `.execute(trx);
    }

    const createdUnits: InventoryUnitView[] = [];
    const condition = input.initialCondition ?? 'GRADE_A';
    const status = input.initialStatus ?? (
      inventoryCondition === 'SELLABLE' ? 'AVAILABLE' : inventoryCondition === 'INSPECTION' ? 'AWAITING_QC' : 'ON_HOLD'
    );

    for (let i = 0; i < input.quantity; i++) {
      const unitCode = await nextUnitCode(trx, input.organizationId);
      const inserted = await sql<InventoryUnitRow>`
        insert into inventory.inventory_units (
          organization_id, unit_code, inventory_item_id, variant_id, location_id,
          inventory_condition_code, current_condition, status, source_type, source_receipt_id, source_receipt_line_id,
          source_return_receipt_id, package_reference, storage_notes, barcode_payload,
          registered_by_actor_id
        ) values (
          ${input.organizationId}, ${unitCode}, ${variantInfo.inventory_item_id},
          ${input.variantId}, ${input.locationId}, ${inventoryCondition}, ${condition}, ${status},
          ${sourceType}, ${input.sourceReceiptId ?? null},
          ${input.sourceReceiptLineId ?? null},
          ${input.sourceReturnReceiptId ?? null},
          ${input.packageReference?.trim() || null},
          ${input.storageNotes?.trim() || null},
          ${unitCode},
          ${input.actorId}
        )
        returning *
      `.execute(trx);

      const unitRow = inserted.rows[0]!;

      await appendUnitEventInTransaction(trx, {
        organizationId: input.organizationId,
        unitId: unitRow.id,
        eventType: 'REGISTERED',
        actorId: input.actorId,
        toStatus: status,
        toCondition: condition,
        toLocationId: input.locationId,
        referenceType: input.sourceReceiptId
          ? 'receiving.inbound_receipt'
          : input.sourceReturnReceiptId
            ? 'returns.return_receipt'
            : 'inventory.unit',
        referenceId: input.sourceReceiptId ?? input.sourceReturnReceiptId ?? unitRow.id,
        reason: input.notes ?? `Registered physical piece ${unitCode}`,
        metadata: {
          unitCode,
          sku: variantInfo.sku,
          sourceType,
          inventoryCondition,
          packageReference: input.packageReference ?? null,
        },
      });

      createdUnits.push(
        mapUnitRow({
          ...unitRow,
          sku: variantInfo.sku,
          product_id: variantInfo.product_id,
          product_title: variantInfo.product_title,
          location_name: locInfo?.name ?? '',
          location_code: locInfo?.code ?? '',
        }),
      );
    }

    return createdUnits;
  });
}

/**
 * Configure tracking mode for a product variant (STANDARD vs SERIAL).
 */
export async function setVariantTrackingMode(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    trackingMode: VariantTrackingMode;
  },
): Promise<{ variantId: string; trackingMode: VariantTrackingMode }> {
  return withUnitTransaction(db, async (trx) => {
    const item = await sql<{
      id: string;
      tracking_mode: string;
    }>`
      select item.id, item.tracking_mode
      from inventory.inventory_items item
      where item.variant_id = ${input.variantId} and item.organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    let itemId = item.rows[0]?.id;
    if (itemId && input.trackingMode === 'STANDARD') {
      const liveUnits = await sql<{ count: string }>`
        select count(*)::text as count
        from inventory.inventory_units
        where organization_id = ${input.organizationId}
          and inventory_item_id = ${itemId}
          and status not in ('DISPATCHED', 'WRITTEN_OFF')
      `.execute(trx);
      if (Number(liveUnits.rows[0]?.count ?? 0) > 0) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          'Serialized tracking cannot be disabled while live unit identities remain on hand.',
        );
      }
    }
    if (!itemId) {
      const inserted = await sql<{ id: string }>`
        insert into inventory.inventory_items (organization_id, variant_id, tracking_mode)
        values (${input.organizationId}, ${input.variantId}, ${input.trackingMode})
        on conflict (variant_id) do update set tracking_mode = ${input.trackingMode}, updated_at = now()
        returning id
      `.execute(trx);
      itemId = inserted.rows[0]?.id;
    } else {
      await sql`
        update inventory.inventory_items
        set tracking_mode = ${input.trackingMode}, updated_at = now(), version = version + 1
        where id = ${itemId} and organization_id = ${input.organizationId}
      `.execute(trx);
    }

    return { variantId: input.variantId, trackingMode: input.trackingMode };
  });
}

/**
 * Controlled stock conversion: converts existing quantity-tracked stock into
 * verified individual serialized units.
 */
export async function convertStockToSerialized(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    locationId: string;
    initialCondition?: UnitCondition;
    packageReference?: string;
    storageNotes?: string;
    notes?: string;
  },
): Promise<{
  variantId: string;
  locationId: string;
  unitsCreated: number;
  units: readonly InventoryUnitView[];
}> {
  return withUnitTransaction(db, async (trx) => {
    // Check if variant has existing inventory item
    const itemRes = await sql<{
      id: string;
      tracking_mode: string;
      sku: string;
    }>`
      select item.id, item.tracking_mode, variant.sku
      from inventory.inventory_items item
      join catalog.product_variants variant on variant.id = item.variant_id
      where item.variant_id = ${input.variantId} and item.organization_id = ${input.organizationId}
      for update of item
    `.execute(trx);

    const item = itemRes.rows[0];
    if (!item) {
      throw new UnitTraceabilityDomainError(
        'NOT_FOUND',
        'Inventory item was not found for this variant.',
      );
    }

    // Check for active reservations
    const reservations = await sql<{ count: string }>`
      select count(*)::text as count
      from inventory.inventory_reservations
      where organization_id = ${input.organizationId}
        and inventory_item_id = ${item.id}
        and location_id = ${input.locationId}
        and status in ('ACTIVE', 'PARTIALLY_CONSUMED')
    `.execute(trx);

    if (Number(reservations.rows[0]?.count ?? 0) > 0) {
      throw new UnitTraceabilityDomainError(
        'RESERVATION_CONFLICT',
        'Cannot convert variant to serialized tracking while active inventory reservations exist at this location.',
      );
    }

    // Adopt only the identity records that are still missing for each ledger bucket.
    // This makes conversion safely replayable and preserves exact condition truth.
    const conditions = await sql<{
      condition_code: InventoryCondition;
      quantity: string;
      registered_quantity: string;
    }>`
      select condition.condition_code, condition.quantity::text,
        (select count(*)::text from inventory.inventory_units unit
          where unit.organization_id = condition.organization_id
            and unit.inventory_item_id = condition.inventory_item_id
            and unit.location_id = condition.location_id
            and unit.inventory_condition_code = condition.condition_code
            and unit.status not in ('IN_TRANSFER', 'DISPATCHED', 'WRITTEN_OFF')) as registered_quantity
      from inventory.inventory_level_conditions condition
      where condition.organization_id = ${input.organizationId}
        and condition.inventory_item_id = ${item.id}
        and condition.location_id = ${input.locationId}
      order by condition.condition_code
      for update of condition
    `.execute(trx);

    for (const condition of conditions.rows) {
      if (!Number.isInteger(Number(condition.quantity))) {
        throw new UnitTraceabilityDomainError(
          'VALIDATION_FAILED',
          'Fractional inventory cannot be converted to individual serialized units.',
        );
      }
    }
    const missingByCondition = conditions.rows.map((condition) => ({
      condition: condition.condition_code,
      quantity: Number(condition.quantity) - Number(condition.registered_quantity),
    }));
    if (missingByCondition.some((entry) => entry.quantity < 0)) {
      throw new UnitTraceabilityDomainError(
        'CONFLICT',
        'Existing serialized identities exceed the authoritative ledger quantity.',
      );
    }
    const totalCount = missingByCondition.reduce((sum, entry) => sum + entry.quantity, 0);

    if (totalCount === 0) {
      // Just update tracking mode
      await sql`
        update inventory.inventory_items
        set tracking_mode = 'SERIAL', updated_at = now(), version = version + 1
        where id = ${item.id} and organization_id = ${input.organizationId}
      `.execute(trx);
      return { variantId: input.variantId, locationId: input.locationId, unitsCreated: 0, units: [] };
    }

    const units: InventoryUnitView[] = [];
    for (const entry of missingByCondition) {
      if (entry.quantity === 0) continue;
      const created = await registerInventoryUnits(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        variantId: input.variantId,
        locationId: input.locationId,
        quantity: entry.quantity,
        sourceType: 'STOCK_CONVERSION',
        inventoryCondition: entry.condition,
        initialCondition:
          entry.condition === 'SELLABLE'
            ? (input.initialCondition ?? 'GRADE_A')
            : entry.condition === 'DAMAGED'
              ? 'DAMAGED_UNSELLABLE'
              : 'REPAIR_REQUIRED',
        initialStatus:
          entry.condition === 'SELLABLE'
            ? 'AVAILABLE'
            : entry.condition === 'INSPECTION'
              ? 'AWAITING_QC'
              : 'ON_HOLD',
        packageReference: input.packageReference,
        storageNotes: input.storageNotes,
        notes: input.notes ?? `Adopted ${entry.quantity} ${entry.condition.toLowerCase()} units from aggregate stock`,
      });
      units.push(...created);
    }

    await sql`
      update inventory.inventory_items
      set tracking_mode = 'SERIAL', updated_at = now(), version = version + 1
      where id = ${item.id} and organization_id = ${input.organizationId}
    `.execute(trx);

    return {
      variantId: input.variantId,
      locationId: input.locationId,
      unitsCreated: units.length,
      units,
    };
  });
}

/**
 * Retrieve unit details including variant, product title, and location info.
 */
export async function getInventoryUnit(
  db: DatabaseExecutor,
  input: { organizationId: string; unitId: string },
): Promise<InventoryUnitView> {
  const result = await sql<InventoryUnitRow>`
    select unit.*, variant.sku, variant.product_id, product.title as product_title,
      location.name as location_name, location.code as location_code,
      receipt.receipt_number as source_receipt_number,
      fulfillment.fulfillment_number as current_fulfillment_number,
      orders.order_number as current_order_number,
      (
        select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
        from catalog.variant_option_values link
        join catalog.product_option_values value on value.id = link.option_value_id and value.organization_id = link.organization_id
        join catalog.product_option_axes axis on axis.id = link.option_axis_id and axis.organization_id = link.organization_id
        where link.organization_id = unit.organization_id and link.variant_id = unit.variant_id
      ) as option_summary
    from inventory.inventory_units unit
    join catalog.product_variants variant on variant.id = unit.variant_id and variant.organization_id = unit.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = unit.organization_id
    join warehouse.locations location on location.id = unit.location_id and location.organization_id = unit.organization_id
    left join receiving.inbound_receipts receipt on receipt.id = unit.source_receipt_id and receipt.organization_id = unit.organization_id
    left join fulfillment.fulfillments fulfillment on fulfillment.id = unit.current_fulfillment_id and fulfillment.organization_id = unit.organization_id
    left join orders.orders orders on orders.id = unit.current_order_id and orders.organization_id = unit.organization_id
    where unit.id = ${input.unitId} and unit.organization_id = ${input.organizationId}
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
  }

  return mapUnitRow(row);
}

/**
 * Fast lookup by scanned barcode or Unit Code (e.g. MVU-000101).
 */
export async function findInventoryUnitByCode(
  db: DatabaseExecutor,
  input: { organizationId: string; code: string },
): Promise<InventoryUnitView | null> {
  const normalized = input.code.trim().toUpperCase();
  if (!normalized) return null;

  const result = await sql<InventoryUnitRow>`
    select unit.*, variant.sku, variant.product_id, product.title as product_title,
      location.name as location_name, location.code as location_code,
      receipt.receipt_number as source_receipt_number,
      fulfillment.fulfillment_number as current_fulfillment_number,
      orders.order_number as current_order_number,
      (
        select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
        from catalog.variant_option_values link
        join catalog.product_option_values value on value.id = link.option_value_id and value.organization_id = link.organization_id
        join catalog.product_option_axes axis on axis.id = link.option_axis_id and axis.organization_id = link.organization_id
        where link.organization_id = unit.organization_id and link.variant_id = unit.variant_id
      ) as option_summary
    from inventory.inventory_units unit
    join catalog.product_variants variant on variant.id = unit.variant_id and variant.organization_id = unit.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = unit.organization_id
    join warehouse.locations location on location.id = unit.location_id and location.organization_id = unit.organization_id
    left join receiving.inbound_receipts receipt on receipt.id = unit.source_receipt_id and receipt.organization_id = unit.organization_id
    left join fulfillment.fulfillments fulfillment on fulfillment.id = unit.current_fulfillment_id and fulfillment.organization_id = unit.organization_id
    left join orders.orders orders on orders.id = unit.current_order_id and orders.organization_id = unit.organization_id
    where unit.organization_id = ${input.organizationId}
      and (upper(unit.unit_code) = ${normalized} or upper(unit.barcode_payload) = ${normalized})
    limit 1
  `.execute(db);

  const row = result.rows[0];
  return row ? mapUnitRow(row) : null;
}

/**
 * Server-paginated listing of inventory units with comprehensive filtering.
 */
export async function listInventoryUnits(
  db: DatabaseExecutor,
  organizationId: string,
  filters: {
    page?: number;
    pageSize?: number;
    search?: string;
    variantId?: string;
    sku?: string;
    locationId?: string;
    condition?: UnitCondition;
    status?: UnitStatus;
    sourceReceiptId?: string;
    packageReference?: string;
  } = {},
): Promise<{
  items: readonly InventoryUnitView[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() || null;
  const variantId = filters.variantId ?? null;
  const sku = filters.sku?.trim() || null;
  const locationId = filters.locationId ?? null;
  const condition = filters.condition ?? null;
  const status = filters.status ?? null;
  const sourceReceiptId = filters.sourceReceiptId ?? null;
  const packageRef = filters.packageReference?.trim() || null;

  const [itemsResult, countResult] = await Promise.all([
    sql<InventoryUnitRow>`
      select unit.*, variant.sku, variant.product_id, product.title as product_title,
        location.name as location_name, location.code as location_code,
        receipt.receipt_number as source_receipt_number,
        fulfillment.fulfillment_number as current_fulfillment_number,
        orders.order_number as current_order_number,
        (
          select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
          from catalog.variant_option_values link
          join catalog.product_option_values value on value.id = link.option_value_id and value.organization_id = link.organization_id
          join catalog.product_option_axes axis on axis.id = link.option_axis_id and axis.organization_id = link.organization_id
          where link.organization_id = unit.organization_id and link.variant_id = unit.variant_id
        ) as option_summary
      from inventory.inventory_units unit
      join catalog.product_variants variant on variant.id = unit.variant_id and variant.organization_id = unit.organization_id
      join catalog.products product on product.id = variant.product_id and product.organization_id = unit.organization_id
      join warehouse.locations location on location.id = unit.location_id and location.organization_id = unit.organization_id
      left join receiving.inbound_receipts receipt on receipt.id = unit.source_receipt_id and receipt.organization_id = unit.organization_id
      left join fulfillment.fulfillments fulfillment on fulfillment.id = unit.current_fulfillment_id and fulfillment.organization_id = unit.organization_id
      left join orders.orders orders on orders.id = unit.current_order_id and orders.organization_id = unit.organization_id
      where unit.organization_id = ${organizationId}
        and (${variantId}::uuid is null or unit.variant_id = ${variantId})
        and (${locationId}::uuid is null or unit.location_id = ${locationId})
        and (${condition}::text is null or unit.current_condition = ${condition})
        and (${status}::text is null or unit.status = ${status})
        and (${sourceReceiptId}::uuid is null or unit.source_receipt_id = ${sourceReceiptId})
        and (${sku}::text is null or variant.sku ilike '%' || ${sku} || '%')
        and (${packageRef}::text is null or unit.package_reference ilike '%' || ${packageRef} || '%')
        and (
          ${search}::text is null or
          unit.unit_code ilike '%' || ${search} || '%' or
          unit.barcode_payload ilike '%' || ${search} || '%' or
          variant.sku ilike '%' || ${search} || '%' or
          product.title ilike '%' || ${search} || '%' or
          coalesce(unit.package_reference, '') ilike '%' || ${search} || '%' or
          coalesce(unit.storage_notes, '') ilike '%' || ${search} || '%'
        )
      order by unit.created_at desc, unit.id desc
      limit ${pageSize} offset ${offset}
    `.execute(db),
    sql<{ total: string }>`
      select count(*)::text as total
      from inventory.inventory_units unit
      join catalog.product_variants variant on variant.id = unit.variant_id and variant.organization_id = unit.organization_id
      join catalog.products product on product.id = variant.product_id and product.organization_id = unit.organization_id
      where unit.organization_id = ${organizationId}
        and (${variantId}::uuid is null or unit.variant_id = ${variantId})
        and (${locationId}::uuid is null or unit.location_id = ${locationId})
        and (${condition}::text is null or unit.current_condition = ${condition})
        and (${status}::text is null or unit.status = ${status})
        and (${sourceReceiptId}::uuid is null or unit.source_receipt_id = ${sourceReceiptId})
        and (${sku}::text is null or variant.sku ilike '%' || ${sku} || '%')
        and (${packageRef}::text is null or unit.package_reference ilike '%' || ${packageRef} || '%')
        and (
          ${search}::text is null or
          unit.unit_code ilike '%' || ${search} || '%' or
          unit.barcode_payload ilike '%' || ${search} || '%' or
          variant.sku ilike '%' || ${search} || '%' or
          product.title ilike '%' || ${search} || '%' or
          coalesce(unit.package_reference, '') ilike '%' || ${search} || '%' or
          coalesce(unit.storage_notes, '') ilike '%' || ${search} || '%'
        )
    `.execute(db),
  ]);

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  return {
    items: itemsResult.rows.map(mapUnitRow),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

/**
 * Record a Quality Control inspection for a unit.
 * Updates unit condition and operational status, and moves inventory condition
 * if the unit was in inspection hold.
 */
export async function performUnitInspection(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    inspectionStage: InspectionStage;
    conditionResult: UnitCondition;
    defectDescription?: string | null | undefined;
    notes?: string | null | undefined;
    mediaAssetIds?: readonly string[] | null | undefined;
    outcome: InspectionOutcome;
    disposition?: InspectionDisposition | null | undefined;
  },
): Promise<{ inspection: UnitInspectionView; unit: InventoryUnitView }> {
  return withUnitTransaction(db, async (trx) => {
    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }

    if (unit.status === 'DISPATCHED' && input.inspectionStage !== 'RETURN_INSPECTION') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cannot inspect a unit that has already been dispatched without a return workflow.',
      );
    }
    if (unit.status === 'WRITTEN_OFF') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cannot inspect a written-off unit.',
      );
    }

    const inspectionNumber = await nextInspectionNumber(trx, input.organizationId);

    // Insert inspection
    const insRes = await sql<{
      id: string;
      unit_id: string;
      inspection_number: string;
      inspector_actor_id: string | null;
      inspection_stage: InspectionStage;
      condition_result: UnitCondition;
      defect_description: string | null;
      notes: string | null;
      media_asset_ids: string[];
      inspection_outcome: InspectionOutcome;
      disposition: InspectionDisposition | null;
      created_at: Date;
    }>`
      insert into inventory.unit_inspections (
        organization_id, unit_id, inspection_number, inspector_actor_id,
        inspection_stage, condition_result, defect_description, notes,
        media_asset_ids, inspection_outcome, disposition
      ) values (
        ${input.organizationId}, ${input.unitId}, ${inspectionNumber},
        ${input.actorId}, ${input.inspectionStage}, ${input.conditionResult},
        ${input.defectDescription?.trim() || null}, ${input.notes?.trim() || null},
        ${input.mediaAssetIds ?? []}::uuid[], ${input.outcome}, ${input.disposition ?? null}
      )
      returning *
    `.execute(trx);

    const insRow = insRes.rows[0]!;

    // Calculate new status
    let nextStatus: UnitStatus = unit.status;
    let targetInventoryCondition: InventoryCondition | null = null;

    if (input.outcome === 'PASSED' || input.disposition === 'RELEASE_SELLABLE') {
      nextStatus = 'AVAILABLE';
      targetInventoryCondition = 'SELLABLE';
    } else if (input.outcome === 'HOLD_FOR_REPAIR' || input.disposition === 'MOVE_TO_REPAIR') {
      nextStatus = 'ON_HOLD';
      targetInventoryCondition = 'QUARANTINE';
    } else if (input.outcome === 'QUARANTINE_DAMAGED') {
      nextStatus = 'ON_HOLD';
      targetInventoryCondition = 'DAMAGED';
    } else if (input.outcome === 'PASSED_WITH_DEFECT') {
      if (input.disposition === 'RESTRICTED_SALE') {
        nextStatus = 'AVAILABLE';
        targetInventoryCondition = 'SELLABLE';
      } else {
        nextStatus = 'ON_HOLD';
      }
    }

    if (input.disposition === 'WRITE_OFF') {
      nextStatus = 'WRITTEN_OFF';
      targetInventoryCondition = null;
    }

    if (nextStatus === 'WRITTEN_OFF') {
      await writeOffInventoryInTransaction(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        inventoryItemId: unit.inventory_item_id,
        locationId: unit.location_id,
        condition: unit.inventory_condition_code,
        quantity: '1',
        reason: `QC Inspection ${inspectionNumber}: ${input.outcome}`,
        referenceType: 'inventory.unit_inspection',
        referenceId: insRow.id,
      });
    } else if (
      targetInventoryCondition !== null &&
      targetInventoryCondition !== unit.inventory_condition_code
    ) {
      await moveInventoryConditionInTransaction(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        inventoryItemId: unit.inventory_item_id,
        locationId: unit.location_id,
        fromCondition: unit.inventory_condition_code,
        toCondition: targetInventoryCondition,
        quantity: '1',
        reason: `QC Inspection ${inspectionNumber}: ${input.outcome}`,
        referenceType: 'inventory.unit_inspection',
        referenceId: insRow.id,
      });
    }

    // Update unit
    await sql`
      update inventory.inventory_units
      set current_condition = ${input.conditionResult},
        status = ${nextStatus},
        inventory_condition_code = coalesce(${targetInventoryCondition}, inventory_condition_code),
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'INSPECTED',
      actorId: input.actorId,
      fromStatus: unit.status,
      toStatus: nextStatus,
      fromCondition: unit.current_condition,
      toCondition: input.conditionResult,
      referenceType: 'inventory.unit_inspection',
      referenceId: insRow.id,
      reason: input.notes ?? `QC ${input.inspectionStage}: ${input.outcome}`,
      metadata: {
        inspectionNumber,
        outcome: input.outcome,
        disposition: input.disposition ?? null,
      },
    });

    const updatedUnit = await getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });

    const inspectionView: UnitInspectionView = {
      id: insRow.id,
      unitId: insRow.unit_id,
      unitCode: unit.unit_code,
      inspectionNumber: insRow.inspection_number,
      inspectorActorId: insRow.inspector_actor_id,
      inspectorName: null,
      inspectionStage: insRow.inspection_stage,
      conditionResult: insRow.condition_result,
      defectDescription: insRow.defect_description,
      notes: insRow.notes,
      mediaAssetIds: insRow.media_asset_ids,
      inspectionOutcome: insRow.inspection_outcome,
      disposition: insRow.disposition,
      createdAt: insRow.created_at.toISOString(),
    };

    return { inspection: inspectionView, unit: updatedUnit };
  });
}

/**
 * Bulk initial inspection or batch QC for multiple units.
 */
export async function bulkInspectUnits(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    unitIds: readonly string[];
    inspectionStage: InspectionStage;
    conditionResult: UnitCondition;
    defectDescription?: string;
    notes?: string;
    outcome: InspectionOutcome;
    disposition?: InspectionDisposition;
  },
): Promise<{ count: number; units: readonly InventoryUnitView[] }> {
  if (!input.unitIds.length) {
    throw new UnitTraceabilityDomainError('VALIDATION_FAILED', 'At least one unit must be specified.');
  }

  const results: InventoryUnitView[] = [];
  for (const unitId of input.unitIds) {
    const res = await performUnitInspection(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      unitId,
      inspectionStage: input.inspectionStage,
      conditionResult: input.conditionResult,
      defectDescription: input.defectDescription,
      notes: input.notes,
      outcome: input.outcome,
      disposition: input.disposition,
    });
    results.push(res.unit);
  }
  return { count: results.length, units: results };
}

/**
 * Request cleaning or repair for a unit.
 */
export async function requestUnitRepair(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    defectDescription: string;
    actionRequired?: string;
    technicianName?: string;
    notes?: string;
  },
): Promise<UnitRepairView> {
  return withUnitTransaction(db, async (trx) => {
    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }
    if (unit.status === 'DISPATCHED' || unit.status === 'WRITTEN_OFF') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cannot request repair on a dispatched or written-off unit.',
      );
    }

    const repairNumber = await nextRepairNumber(trx, input.organizationId);

    const inserted = await sql<{
      id: string;
      unit_id: string;
      repair_number: string;
      repair_status: RepairStatus;
      defect_description: string;
      action_required: string | null;
      action_performed: string | null;
      technician_name: string | null;
      cost_amount: string | null;
      cost_currency: string;
      media_asset_ids: string[];
      notes: string | null;
      started_at: Date | null;
      completed_at: Date | null;
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`
      insert into inventory.unit_repairs (
        organization_id, unit_id, repair_number, repair_status,
        defect_description, action_required, technician_name, notes,
        created_by_actor_id
      ) values (
        ${input.organizationId}, ${input.unitId}, ${repairNumber}, 'REQUESTED',
        ${input.defectDescription.trim()}, ${input.actionRequired?.trim() || null},
        ${input.technicianName?.trim() || null}, ${input.notes?.trim() || null},
        ${input.actorId}
      )
      returning *
    `.execute(trx);

    const repairRow = inserted.rows[0]!;

    if (unit.inventory_condition_code !== 'QUARANTINE') {
      await moveInventoryConditionInTransaction(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        inventoryItemId: unit.inventory_item_id,
        locationId: unit.location_id,
        fromCondition: unit.inventory_condition_code,
        toCondition: 'QUARANTINE',
        quantity: '1',
        reason: `Repair requested: ${input.defectDescription.trim()}`,
        referenceType: 'inventory.unit_repair',
        referenceId: repairRow.id,
      });
    }

    // Repair custody is always represented by the aggregate QUARANTINE bucket.
    await sql`
      update inventory.inventory_units
      set current_condition = 'REPAIR_REQUIRED',
        inventory_condition_code = 'QUARANTINE',
        status = 'ON_HOLD',
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'REPAIR_REQUESTED',
      actorId: input.actorId,
      fromStatus: unit.status,
      toStatus: 'ON_HOLD',
      fromCondition: unit.current_condition,
      toCondition: 'REPAIR_REQUIRED',
      referenceType: 'inventory.unit_repair',
      referenceId: repairRow.id,
      reason: input.defectDescription,
      metadata: { repairNumber, actionRequired: input.actionRequired ?? null },
    });

    return {
      id: repairRow.id,
      unitId: repairRow.unit_id,
      unitCode: unit.unit_code,
      repairNumber: repairRow.repair_number,
      repairStatus: repairRow.repair_status,
      defectDescription: repairRow.defect_description,
      actionRequired: repairRow.action_required,
      actionPerformed: repairRow.action_performed,
      technicianName: repairRow.technician_name,
      costAmount: repairRow.cost_amount,
      costCurrency: repairRow.cost_currency,
      mediaAssetIds: repairRow.media_asset_ids,
      notes: repairRow.notes,
      startedAt: repairRow.started_at?.toISOString() ?? null,
      completedAt: repairRow.completed_at?.toISOString() ?? null,
      version: Number(repairRow.version),
      createdAt: repairRow.created_at.toISOString(),
      updatedAt: repairRow.updated_at.toISOString(),
    };
  });
}

/**
 * Complete repair work. Unit remains on hold awaiting reinspection before release.
 */
export async function completeUnitRepair(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    repairId: string;
    actionPerformed: string;
    technicianName?: string;
    costAmount?: string;
    costCurrency?: string;
    mediaAssetIds?: readonly string[];
    notes?: string;
  },
): Promise<UnitRepairView> {
  return withUnitTransaction(db, async (trx) => {
    const current = await sql<{
      id: string;
      unit_id: string;
      repair_number: string;
      repair_status: RepairStatus;
    }>`
      select id, unit_id, repair_number, repair_status
      from inventory.unit_repairs
      where id = ${input.repairId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const repair = current.rows[0];
    if (!repair) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Unit repair record was not found.');
    }
    if (repair.repair_status === 'COMPLETED') {
      throw new UnitTraceabilityDomainError(
        'CONFLICT',
        'Repair work is already recorded as completed.',
      );
    }

    const updated = await sql<{
      id: string;
      unit_id: string;
      repair_number: string;
      repair_status: RepairStatus;
      defect_description: string;
      action_required: string | null;
      action_performed: string | null;
      technician_name: string | null;
      cost_amount: string | null;
      cost_currency: string;
      media_asset_ids: string[];
      notes: string | null;
      started_at: Date | null;
      completed_at: Date | null;
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`
      update inventory.unit_repairs
      set repair_status = 'COMPLETED',
        action_performed = ${input.actionPerformed.trim()},
        technician_name = coalesce(${input.technicianName?.trim() || null}, technician_name),
        cost_amount = coalesce(${input.costAmount ?? null}::numeric, cost_amount),
        cost_currency = coalesce(${input.costCurrency ?? 'BDT'}, cost_currency),
        media_asset_ids = coalesce(${input.mediaAssetIds ?? null}::uuid[], media_asset_ids),
        notes = coalesce(${input.notes?.trim() || null}, notes),
        completed_at = now(),
        started_at = coalesce(started_at, now()),
        updated_at = now(),
        version = version + 1
      where id = ${input.repairId} and organization_id = ${input.organizationId}
      returning *
    `.execute(trx);

    const row = updated.rows[0]!;

    // Set unit to AWAITING_QC for mandatory reinspection before becoming sellable
    await sql`
      update inventory.inventory_units
      set status = 'AWAITING_QC',
        updated_at = now(),
        version = version + 1
      where id = ${row.unit_id} and organization_id = ${input.organizationId}
    `.execute(trx);

    const unitRow = await sql<{ unit_code: string }>`
      select unit_code from inventory.inventory_units where id = ${row.unit_id}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: row.unit_id,
      eventType: 'REPAIR_COMPLETED',
      actorId: input.actorId,
      fromStatus: 'ON_HOLD',
      toStatus: 'AWAITING_QC',
      referenceType: 'inventory.unit_repair',
      referenceId: row.id,
      reason: input.actionPerformed,
      metadata: {
        repairNumber: row.repair_number,
        costAmount: row.cost_amount,
        costCurrency: row.cost_currency,
      },
    });

    return {
      id: row.id,
      unitId: row.unit_id,
      unitCode: unitRow.rows[0]?.unit_code ?? '',
      repairNumber: row.repair_number,
      repairStatus: row.repair_status,
      defectDescription: row.defect_description,
      actionRequired: row.action_required,
      actionPerformed: row.action_performed,
      technicianName: row.technician_name,
      costAmount: row.cost_amount,
      costCurrency: row.cost_currency,
      mediaAssetIds: row.media_asset_ids,
      notes: row.notes,
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}

/**
 * Move unit storage location or bin.
 */
export async function moveUnitLocation(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    newLocationId: string;
    newStorageNotes?: string | null | undefined;
    newPackageReference?: string | null | undefined;
    reason?: string | null | undefined;
  },
): Promise<InventoryUnitView> {
  return withUnitTransaction(db, async (trx) => {
    await requireActiveLocationCapability(
      trx,
      input.organizationId,
      input.newLocationId,
      'STOCK_HOLDING',
    );

    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }
    if (unit.status === 'DISPATCHED' || unit.status === 'WRITTEN_OFF') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cannot move storage location of a dispatched or written-off unit.',
      );
    }

    const fromLoc = unit.location_id;
    if (fromLoc !== input.newLocationId) {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cross-location movement must use a warehouse transfer so unit identity, quantity, and cost move together.',
      );
    }

    await sql`
      update inventory.inventory_units
      set storage_notes = coalesce(${input.newStorageNotes?.trim() || null}, storage_notes),
        package_reference = coalesce(${input.newPackageReference?.trim() || null}, package_reference),
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'REPACKAGED',
      actorId: input.actorId,
      fromLocationId: fromLoc,
      toLocationId: input.newLocationId,
      reason: input.reason ?? 'Updated storage placement within the current location',
      metadata: {
        storageNotes: input.newStorageNotes ?? unit.storage_notes,
        packageReference: input.newPackageReference ?? unit.package_reference,
      },
    });

    return getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });
  });
}

/**
 * Bulk move locations for multiple units.
 */
export async function bulkMoveUnitsLocation(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitIds: readonly string[];
    newLocationId: string;
    newStorageNotes?: string;
    newPackageReference?: string;
    reason?: string;
  },
): Promise<{ count: number; units: readonly InventoryUnitView[] }> {
  if (!input.unitIds.length) {
    throw new UnitTraceabilityDomainError('VALIDATION_FAILED', 'At least one unit must be specified.');
  }

  return withUnitTransaction(db, async (trx) => {
    const results: InventoryUnitView[] = [];
    for (const unitId of input.unitIds) {
      const updated = await moveUnitLocation(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        unitId,
        newLocationId: input.newLocationId,
        newStorageNotes: input.newStorageNotes,
        newPackageReference: input.newPackageReference,
        reason: input.reason,
      });
      results.push(updated);
    }
    return { count: results.length, units: results };
  });
}

/**
 * Update packaging identity (box reference) without altering unit identity.
 */
export async function updateUnitPackaging(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    packageReference: string;
    storageNotes?: string;
  },
): Promise<InventoryUnitView> {
  return withUnitTransaction(db, async (trx) => {
    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }

    await sql`
      update inventory.inventory_units
      set package_reference = ${input.packageReference.trim()},
        storage_notes = coalesce(${input.storageNotes?.trim() || null}, storage_notes),
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'REPACKAGED',
      actorId: input.actorId,
      reason: `Repackaged into ${input.packageReference}`,
      metadata: {
        previousPackageReference: unit.package_reference,
        newPackageReference: input.packageReference.trim(),
      },
    });

    return getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });
  });
}

/**
 * Release an on-hold / restricted Grade B unit for sale.
 */
export async function releaseUnitForSale(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    reason: string;
  },
): Promise<InventoryUnitView> {
  if (!input.reason.trim()) {
    throw new UnitTraceabilityDomainError(
      'VALIDATION_FAILED',
      'A release reason/disclosure documentation is required.',
    );
  }

  return withUnitTransaction(db, async (trx) => {
    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }
    if (unit.status !== 'ON_HOLD' && unit.status !== 'AWAITING_QC') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        `Unit status ${unit.status} cannot be released for sale.`,
      );
    }
    if (unit.current_condition === 'DAMAGED_UNSELLABLE') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Severely damaged unsellable items cannot be directly released for sale.',
      );
    }

    if (unit.inventory_condition_code !== 'SELLABLE') {
      await moveInventoryConditionInTransaction(trx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        inventoryItemId: unit.inventory_item_id,
        locationId: unit.location_id,
        fromCondition: unit.inventory_condition_code,
        toCondition: 'SELLABLE',
        quantity: '1',
        reason: input.reason.trim(),
        referenceType: 'inventory.unit',
        referenceId: unit.id,
      });
    }

    await sql`
      update inventory.inventory_units
      set status = 'AVAILABLE',
        inventory_condition_code = 'SELLABLE',
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'RELEASED_FOR_SALE',
      actorId: input.actorId,
      fromStatus: unit.status,
      toStatus: 'AVAILABLE',
      reason: input.reason.trim(),
      metadata: { condition: unit.current_condition },
    });

    return getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });
  });
}

/**
 * Write off a damaged or lost unit permanently.
 */
export async function writeOffUnit(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    reason: string;
  },
): Promise<InventoryUnitView> {
  if (!input.reason.trim()) {
    throw new UnitTraceabilityDomainError(
      'VALIDATION_FAILED',
      'A write-off reason is required.',
    );
  }

  return withUnitTransaction(db, async (trx) => {
    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }
    if (unit.status === 'WRITTEN_OFF') {
      throw new UnitTraceabilityDomainError('CONFLICT', 'Unit is already written off.');
    }
    if (unit.status === 'DISPATCHED') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Cannot write off a dispatched unit without a return/loss case.',
      );
    }

    await writeOffInventoryInTransaction(trx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      inventoryItemId: unit.inventory_item_id,
      locationId: unit.location_id,
      condition: unit.inventory_condition_code,
      quantity: '1',
      reason: input.reason.trim(),
      referenceType: 'inventory.unit',
      referenceId: unit.id,
    });

    await sql`
      update inventory.inventory_units
      set status = 'WRITTEN_OFF',
        current_condition = 'DAMAGED_UNSELLABLE',
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'WRITTEN_OFF',
      actorId: input.actorId,
      fromStatus: unit.status,
      toStatus: 'WRITTEN_OFF',
      fromCondition: unit.current_condition,
      toCondition: 'DAMAGED_UNSELLABLE',
      reason: input.reason.trim(),
    });

    return getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });
  });
}

/**
 * Allocate specific physical serialized units to an active fulfillment.
 * Validates condition, availability, and location.
 */
export async function allocateUnitsToFulfillment(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
    allocations: readonly { fulfillmentLineId: string; unitId: string }[];
  },
): Promise<{ count: number; allocatedUnitIds: readonly string[] }> {
  if (!input.allocations.length) {
    throw new UnitTraceabilityDomainError(
      'VALIDATION_FAILED',
      'At least one unit allocation is required.',
    );
  }

  return withUnitTransaction(db, async (trx) => {
    // Check fulfillment
    const fulfillmentQuery = await sql<{
      id: string;
      status: string;
      location_id: string;
      order_id: string;
    }>`
      select id, status, location_id, order_id
      from fulfillment.fulfillments
      where id = ${input.fulfillmentId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const fulfillment = fulfillmentQuery.rows[0];
    if (!fulfillment) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Fulfillment was not found.');
    }
    if (!['DRAFT', 'READY', 'PICKING'].includes(fulfillment.status)) {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        `Cannot allocate units to a fulfillment with status ${fulfillment.status}.`,
      );
    }

    const allocatedIds: string[] = [];

    for (const alloc of input.allocations) {
      // Check fulfillment line
      const lineQuery = await sql<{
        id: string;
        order_line_id: string;
        variant_id: string;
      }>`
        select fline.id, fline.order_line_id, oline.variant_id
        from fulfillment.fulfillment_lines fline
        join orders.order_lines oline on oline.id = fline.order_line_id
        where fline.id = ${alloc.fulfillmentLineId}
          and fline.fulfillment_id = ${input.fulfillmentId}
          and fline.organization_id = ${input.organizationId}
      `.execute(trx);

      const fline = lineQuery.rows[0];
      if (!fline) {
        throw new UnitTraceabilityDomainError('NOT_FOUND', 'Fulfillment line was not found.');
      }

      // Check unit
      const unitQuery = await sql<InventoryUnitRow>`
        select * from inventory.inventory_units
        where id = ${alloc.unitId} and organization_id = ${input.organizationId}
        for update
      `.execute(trx);

      const unit = unitQuery.rows[0];
      if (!unit) {
        throw new UnitTraceabilityDomainError('NOT_FOUND', `Unit ${alloc.unitId} was not found.`);
      }

      if (unit.variant_id !== fline.variant_id) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          `Unit ${unit.unit_code} does not match the product variant of this fulfillment line.`,
        );
      }
      if (unit.location_id !== fulfillment.location_id) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          `Unit ${unit.unit_code} is stored at a different warehouse location.`,
        );
      }
      if (unit.status !== 'AVAILABLE') {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          `Unit ${unit.unit_code} is not in AVAILABLE status (currently ${unit.status}).`,
        );
      }
      if (unit.current_condition !== 'GRADE_A' && unit.current_condition !== 'GRADE_B') {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          `Unit ${unit.unit_code} condition is ${unit.current_condition} and cannot be fulfilled.`,
        );
      }
      if (unit.current_fulfillment_id && unit.current_fulfillment_id !== input.fulfillmentId) {
        throw new UnitTraceabilityDomainError(
          'CONFLICT',
          `Unit ${unit.unit_code} is already allocated to another fulfillment.`,
        );
      }

      // Record allocation bridge
      await sql`
        insert into fulfillment.fulfillment_unit_allocations (
          organization_id, fulfillment_id, fulfillment_line_id, unit_id, created_by_actor_id
        ) values (
          ${input.organizationId}, ${input.fulfillmentId}, ${alloc.fulfillmentLineId},
          ${unit.id}, ${input.actorId}
        )
        on conflict (fulfillment_line_id, unit_id) do nothing
      `.execute(trx);

      // Update unit
      await sql`
        update inventory.inventory_units
        set current_fulfillment_id = ${input.fulfillmentId},
          current_fulfillment_line_id = ${alloc.fulfillmentLineId},
          current_order_id = ${fulfillment.order_id},
          current_order_line_id = ${fline.order_line_id},
          status = 'IN_FULFILLMENT',
          updated_at = now(),
          version = version + 1
        where id = ${unit.id} and organization_id = ${input.organizationId}
      `.execute(trx);

      await appendUnitEventInTransaction(trx, {
        organizationId: input.organizationId,
        unitId: unit.id,
        eventType: 'ALLOCATED_TO_FULFILLMENT',
        actorId: input.actorId,
        fromStatus: unit.status,
        toStatus: 'IN_FULFILLMENT',
        referenceType: 'fulfillment.fulfillment',
        referenceId: input.fulfillmentId,
        reason: `Allocated to fulfillment for order picking`,
        metadata: {
          fulfillmentId: input.fulfillmentId,
          fulfillmentLineId: alloc.fulfillmentLineId,
          unitCode: unit.unit_code,
        },
      });

      allocatedIds.push(unit.id);
    }

    return { count: allocatedIds.length, allocatedUnitIds: allocatedIds };
  });
}

/**
 * Release unit allocations for a cancelled or reset fulfillment.
 */
export async function releaseFulfillmentUnitAllocations(
  trx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
  },
): Promise<number> {
  const allocatedUnits = await sql<{ unit_id: string; unit_code: string }>`
    select unit.id as unit_id, unit.unit_code
    from fulfillment.fulfillment_unit_allocations alloc
    join inventory.inventory_units unit on unit.id = alloc.unit_id
    where alloc.fulfillment_id = ${input.fulfillmentId} and alloc.organization_id = ${input.organizationId}
    for update of unit
  `.execute(trx);

  for (const alloc of allocatedUnits.rows) {
    await sql`
      update inventory.inventory_units
      set current_fulfillment_id = null,
        current_fulfillment_line_id = null,
        current_order_id = null,
        current_order_line_id = null,
        status = 'AVAILABLE',
        updated_at = now(),
        version = version + 1
      where id = ${alloc.unit_id} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: alloc.unit_id,
      eventType: 'RELEASED_FROM_FULFILLMENT',
      actorId: input.actorId,
      fromStatus: 'IN_FULFILLMENT',
      toStatus: 'AVAILABLE',
      referenceType: 'fulfillment.fulfillment',
      referenceId: input.fulfillmentId,
      reason: 'Fulfillment was cancelled or reset',
    });
  }

  await sql`
    delete from fulfillment.fulfillment_unit_allocations
    where fulfillment_id = ${input.fulfillmentId} and organization_id = ${input.organizationId}
  `.execute(trx);

  return allocatedUnits.rows.length;
}

/**
 * Dispatch allocated units when a fulfillment is dispatched.
 */
export async function dispatchFulfillmentUnitsInTransaction(
  trx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
  },
): Promise<number> {
  const units = await sql<{
    unit_id: string;
    unit_code: string;
    order_id: string;
    order_line_id: string;
  }>`
    select unit.id as unit_id, unit.unit_code,
      f.order_id, fline.order_line_id
    from fulfillment.fulfillment_unit_allocations alloc
    join fulfillment.fulfillments f on f.id = alloc.fulfillment_id
    join fulfillment.fulfillment_lines fline on fline.id = alloc.fulfillment_line_id
    join inventory.inventory_units unit on unit.id = alloc.unit_id
    where alloc.fulfillment_id = ${input.fulfillmentId} and alloc.organization_id = ${input.organizationId}
    for update of unit
  `.execute(trx);

  for (const row of units.rows) {
    await sql`
      update inventory.inventory_units
      set status = 'DISPATCHED',
        updated_at = now(),
        version = version + 1
      where id = ${row.unit_id} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: row.unit_id,
      eventType: 'DISPATCHED',
      actorId: input.actorId,
      fromStatus: 'IN_FULFILLMENT',
      toStatus: 'DISPATCHED',
      referenceType: 'fulfillment.fulfillment',
      referenceId: input.fulfillmentId,
      reason: 'Physical unit dispatched to customer',
      metadata: { orderId: row.order_id, orderLineId: row.order_line_id },
    });
  }

  return units.rows.length;
}

/**
 * Receive a returned physical piece, connecting it back to its identity.
 * Puts it on inspection hold (status: RETURNED).
 */
export async function receiveReturnedUnit(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    actorId: string;
    unitId: string;
    receivingLocationId: string;
    sourceReturnReceiptId?: string;
    conditionResult?: UnitCondition;
    notes?: string;
  },
): Promise<InventoryUnitView> {
  return withUnitTransaction(db, async (trx) => {
    await requireActiveLocationCapability(
      trx,
      input.organizationId,
      input.receivingLocationId,
      'STOCK_HOLDING',
    );

    const current = await sql<InventoryUnitRow>`
      select * from inventory.inventory_units
      where id = ${input.unitId} and organization_id = ${input.organizationId}
      for update
    `.execute(trx);

    const unit = current.rows[0];
    if (!unit) {
      throw new UnitTraceabilityDomainError('NOT_FOUND', 'Inventory unit was not found.');
    }
    if (unit.status !== 'DISPATCHED') {
      throw new UnitTraceabilityDomainError(
        'INVALID_TRANSITION',
        'Only a dispatched unit can be received through the return workflow.',
      );
    }
    if (!input.sourceReturnReceiptId) {
      throw new UnitTraceabilityDomainError(
        'VALIDATION_FAILED',
        'A posted return receipt is required before reconnecting a returned unit.',
      );
    }
    const receipt = await sql<{ id: string }>`
      select receipt.id
      from returns.return_receipts receipt
      join returns.return_receipt_lines line
        on line.return_receipt_id = receipt.id
        and line.organization_id = receipt.organization_id
      where receipt.id = ${input.sourceReturnReceiptId}
        and receipt.organization_id = ${input.organizationId}
        and receipt.receiving_location_id = ${input.receivingLocationId}
        and receipt.status = 'POSTED'
        and line.inventory_item_id = ${unit.inventory_item_id}
      for update of receipt
    `.execute(trx);
    if (!receipt.rows[0]) {
      throw new UnitTraceabilityDomainError(
        'VALIDATION_FAILED',
        'The posted return receipt does not match this unit and receiving location.',
      );
    }

    const previousStatus = unit.status;

    await sql`
      update inventory.inventory_units
      set location_id = ${input.receivingLocationId},
        source_return_receipt_id = coalesce(${input.sourceReturnReceiptId ?? null}, source_return_receipt_id),
        status = 'RETURNED',
        inventory_condition_code = 'INSPECTION',
        current_condition = coalesce(${input.conditionResult ?? null}, current_condition),
        updated_at = now(),
        version = version + 1
      where id = ${input.unitId} and organization_id = ${input.organizationId}
    `.execute(trx);

    await appendUnitEventInTransaction(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
      eventType: 'RETURNED',
      actorId: input.actorId,
      fromStatus: previousStatus,
      toStatus: 'RETURNED',
      toLocationId: input.receivingLocationId,
      referenceType: input.sourceReturnReceiptId ? 'returns.return_receipt' : 'returns.case',
      referenceId: input.sourceReturnReceiptId ?? null,
      reason: input.notes ?? 'Received returned piece into return quarantine',
    });

    return getInventoryUnit(trx, {
      organizationId: input.organizationId,
      unitId: input.unitId,
    });
  });
}

/**
 * Serialized Stock Reconciliation:
 * Verifies consistency between inventory ledger levels and physical serialized unit counts.
 */
export async function reconcileSerializedInventory(
  db: DatabaseExecutor,
  input: {
    organizationId: string;
    variantId: string;
    locationId: string;
  },
): Promise<{
  inventoryItemId: string;
  variantId: string;
  sku: string;
  locationId: string;
  locationName: string;
  trackingMode: VariantTrackingMode;
  onHandUnitsCount: number;
  availableUnitsCount: number;
  onHoldUnitsCount: number;
  reservedUnitsCount: number;
  inFulfillmentUnitsCount: number;
  ledgerSellableQuantity: string;
  ledgerUnavailableQuantity: string;
  ledgerReservedQuantity: string;
  isConsistent: boolean;
  discrepancies: readonly string[];
}> {
  const itemQuery = await sql<{
    item_id: string;
    sku: string;
    tracking_mode: VariantTrackingMode;
    location_name: string;
  }>`
    select item.id as item_id, variant.sku, item.tracking_mode, location.name as location_name
    from inventory.inventory_items item
    join catalog.product_variants variant on variant.id = item.variant_id
    join warehouse.locations location on location.id = ${input.locationId} and location.organization_id = item.organization_id
    where item.variant_id = ${input.variantId} and item.organization_id = ${input.organizationId}
  `.execute(db);

  const item = itemQuery.rows[0];
  if (!item) {
    throw new UnitTraceabilityDomainError(
      'NOT_FOUND',
      'Inventory item or variant was not found.',
    );
  }

  // Count units by status
  const counts = await sql<{
    status: UnitStatus;
    count: string;
  }>`
    select status, count(*)::text as count
    from inventory.inventory_units
    where organization_id = ${input.organizationId}
      and variant_id = ${input.variantId}
      and location_id = ${input.locationId}
      and status not in ('IN_TRANSFER', 'DISPATCHED', 'WRITTEN_OFF')
    group by status
  `.execute(db);

  const statusMap = new Map<UnitStatus, number>();
  for (const row of counts.rows) {
    statusMap.set(row.status, Number(row.count));
  }

  const availableUnits = statusMap.get('AVAILABLE') ?? 0;
  const onHoldUnits = (statusMap.get('ON_HOLD') ?? 0) + (statusMap.get('AWAITING_QC') ?? 0) + (statusMap.get('RETURNED') ?? 0);
  const reservedUnits = statusMap.get('RESERVED') ?? 0;
  const inFulfillmentUnits = statusMap.get('IN_FULFILLMENT') ?? 0;
  const onHandUnits = availableUnits + onHoldUnits + reservedUnits + inFulfillmentUnits;

  const unitConditions = await sql<{ condition_code: InventoryCondition; count: string }>`
    select inventory_condition_code as condition_code, count(*)::text as count
    from inventory.inventory_units
    where organization_id = ${input.organizationId}
      and variant_id = ${input.variantId}
      and location_id = ${input.locationId}
      and status not in ('IN_TRANSFER', 'DISPATCHED', 'WRITTEN_OFF')
    group by inventory_condition_code
  `.execute(db);
  const unitConditionMap = new Map<InventoryCondition, number>(
    unitConditions.rows.map((row) => [row.condition_code, Number(row.count)]),
  );

  // Ledger levels
  const levelRes = await sql<{
    sellable_quantity: string;
    unavailable_quantity: string;
    reserved_quantity: string;
  }>`
    select sellable_quantity::text, unavailable_quantity::text, reserved_quantity::text
    from inventory.inventory_levels
    where organization_id = ${input.organizationId}
      and inventory_item_id = ${item.item_id}
      and location_id = ${input.locationId}
  `.execute(db);

  const level = levelRes.rows[0] ?? {
    sellable_quantity: '0',
    unavailable_quantity: '0',
    reserved_quantity: '0',
  };

  const discrepancies: string[] = [];
  const ledgerReserved = Number(level.reserved_quantity);

  if (item.tracking_mode === 'SERIAL') {
    const ledgerConditions = await sql<{ condition_code: InventoryCondition; quantity: string }>`
      select condition_code, quantity::text
      from inventory.inventory_level_conditions
      where organization_id = ${input.organizationId}
        and inventory_item_id = ${item.item_id}
        and location_id = ${input.locationId}
    `.execute(db);
    const ledgerConditionMap = new Map<InventoryCondition, number>(
      ledgerConditions.rows.map((row) => [row.condition_code, Number(row.quantity)]),
    );
    for (const condition of ['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION'] as const) {
      const identities = unitConditionMap.get(condition) ?? 0;
      const ledgerQuantity = ledgerConditionMap.get(condition) ?? 0;
      if (identities !== ledgerQuantity) {
        discrepancies.push(
          `${condition} unit identities (${identities}) do not match the ledger condition quantity (${ledgerQuantity}).`,
        );
      }
    }
    if (reservedUnits + inFulfillmentUnits > ledgerReserved) {
      discrepancies.push(
        `Selected reserved/in-fulfillment units (${reservedUnits + inFulfillmentUnits}) exceed ledger reserved quantity (${ledgerReserved}).`,
      );
    }
  }

  return {
    inventoryItemId: item.item_id,
    variantId: input.variantId,
    sku: item.sku,
    locationId: input.locationId,
    locationName: item.location_name,
    trackingMode: item.tracking_mode,
    onHandUnitsCount: onHandUnits,
    availableUnitsCount: availableUnits,
    onHoldUnitsCount: onHoldUnits,
    reservedUnitsCount: reservedUnits,
    inFulfillmentUnitsCount: inFulfillmentUnits,
    ledgerSellableQuantity: level.sellable_quantity,
    ledgerUnavailableQuantity: level.unavailable_quantity,
    ledgerReservedQuantity: level.reserved_quantity,
    isConsistent: discrepancies.length === 0,
    discrepancies,
  };
}

/**
 * List audit events for a unit in chronological order.
 */
export async function listUnitEvents(
  db: DatabaseExecutor,
  input: { organizationId: string; unitId: string; limit?: number | undefined; offset?: number | undefined },
): Promise<readonly UnitEventView[]> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);

  const result = await sql<{
    id: string;
    event_id: string;
    unit_id: string;
    unit_code: string;
    event_type: UnitEventType;
    actor_type: string;
    actor_id: string | null;
    from_status: string | null;
    to_status: string | null;
    from_condition: string | null;
    to_condition: string | null;
    from_location_id: string | null;
    to_location_id: string | null;
    reference_type: string | null;
    reference_id: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>`
    select event.id::text, event.event_id, event.unit_id, unit.unit_code,
      event.event_type, event.actor_type, event.actor_id,
      event.from_status, event.to_status, event.from_condition, event.to_condition,
      event.from_location_id, event.to_location_id,
      event.reference_type, event.reference_id,
      event.reason, event.metadata, event.created_at
    from inventory.unit_events event
    join inventory.inventory_units unit on unit.id = event.unit_id
    where event.unit_id = ${input.unitId} and event.organization_id = ${input.organizationId}
    order by event.created_at desc, event.id desc
    limit ${limit} offset ${offset}
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    unitId: row.unit_id,
    unitCode: row.unit_code,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    fromCondition: row.from_condition,
    toCondition: row.to_condition,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  }));
}

/**
 * List inspections for a unit.
 */
export async function listUnitInspections(
  db: DatabaseExecutor,
  input: { organizationId: string; unitId: string },
): Promise<readonly UnitInspectionView[]> {
  const result = await sql<{
    id: string;
    unit_id: string;
    unit_code: string;
    inspection_number: string;
    inspector_actor_id: string | null;
    inspector_name: string | null;
    inspection_stage: InspectionStage;
    condition_result: UnitCondition;
    defect_description: string | null;
    notes: string | null;
    media_asset_ids: string[];
    inspection_outcome: InspectionOutcome;
    disposition: InspectionDisposition | null;
    created_at: Date;
  }>`
    select insp.id, insp.unit_id, unit.unit_code, insp.inspection_number,
      insp.inspector_actor_id, user_row.name as inspector_name,
      insp.inspection_stage, insp.condition_result, insp.defect_description,
      insp.notes, insp.media_asset_ids, insp.inspection_outcome, insp.disposition,
      insp.created_at
    from inventory.unit_inspections insp
    join inventory.inventory_units unit on unit.id = insp.unit_id
    left join iam.users user_row on user_row.id = insp.inspector_actor_id
    where insp.unit_id = ${input.unitId} and insp.organization_id = ${input.organizationId}
    order by insp.created_at desc
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    unitCode: row.unit_code,
    inspectionNumber: row.inspection_number,
    inspectorActorId: row.inspector_actor_id,
    inspectorName: row.inspector_name,
    inspectionStage: row.inspection_stage,
    conditionResult: row.condition_result,
    defectDescription: row.defect_description,
    notes: row.notes,
    mediaAssetIds: row.media_asset_ids,
    inspectionOutcome: row.inspection_outcome,
    disposition: row.disposition,
    createdAt: row.created_at.toISOString(),
  }));
}

/**
 * List repairs for a unit.
 */
export async function listUnitRepairs(
  db: DatabaseExecutor,
  input: { organizationId: string; unitId: string },
): Promise<readonly UnitRepairView[]> {
  const result = await sql<{
    id: string;
    unit_id: string;
    unit_code: string;
    repair_number: string;
    repair_status: RepairStatus;
    defect_description: string;
    action_required: string | null;
    action_performed: string | null;
    technician_name: string | null;
    cost_amount: string | null;
    cost_currency: string;
    media_asset_ids: string[];
    notes: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    version: string;
    created_at: Date;
    updated_at: Date;
  }>`
    select rep.id, rep.unit_id, unit.unit_code, rep.repair_number,
      rep.repair_status, rep.defect_description, rep.action_required,
      rep.action_performed, rep.technician_name, rep.cost_amount::text,
      rep.cost_currency, rep.media_asset_ids, rep.notes,
      rep.started_at, rep.completed_at, rep.version::text,
      rep.created_at, rep.updated_at
    from inventory.unit_repairs rep
    join inventory.inventory_units unit on unit.id = rep.unit_id
    where rep.unit_id = ${input.unitId} and rep.organization_id = ${input.organizationId}
    order by rep.created_at desc
  `.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    unitCode: row.unit_code,
    repairNumber: row.repair_number,
    repairStatus: row.repair_status,
    defectDescription: row.defect_description,
    actionRequired: row.action_required,
    actionPerformed: row.action_performed,
    technicianName: row.technician_name,
    costAmount: row.cost_amount,
    costCurrency: row.cost_currency,
    mediaAssetIds: row.media_asset_ids,
    notes: row.notes,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Pure TypeScript Code 128 (Subset B) barcode SVG generator.
 * Encodes alphanumeric strings like "MVU-000101" into standard Code 128 bars.
 */
export function renderCode128Svg(text: string, height = 50, barWidth = 2): string {
  // Code 128 patterns: each pattern is an 11-module sequence of bars and spaces (represented as module widths)
  // 107 patterns (index 0-106)
  const code128Patterns: readonly string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (106 is STOP pattern)
  ];

  const START_B = 104;
  const STOP = 106;

  // Calculate values
  const values: number[] = [START_B];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    values.push(Math.max(0, Math.min(105, code)));
  }

  // Calculate checksum
  let checksum = START_B;
  for (let i = 1; i < values.length; i++) {
    checksum += values[i]! * i;
  }
  values.push(checksum % 103);
  values.push(STOP);

  // Convert to pattern widths
  let patternString = '';
  for (const v of values) {
    patternString += code128Patterns[v] ?? '';
  }

  // Render SVG rects
  let currentX = 10;
  let isBar = true;
  const rects: string[] = [];

  for (let i = 0; i < patternString.length; i++) {
    const width = Number.parseInt(patternString[i]!, 10) * barWidth;
    if (isBar) {
      rects.push(`<rect x="${currentX}" y="5" width="${width}" height="${height}" fill="currentColor" />`);
    }
    currentX += width;
    isBar = !isBar;
  }

  const totalWidth = currentX + 10;
  const totalHeight = height + 25;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <style>text { font-family: monospace; font-size: 12px; fill: currentColor; text-anchor: middle; }</style>
  <g>${rects.join('')}</g>
  <text x="${totalWidth / 2}" y="${totalHeight - 5}">${text}</text>
</svg>`;
}
