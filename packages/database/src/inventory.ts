import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  consumeCostPositionsForInventoryLossInTransaction,
  dispatchTransferCostPositionsInTransaction,
  moveCostPositionsInTransaction,
  recordUnvaluedInventoryAdditionInTransaction,
  receiveTransferCostPositionsInTransaction,
  writeOffTransferCostPositionsInTransaction,
} from './costing.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { requireActiveLocationCapability } from './warehouse.js';

export type InventoryCondition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
export type InventoryTransactionType =
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT'
  | 'CONDITION_CHANGE'
  | 'TRANSFER_DISPATCH'
  | 'TRANSFER_RECEIPT'
  | 'TRANSFER_WRITE_OFF'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'FULFILLMENT_DISPATCH'
  | 'INBOUND_RECEIPT'
  | 'RETURN_RECEIPT';

export class InventoryDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION_FAILED'
      | 'INSUFFICIENT_STOCK'
      | 'STALE_VERSION'
      | 'IDEMPOTENCY_KEY_REUSED',
    message: string,
  ) {
    super(message);
    this.name = 'InventoryDomainError';
  }
}

export interface InventoryBalance {
  readonly inventoryItemId: string;
  readonly locationId: string;
  readonly condition: InventoryCondition;
  readonly onHand: string;
  readonly reserved: string;
  readonly availableToSell: string;
}

export interface InventoryPosition {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string | null;
  readonly inventoryStatus: 'ACTIVE' | 'ARCHIVED';
  readonly variantStatus: 'ACTIVE' | 'ARCHIVED';
  readonly unitCode: string;
  readonly locationId: string;
  readonly locationCode: string;
  readonly locationName: string;
  readonly onHand: string;
  readonly sellable: string;
  readonly reserved: string;
  readonly availableToSell: string;
  readonly unavailable: string;
  readonly damaged: string;
  readonly quarantine: string;
  readonly inspection: string;
  readonly incomingTransfer: string;
  readonly outgoingTransfer: string;
  readonly incomingSupply: string;
  readonly activeReservationCount: number;
  readonly lastMovementAt: Date | null;
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input);
}

function assertQuantity(value: string, name = 'Quantity'): void {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || value === '0' || /^0\.0{1,6}$/.test(value))
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      `${name} must be a positive decimal with at most six places.`,
    );
}

function rowBalance(row: {
  inventory_item_id: string;
  location_id: string;
  condition_code: InventoryCondition;
  quantity: string;
  reserved_quantity: string;
}): InventoryBalance {
  const quantity = subtract(row.quantity, '0');
  const reserved = subtract(row.reserved_quantity, '0');
  return {
    inventoryItemId: row.inventory_item_id,
    locationId: row.location_id,
    condition: row.condition_code,
    onHand: quantity,
    reserved: row.condition_code === 'SELLABLE' ? reserved : '0',
    availableToSell: row.condition_code === 'SELLABLE' ? subtract(quantity, reserved) : '0',
  };
}

function subtract(left: string, right: string): string {
  const scale = 1_000_000n;
  const parse = (value: string) => {
    const [integer, fraction = ''] = value.split('.');
    return BigInt(integer ?? '0') * scale + BigInt(((fraction ?? '') + '000000').slice(0, 6));
  };
  const result = parse(left) - parse(right);
  const sign = result < 0 ? '-' : '';
  const absolute = result < 0 ? -result : result;
  const fraction = (absolute % scale).toString().padStart(6, '0').replace(/0+$/, '');
  return `${sign}${(absolute / scale).toString()}${fraction ? `.${fraction}` : ''}`;
}

async function assertInventoryItemQuantityPolicy(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  inventoryItemId: string,
  quantity: string,
): Promise<void> {
  const item = await sql<{
    unit_code: string;
  }>`select unit_code from inventory.inventory_items where organization_id = ${organizationId} and id = ${inventoryItemId}`.execute(
    transaction,
  );
  if (!item.rows[0]) throw new InventoryDomainError('NOT_FOUND', 'Inventory Item was not found.');
  if (item.rows[0].unit_code === 'UNIT' && fixedQuantity(quantity) % 1_000_000n !== 0n)
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Unit-tracked Inventory Items require whole-number quantities.',
    );
}

function fixedQuantity(value: string): bigint {
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  return BigInt(integer) * 1_000_000n + BigInt((fraction + '000000').slice(0, 6));
}

function sumPositiveQuantities(values: readonly string[]): string {
  const total = values.reduce((sum, value) => sum + fixedQuantity(value), 0n);
  const fraction = (total % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${total / 1_000_000n}${fraction ? `.${fraction}` : ''}`;
}

async function ensureItem(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  variantId: string,
  requireActiveCatalog = false,
): Promise<string> {
  const variant = await sql<{
    id: string;
    variant_status: 'ACTIVE' | 'ARCHIVED';
    product_status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  }>`select variant.id, variant.status as variant_status, product.status as product_status
      from catalog.product_variants variant
      join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
      where variant.id = ${variantId} and variant.organization_id = ${organizationId}`.execute(
    transaction,
  );
  const catalogEntity = variant.rows[0];
  if (!catalogEntity)
    throw new InventoryDomainError(
      'NOT_FOUND',
      'Catalog Variant was not found in this organization.',
    );
  if (
    requireActiveCatalog &&
    (catalogEntity.variant_status !== 'ACTIVE' || catalogEntity.product_status === 'ARCHIVED')
  )
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Archived Catalog variants cannot receive new sellable stock or reservations.',
    );
  const inserted = await sql<{
    id: string;
  }>`insert into inventory.inventory_items (organization_id, variant_id) values (${organizationId}, ${variantId}) on conflict (variant_id) do update set updated_at = inventory.inventory_items.updated_at returning id`.execute(
    transaction,
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('Inventory Item creation did not return an id.');
  return id;
}

export async function ensureInventoryItemForVariant(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<string> {
  return db
    .transaction()
    .execute((transaction) => ensureItem(transaction, organizationId, variantId));
}

export async function ensureInventoryItemForVariantInTransaction(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<string> {
  return ensureItem(transaction, organizationId, variantId);
}

async function lockLevel(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
) {
  await sql`insert into inventory.inventory_levels (organization_id, inventory_item_id, location_id) values (${organizationId}, ${inventoryItemId}, ${locationId}) on conflict (organization_id, inventory_item_id, location_id) do nothing`.execute(
    transaction,
  );
  const level = await sql<{
    id: string;
    sellable_quantity: string;
    unavailable_quantity: string;
    reserved_quantity: string;
  }>`select id, sellable_quantity::text, unavailable_quantity::text, reserved_quantity::text from inventory.inventory_levels where organization_id = ${organizationId} and inventory_item_id = ${inventoryItemId} and location_id = ${locationId} for update`.execute(
    transaction,
  );
  const row = level.rows[0];
  if (!row) throw new Error('Inventory Level lock could not be acquired.');
  return row;
}

async function applyConditionDelta(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    inventoryItemId: string;
    locationId: string;
    condition: InventoryCondition;
    quantityDelta: string;
  },
): Promise<void> {
  const level = await lockLevel(
    transaction,
    input.organizationId,
    input.inventoryItemId,
    input.locationId,
  );
  await sql`insert into inventory.inventory_level_conditions (organization_id, inventory_item_id, location_id, condition_code) values (${input.organizationId}, ${input.inventoryItemId}, ${input.locationId}, ${input.condition}) on conflict (organization_id, inventory_item_id, location_id, condition_code) do nothing`.execute(
    transaction,
  );
  const condition = await sql<{
    quantity: string;
  }>`select quantity::text from inventory.inventory_level_conditions where organization_id = ${input.organizationId} and inventory_item_id = ${input.inventoryItemId} and location_id = ${input.locationId} and condition_code = ${input.condition} for update`.execute(
    transaction,
  );
  const current = condition.rows[0]?.quantity;
  if (current === undefined) throw new Error('Inventory condition lock could not be acquired.');
  const nextCondition = subtract(
    current,
    input.quantityDelta.startsWith('-') ? input.quantityDelta.slice(1) : `-${input.quantityDelta}`,
  );
  if (nextCondition.startsWith('-'))
    throw new InventoryDomainError(
      'INSUFFICIENT_STOCK',
      'Inventory condition cannot become negative.',
    );
  const nextSellable =
    input.condition === 'SELLABLE'
      ? subtract(
          level.sellable_quantity,
          input.quantityDelta.startsWith('-')
            ? input.quantityDelta.slice(1)
            : `-${input.quantityDelta}`,
        )
      : level.sellable_quantity;
  const nextUnavailable =
    input.condition === 'SELLABLE'
      ? level.unavailable_quantity
      : subtract(
          level.unavailable_quantity,
          input.quantityDelta.startsWith('-')
            ? input.quantityDelta.slice(1)
            : `-${input.quantityDelta}`,
        );
  if (
    nextSellable.startsWith('-') ||
    nextUnavailable.startsWith('-') ||
    (input.condition === 'SELLABLE' &&
      subtract(nextSellable, level.reserved_quantity).startsWith('-'))
  )
    throw new InventoryDomainError(
      'INSUFFICIENT_STOCK',
      'Operation would make sellable inventory or availability negative.',
    );
  await sql`update inventory.inventory_level_conditions set quantity = ${nextCondition}::numeric, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and inventory_item_id = ${input.inventoryItemId} and location_id = ${input.locationId} and condition_code = ${input.condition}`.execute(
    transaction,
  );
  await sql`update inventory.inventory_levels set sellable_quantity = ${nextSellable}::numeric, unavailable_quantity = ${nextUnavailable}::numeric, version = version + 1, updated_at = now() where id = ${level.id}`.execute(
    transaction,
  );
}

async function postTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    transactionType: InventoryTransactionType;
    reasonCode?: string | undefined;
    reasonText?: string | undefined;
    referenceType?: string | undefined;
    referenceId?: string | undefined;
    idempotencyRecordId?: string | undefined;
    lines: readonly {
      inventoryItemId: string;
      locationId: string;
      condition: InventoryCondition;
      quantityDelta: string;
    }[];
  },
): Promise<string> {
  for (const line of input.lines)
    await assertInventoryItemQuantityPolicy(
      transaction,
      input.organizationId,
      line.inventoryItemId,
      line.quantityDelta,
    );
  const created = await sql<{
    id: string;
  }>`insert into inventory.inventory_transactions (organization_id, transaction_type, reason_code, reason_text, reference_type, reference_id, idempotency_record_id, created_by_actor_id) values (${input.organizationId}, ${input.transactionType}, ${input.reasonCode ?? null}, ${input.reasonText ?? null}, ${input.referenceType ?? null}, ${input.referenceId ?? null}::uuid, ${input.idempotencyRecordId ?? null}::uuid, ${input.actorId}) returning id`.execute(
    transaction,
  );
  const transactionId = created.rows[0]?.id;
  if (!transactionId) throw new Error('Inventory transaction did not return an id.');
  for (const line of [...input.lines].sort((a, b) =>
    `${a.locationId}:${a.inventoryItemId}:${a.condition}`.localeCompare(
      `${b.locationId}:${b.inventoryItemId}:${b.condition}`,
    ),
  )) {
    await applyConditionDelta(transaction, {
      organizationId: input.organizationId,
      inventoryItemId: line.inventoryItemId,
      locationId: line.locationId,
      condition: line.condition,
      quantityDelta: line.quantityDelta,
    });
    await sql`insert into inventory.inventory_movement_lines (organization_id, inventory_transaction_id, inventory_item_id, location_id, condition_code, quantity_delta) values (${input.organizationId}, ${transactionId}, ${line.inventoryItemId}, ${line.locationId}, ${line.condition}, ${line.quantityDelta}::numeric)`.execute(
      transaction,
    );
  }
  return transactionId;
}

/**
 * Published inventory boundary for canonical inbound receiving. The caller
 * owns receipt/idempotency state; Inventory owns the single append-only
 * transaction and its condition-level balance projections.
 */
export async function receiveInboundInventoryInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receiptId: string;
    locationId: string;
    idempotencyRecordId: string;
    lines: readonly {
      variantId: string;
      condition: InventoryCondition;
      quantity: string;
    }[];
  },
): Promise<{ transactionId: string; inventoryItemIds: ReadonlyMap<string, string> }> {
  await requireActiveLocationCapability(
    transaction,
    input.organizationId,
    input.locationId,
    'STOCK_HOLDING',
  );
  await requireActiveLocationCapability(
    transaction,
    input.organizationId,
    input.locationId,
    'PURCHASE_RECEIVING',
  );
  const itemIds = new Map<string, string>();
  for (const line of input.lines) {
    assertQuantity(line.quantity, 'Received quantity');
    if (!itemIds.has(line.variantId))
      itemIds.set(
        line.variantId,
        await ensureItem(transaction, input.organizationId, line.variantId),
      );
  }
  const transactionId = await postTransaction(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    transactionType: 'INBOUND_RECEIPT',
    reasonCode: 'INBOUND_RECEIPT',
    referenceType: 'receiving.inbound_receipt',
    referenceId: input.receiptId,
    idempotencyRecordId: input.idempotencyRecordId,
    lines: input.lines.map((line) => ({
      inventoryItemId: itemIds.get(line.variantId)!,
      locationId: input.locationId,
      condition: line.condition,
      quantityDelta: line.quantity,
    })),
  });
  return { transactionId, inventoryItemIds: itemIds };
}

/** Reverse receiving is physical truth too, but deliberately uses its own immutable source. */
export async function receiveReturnInventoryInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    receiptId: string;
    locationId: string;
    idempotencyRecordId: string;
    lines: readonly { inventoryItemId: string; condition: InventoryCondition; quantity: string }[];
  },
): Promise<string> {
  await requireActiveLocationCapability(
    transaction,
    input.organizationId,
    input.locationId,
    'STOCK_HOLDING',
  );
  await requireActiveLocationCapability(
    transaction,
    input.organizationId,
    input.locationId,
    'RETURN_RECEIVING',
  );
  for (const line of input.lines) assertQuantity(line.quantity, 'Returned quantity');
  return postTransaction(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    transactionType: 'RETURN_RECEIPT',
    reasonCode: 'RETURN_RECEIPT',
    referenceType: 'returns.return_receipt',
    referenceId: input.receiptId,
    idempotencyRecordId: input.idempotencyRecordId,
    lines: input.lines.map((line) => ({
      ...line,
      locationId: input.locationId,
      quantityDelta: line.quantity,
    })),
  });
}

async function completeIdempotency(
  transaction: Transaction<DatabaseSchema>,
  recordId: string,
  entityType: string,
  entityId: string,
  response: unknown,
): Promise<void> {
  await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = ${entityType}, result_entity_id = ${entityId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${recordId}`.execute(
    transaction,
  );
}

async function beginIdempotent(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    principalType?: 'USER' | 'SYSTEM';
    operation: string;
    idempotencyKey: string;
    request: unknown;
  },
): Promise<{ replay?: unknown; recordId?: string }> {
  try {
    const record = await claimIdempotencyRecord(transaction, {
      organizationId: input.organizationId,
      principalType: input.principalType ?? 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input.request),
    });
    if (!record.created) {
      const existing = await sql<{
        safe_response: unknown;
        status: string;
      }>`select safe_response, status from platform.idempotency_records where id = ${record.id}`.execute(
        transaction,
      );
      if (existing.rows[0]?.status === 'SUCCEEDED')
        return { replay: existing.rows[0].safe_response };
      throw new InventoryDomainError(
        'CONFLICT',
        'The same inventory command is already in progress.',
      );
    }
    return { recordId: record.id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new InventoryDomainError('IDEMPOTENCY_KEY_REUSED', error.message);
    throw error;
  }
}

async function emit(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    actorType?: 'USER' | 'SYSTEM';
    action: string;
    eventType: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(transaction, {
    organizationId: input.organizationId,
    actorType: input.actorType ?? 'USER',
    ...(input.actorId ? { actorId: input.actorId } : {}),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, ${input.eventType}, 1, ${input.targetType}, ${input.targetId}::uuid, 1, ${JSON.stringify({ id: input.targetId })}::jsonb, now())`.execute(
    transaction,
  );
}

export async function adjustInventory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    locationId: string;
    condition: InventoryCondition;
    quantityDelta: string;
    reasonCode: 'OPENING_BALANCE' | 'CORRECTION' | 'DAMAGE' | 'FOUND_STOCK' | 'OTHER';
    note?: string;
    idempotencyKey: string;
  },
): Promise<{ transactionId: string; inventoryItemId: string }> {
  assertQuantity(input.quantityDelta.replace(/^-/, ''), 'Adjustment quantity');
  if (!input.quantityDelta.startsWith('-') && input.quantityDelta === '0')
    throw new InventoryDomainError('VALIDATION_FAILED', 'Adjustment cannot be zero.');
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inventory.adjust',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as { transactionId: string; inventoryItemId: string };
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.locationId,
      'STOCK_HOLDING',
    );
    const inventoryItemId = await ensureItem(
      transaction,
      input.organizationId,
      input.variantId,
      !input.quantityDelta.startsWith('-'),
    );
    const transactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: input.reasonCode === 'OPENING_BALANCE' ? 'OPENING_BALANCE' : 'ADJUSTMENT',
      reasonCode: input.reasonCode,
      reasonText: input.note,
      idempotencyRecordId: started.recordId,
      lines: [
        {
          inventoryItemId,
          locationId: input.locationId,
          condition: input.condition,
          quantityDelta: input.quantityDelta,
        },
      ],
    });
    if (input.quantityDelta.startsWith('-'))
      await consumeCostPositionsForInventoryLossInTransaction(transaction, {
        organizationId: input.organizationId,
        inventoryItemId,
        locationId: input.locationId,
        condition: input.condition,
        quantity: input.quantityDelta.slice(1),
        inventoryTransactionId: transactionId,
      });
    else
      await recordUnvaluedInventoryAdditionInTransaction(transaction, {
        organizationId: input.organizationId,
        inventoryTransactionId: transactionId,
        inventoryItemId,
        locationId: input.locationId,
        condition: input.condition,
        quantity: input.quantityDelta,
        reasonCode: input.reasonCode,
      });
    const response = { transactionId, inventoryItemId };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inventory.transaction',
      transactionId,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inventory.adjusted',
      eventType: 'inventory.adjusted',
      targetType: 'inventory.transaction',
      targetId: transactionId,
      metadata: {
        inventoryItemId,
        locationId: input.locationId,
        condition: input.condition,
        quantityDelta: input.quantityDelta,
        reasonCode: input.reasonCode,
      },
    });
    return response;
  });
}

export async function moveInventoryCondition(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    variantId: string;
    locationId: string;
    fromCondition: InventoryCondition;
    toCondition: InventoryCondition;
    quantity: string;
    reason?: string;
    idempotencyKey: string;
  },
): Promise<{ transactionId: string; inventoryItemId: string }> {
  assertQuantity(input.quantity);
  if (input.fromCondition === input.toCondition)
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Condition movement requires different conditions.',
    );
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inventory.condition-move',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as { transactionId: string; inventoryItemId: string };
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.locationId,
      'STOCK_HOLDING',
    );
    const inventoryItemId = await ensureItem(transaction, input.organizationId, input.variantId);
    const transactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: 'CONDITION_CHANGE',
      reasonCode: 'CONDITION_MOVE',
      reasonText: input.reason,
      idempotencyRecordId: started.recordId,
      lines: [
        {
          inventoryItemId,
          locationId: input.locationId,
          condition: input.fromCondition,
          quantityDelta: `-${input.quantity}`,
        },
        {
          inventoryItemId,
          locationId: input.locationId,
          condition: input.toCondition,
          quantityDelta: input.quantity,
        },
      ],
    });
    await moveCostPositionsInTransaction(transaction, {
      organizationId: input.organizationId,
      inventoryItemId,
      locationId: input.locationId,
      fromCondition: input.fromCondition,
      toCondition: input.toCondition,
      quantity: input.quantity,
      inventoryTransactionId: transactionId,
    });
    const response = { transactionId, inventoryItemId };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inventory.transaction',
      transactionId,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inventory.condition_moved',
      eventType: 'inventory.condition_moved',
      targetType: 'inventory.transaction',
      targetId: transactionId,
      metadata: {
        inventoryItemId,
        locationId: input.locationId,
        fromCondition: input.fromCondition,
        toCondition: input.toCondition,
        quantity: input.quantity,
      },
    });
    return response;
  });
}

export async function createInventoryReservation(
  db: Kysely<DatabaseSchema>,
  input: ReservationInput,
): Promise<{ reservationId: string; inventoryItemId: string }> {
  return db
    .transaction()
    .execute((transaction) => createInventoryReservationInTransaction(transaction, input));
}

export interface ReservationInput {
  organizationId: string;
  actorId: string;
  variantId: string;
  locationId: string;
  quantity: string;
  sourceType: string;
  sourceReference: string;
  expiresAt?: Date;
  idempotencyKey: string;
}

/** Reuses Inventory's locking/audit/outbox mechanics inside a caller-owned business transaction. */
export async function createInventoryReservationInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: ReservationInput,
): Promise<{ reservationId: string; inventoryItemId: string }> {
  assertQuantity(input.quantity);
  const started = await beginIdempotent(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    operation: 'inventory.reserve',
    idempotencyKey: input.idempotencyKey,
    request: { ...input, expiresAt: input.expiresAt?.toISOString() },
  });
  if (started.replay) return started.replay as { reservationId: string; inventoryItemId: string };
  await requireActiveLocationCapability(
    transaction,
    input.organizationId,
    input.locationId,
    'STOCK_HOLDING',
  );
  const inventoryItemId = await ensureItem(
    transaction,
    input.organizationId,
    input.variantId,
    true,
  );
  await assertInventoryItemQuantityPolicy(
    transaction,
    input.organizationId,
    inventoryItemId,
    input.quantity,
  );
  const level = await lockLevel(
    transaction,
    input.organizationId,
    inventoryItemId,
    input.locationId,
  );
  if (
    subtract(level.sellable_quantity, level.reserved_quantity) === '0' ||
    subtract(subtract(level.sellable_quantity, level.reserved_quantity), input.quantity).startsWith(
      '-',
    )
  )
    throw new InventoryDomainError(
      'INSUFFICIENT_STOCK',
      'Insufficient available-to-sell inventory.',
    );
  const inserted = await sql<{
    id: string;
  }>`insert into inventory.inventory_reservations (organization_id, inventory_item_id, location_id, quantity, source_type, source_reference, expires_at) values (${input.organizationId}, ${inventoryItemId}, ${input.locationId}, ${input.quantity}::numeric, ${input.sourceType}, ${input.sourceReference}, ${input.expiresAt ?? null}) returning id`.execute(
    transaction,
  );
  const reservationId = inserted.rows[0]?.id;
  if (!reservationId) throw new Error('Reservation creation did not return an id.');
  await sql`update inventory.inventory_levels set reserved_quantity = reserved_quantity + ${input.quantity}::numeric, version = version + 1, updated_at = now() where id = ${level.id}`.execute(
    transaction,
  );
  const response = { reservationId, inventoryItemId };
  await completeIdempotency(
    transaction,
    started.recordId!,
    'inventory.reservation',
    reservationId,
    response,
  );
  await emit(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'inventory.reservation.created',
    eventType: 'inventory.reservation.created',
    targetType: 'inventory.reservation',
    targetId: reservationId,
    metadata: {
      inventoryItemId,
      locationId: input.locationId,
      quantity: input.quantity,
      sourceType: input.sourceType,
    },
  });
  return response;
}

export async function releaseInventoryReservation(
  db: Kysely<DatabaseSchema>,
  input: ReservationReleaseInput,
): Promise<{ reservationId: string; released: boolean }> {
  return db
    .transaction()
    .execute((transaction) => releaseInventoryReservationInTransaction(transaction, input));
}

export interface ReservationReleaseInput {
  organizationId: string;
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  /**
   * Order stock is owned by the Order lifecycle. Only the Order cancellation
   * transaction may release it; generic Inventory commands must not strand a
   * fulfillment that still relies on the allocation.
   */
  authority?: { type: 'ORDER_CANCELLATION'; orderId: string } | { type: 'EXPIRY' };
  actorType?: 'USER' | 'SYSTEM';
}

export async function releaseInventoryReservationInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: ReservationReleaseInput,
): Promise<{ reservationId: string; released: boolean }> {
  const started = await beginIdempotent(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    operation: 'inventory.release-reservation',
    idempotencyKey: input.idempotencyKey,
    request: input,
    ...(input.actorType === 'SYSTEM' ? { principalType: 'SYSTEM' as const } : {}),
  });
  if (started.replay) return started.replay as { reservationId: string; released: boolean };
  const reservation = await sql<{
    id: string;
    inventory_item_id: string;
    location_id: string;
    quantity: string;
    status: string;
  }>`select id, inventory_item_id, location_id, quantity::text, status from inventory.inventory_reservations where id = ${input.reservationId} and organization_id = ${input.organizationId} for update`.execute(
    transaction,
  );
  const row = reservation.rows[0];
  if (!row) throw new InventoryDomainError('NOT_FOUND', 'Reservation was not found.');
  const orderOwner = await sql<{ order_id: string }>`
    select bridge.order_id
    from orders.order_inventory_reservations bridge
    where bridge.organization_id = ${input.organizationId}
      and bridge.reservation_id = ${row.id}
    for update
  `.execute(transaction);
  if (
    orderOwner.rows[0] &&
    (input.authority?.type !== 'ORDER_CANCELLATION' ||
      input.authority.orderId !== orderOwner.rows[0].order_id)
  )
    throw new InventoryDomainError(
      'CONFLICT',
      'This reservation belongs to an Order. Cancel the Order to release its stock safely.',
    );
  let released = false;
  if (['ACTIVE', 'PARTIALLY_CONSUMED'].includes(row.status)) {
    const allocations = await sql<{
      id: string;
      reserved_quantity: string;
      consumed_quantity: string;
      released_quantity: string;
    }>`select id, reserved_quantity::text, consumed_quantity::text, released_quantity::text from inventory.inventory_reservation_allocations where organization_id = ${input.organizationId} and reservation_id = ${row.id} for update`.execute(
      transaction,
    );
    const remainingResult = await sql<{
      remaining: string;
    }>`select coalesce(sum(reserved_quantity - consumed_quantity - released_quantity), 0)::text as remaining from inventory.inventory_reservation_allocations where organization_id = ${input.organizationId} and reservation_id = ${row.id}`.execute(
      transaction,
    );
    // Generic Inventory reservations predate the order/fulfillment bridge and
    // legitimately have no allocation row. Their header quantity remains the
    // authoritative release amount.
    const remaining =
      allocations.rows.length === 0 ? row.quantity : (remainingResult.rows[0]?.remaining ?? '0');
    if (remaining === '0') {
      const response = { reservationId: row.id, released: false };
      await completeIdempotency(
        transaction,
        started.recordId!,
        'inventory.reservation',
        row.id,
        response,
      );
      return response;
    }
    const level = await lockLevel(
      transaction,
      input.organizationId,
      row.inventory_item_id,
      row.location_id,
    );
    await sql`update inventory.inventory_levels set reserved_quantity = reserved_quantity - ${remaining}::numeric, version = version + 1, updated_at = now() where id = ${level.id}`.execute(
      transaction,
    );
    if (allocations.rows.length)
      await sql`update inventory.inventory_reservation_allocations set released_quantity = reserved_quantity - consumed_quantity, updated_at = now(), version = version + 1 where reservation_id = ${row.id} and organization_id = ${input.organizationId}`.execute(
        transaction,
      );
    const terminalStatus = input.authority?.type === 'EXPIRY' ? 'EXPIRED' : 'RELEASED';
    await sql`update inventory.inventory_reservations set status = ${terminalStatus}, released_at = now(), updated_at = now(), version = version + 1 where id = ${row.id}`.execute(
      transaction,
    );
    released = true;
    await emit(transaction, {
      organizationId: input.organizationId,
      ...(input.actorType === 'SYSTEM' ? {} : { actorId: input.actorId }),
      action:
        input.authority?.type === 'EXPIRY'
          ? 'inventory.reservation.expired'
          : 'inventory.reservation.released',
      eventType:
        input.authority?.type === 'EXPIRY'
          ? 'inventory.reservation.expired'
          : 'inventory.reservation.released',
      targetType: 'inventory.reservation',
      targetId: row.id,
      metadata: {
        inventoryItemId: row.inventory_item_id,
        locationId: row.location_id,
        quantity: remaining,
        disposition: input.authority?.type === 'EXPIRY' ? 'EXPIRED' : 'RELEASED',
      },
      ...(input.actorType ? { actorType: input.actorType } : {}),
    });
  }
  const response = { reservationId: row.id, released };
  await completeIdempotency(
    transaction,
    started.recordId!,
    'inventory.reservation',
    row.id,
    response,
  );
  return response;
}

/**
 * Releases only explicitly expiring, standalone holds. Order-owned stock has
 * its own cancellation/fulfillment lifecycle and is deliberately excluded,
 * even if malformed historical data happens to contain an expiry timestamp.
 */
export async function expireInventoryReservations(
  db: Kysely<DatabaseSchema>,
  limit = 100,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
    throw new InventoryDomainError('VALIDATION_FAILED', 'Expiry batch limit is invalid.');
  return db.transaction().execute(async (transaction) => {
    const candidates = await sql<{ id: string; organization_id: string }>`
      select reservation.id, reservation.organization_id
      from inventory.inventory_reservations reservation
      where reservation.status in ('ACTIVE', 'PARTIALLY_CONSUMED')
        and reservation.expires_at is not null
        and reservation.expires_at <= now()
        and not exists (
          select 1
          from orders.order_inventory_reservations bridge
          where bridge.organization_id = reservation.organization_id
            and bridge.reservation_id = reservation.id
        )
      order by reservation.expires_at, reservation.id
      limit ${limit}
      for update of reservation skip locked
    `.execute(transaction);
    let expired = 0;
    for (const candidate of candidates.rows) {
      const result = await releaseInventoryReservationInTransaction(transaction, {
        organizationId: candidate.organization_id,
        actorId: candidate.organization_id,
        actorType: 'SYSTEM',
        reservationId: candidate.id,
        idempotencyKey: `inventory-expiry:${candidate.id}`,
        authority: { type: 'EXPIRY' },
      });
      if (result.released) expired += 1;
    }
    return expired;
  });
}

/**
 * Fulfillment owns the workflow transition; Inventory owns this locked
 * physical movement. The surrounding fulfillment command is idempotent. A
 * dispatch can consume several allocations, while an inventory transaction
 * has a one-to-one idempotency-record constraint, so individual movements
 * deliberately do not reuse the fulfillment command's record.
 */
export async function consumeReservationAllocationInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reservationAllocationId: string;
    quantity: string;
    fulfillmentId: string;
    idempotencyRecordId?: string | undefined;
  },
): Promise<{ inventoryTransactionId: string; consumed: string }> {
  assertQuantity(input.quantity, 'Consumed quantity');
  const allocation = await sql<{
    id: string;
    reservation_id: string;
    inventory_item_id: string;
    location_id: string;
    reserved_quantity: string;
    consumed_quantity: string;
    released_quantity: string;
    reservation_status: string;
  }>`
    select allocation.id, allocation.reservation_id, allocation.inventory_item_id, allocation.location_id,
      allocation.reserved_quantity::text, allocation.consumed_quantity::text, allocation.released_quantity::text,
      reservation.status as reservation_status
    from inventory.inventory_reservation_allocations allocation
    join inventory.inventory_reservations reservation on reservation.id = allocation.reservation_id
    where allocation.organization_id = ${input.organizationId} and allocation.id = ${input.reservationAllocationId}
    for update of allocation, reservation
  `.execute(transaction);
  const row = allocation.rows[0];
  if (!row) throw new InventoryDomainError('NOT_FOUND', 'Reservation allocation was not found.');
  if (!['ACTIVE', 'PARTIALLY_CONSUMED'].includes(row.reservation_status))
    throw new InventoryDomainError(
      'CONFLICT',
      'Reservation is no longer available for physical consumption.',
    );
  const remaining = subtract(
    subtract(row.reserved_quantity, row.consumed_quantity),
    row.released_quantity,
  );
  if (subtract(remaining, input.quantity).startsWith('-'))
    throw new InventoryDomainError(
      'CONFLICT',
      'Requested physical consumption exceeds the active reservation allocation.',
    );
  const level = await lockLevel(
    transaction,
    input.organizationId,
    row.inventory_item_id,
    row.location_id,
  );
  // Make the reservation unavailable before posting the physical movement.
  // postTransaction checks ATS as sellable minus reserved; decrementing
  // sellable first would reject a valid final reserved unit.
  await sql`update inventory.inventory_levels set reserved_quantity = reserved_quantity - ${input.quantity}::numeric, version = version + 1, updated_at = now() where id = ${level.id}`.execute(
    transaction,
  );
  const inventoryTransactionId = await postTransaction(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    transactionType: 'FULFILLMENT_DISPATCH',
    reasonCode: 'FULFILLMENT_DISPATCH',
    referenceType: 'fulfillment.fulfillment',
    referenceId: input.fulfillmentId,
    idempotencyRecordId: input.idempotencyRecordId,
    lines: [
      {
        inventoryItemId: row.inventory_item_id,
        locationId: row.location_id,
        condition: 'SELLABLE',
        quantityDelta: `-${input.quantity}`,
      },
    ],
  });
  await sql`update inventory.inventory_reservation_allocations set consumed_quantity = consumed_quantity + ${input.quantity}::numeric, updated_at = now(), version = version + 1 where id = ${row.id}`.execute(
    transaction,
  );
  const totals = await sql<{
    remaining: string;
  }>`select coalesce(sum(reserved_quantity - consumed_quantity - released_quantity), 0)::text as remaining from inventory.inventory_reservation_allocations where organization_id = ${input.organizationId} and reservation_id = ${row.reservation_id}`.execute(
    transaction,
  );
  await sql`update inventory.inventory_reservations set status = case when ${totals.rows[0]!.remaining}::numeric = 0 then 'CONSUMED' else 'PARTIALLY_CONSUMED' end, consumed_at = case when ${totals.rows[0]!.remaining}::numeric = 0 then now() else consumed_at end, updated_at = now(), version = version + 1 where id = ${row.reservation_id}`.execute(
    transaction,
  );
  return { inventoryTransactionId, consumed: input.quantity };
}

export async function listInventoryPositions(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    locationId?: string;
    inventoryItemId?: string;
    search?: string;
    condition?: InventoryCondition;
    availability?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    catalogStatus?: 'ACTIVE' | 'ARCHIVED';
    sortBy?: 'PRODUCT' | 'SKU' | 'ON_HAND' | 'AVAILABLE' | 'LAST_MOVEMENT';
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  } = {},
): Promise<{ items: readonly InventoryPosition[]; totalCount: number }> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 25;
  const offset = (page - 1) * limit;
  const locationFilter = input.locationId
    ? sql`level.location_id = ${input.locationId}::uuid`
    : sql`true`;
  const itemFilter = input.inventoryItemId
    ? sql`level.inventory_item_id = ${input.inventoryItemId}::uuid`
    : sql`true`;
  const searchFilter = input.search?.trim()
    ? sql`(variant.sku ilike '%' || ${input.search.trim()} || '%' or product.title ilike '%' || ${input.search.trim()} || '%' or coalesce(variant.title, '') ilike '%' || ${input.search.trim()} || '%' or location.name ilike '%' || ${input.search.trim()} || '%' or location.code ilike '%' || ${input.search.trim()} || '%')`
    : sql`true`;
  const catalogStatusFilter =
    input.catalogStatus === 'ARCHIVED'
      ? sql`(item.status = 'ARCHIVED' or variant.status = 'ARCHIVED' or product.status = 'ARCHIVED')`
      : input.catalogStatus === 'ACTIVE'
        ? sql`(item.status = 'ACTIVE' and variant.status = 'ACTIVE' and product.status <> 'ARCHIVED')`
        : sql`true`;
  const conditionFilter = input.condition
    ? sql`coalesce(conditions.${sql.raw(
        input.condition === 'SELLABLE'
          ? 'sellable'
          : input.condition === 'DAMAGED'
            ? 'damaged'
            : input.condition === 'QUARANTINE'
              ? 'quarantine'
              : 'inspection',
      )}, 0) > 0`
    : sql`true`;
  const availabilityFilter =
    input.availability === 'IN_STOCK'
      ? sql`level.sellable_quantity - level.reserved_quantity > 0`
      : input.availability === 'LOW_STOCK'
        ? sql`level.sellable_quantity - level.reserved_quantity between 1 and 5`
        : input.availability === 'OUT_OF_STOCK'
          ? sql`level.sellable_quantity - level.reserved_quantity <= 0`
          : sql`true`;
  const sortExpression =
    input.sortBy === 'SKU'
      ? sql`variant.sku`
      : input.sortBy === 'ON_HAND'
        ? sql`level.sellable_quantity + level.unavailable_quantity`
        : input.sortBy === 'AVAILABLE'
          ? sql`level.sellable_quantity - level.reserved_quantity`
          : input.sortBy === 'LAST_MOVEMENT'
            ? sql`last_movement.occurred_at`
            : sql`product.title`;
  const sortOrder = sql.raw(input.sortOrder === 'DESC' ? 'desc' : 'asc');

  const fromAndFilters = sql`
    from (
      select position_key.organization_id, position_key.inventory_item_id, position_key.location_id,
        coalesce(current_level.sellable_quantity, 0) as sellable_quantity,
        coalesce(current_level.unavailable_quantity, 0) as unavailable_quantity,
        coalesce(current_level.reserved_quantity, 0) as reserved_quantity
      from (
        select organization_id, inventory_item_id, location_id from inventory.inventory_levels
        union
        select line.organization_id, line.inventory_item_id, transfer.destination_location_id
        from warehouse.transfer_lines line
        join warehouse.transfers transfer on transfer.id=line.transfer_id and transfer.organization_id=line.organization_id
        left join warehouse.transfer_line_discrepancies discrepancy on discrepancy.organization_id=line.organization_id and discrepancy.transfer_line_id=line.id
        where transfer.status in ('IN_TRANSIT', 'PARTIALLY_RECEIVED')
          and line.dispatched_quantity > line.received_quantity + coalesce(discrepancy.quantity, 0)
        union
        select allocation.organization_id, item.id, shipment.receiving_location_id
        from inbound_shipment.purchase_line_allocations allocation
        join inbound_shipment.shipments shipment on shipment.id=allocation.shipment_id
          and shipment.organization_id=allocation.organization_id
        join inventory.inventory_items item on item.variant_id=allocation.variant_id
          and item.organization_id=allocation.organization_id
        where shipment.status in ('IN_TRANSIT', 'ARRIVED') and shipment.receiving_status<>'RECEIVED'
      ) position_key
      left join inventory.inventory_levels current_level
        on current_level.organization_id=position_key.organization_id
        and current_level.inventory_item_id=position_key.inventory_item_id
        and current_level.location_id=position_key.location_id
    ) level
    join inventory.inventory_items item on item.id = level.inventory_item_id and item.organization_id = level.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    join warehouse.locations location on location.id = level.location_id and location.organization_id = level.organization_id
    left join lateral (
      select
        coalesce(sum(condition.quantity) filter (where condition.condition_code = 'SELLABLE'), 0) as sellable,
        coalesce(sum(condition.quantity) filter (where condition.condition_code = 'DAMAGED'), 0) as damaged,
        coalesce(sum(condition.quantity) filter (where condition.condition_code = 'QUARANTINE'), 0) as quarantine,
        coalesce(sum(condition.quantity) filter (where condition.condition_code = 'INSPECTION'), 0) as inspection
      from inventory.inventory_level_conditions condition
      where condition.organization_id = level.organization_id
        and condition.inventory_item_id = level.inventory_item_id
        and condition.location_id = level.location_id
    ) conditions on true
    left join lateral (
      select max(transaction.occurred_at) as occurred_at
      from inventory.inventory_movement_lines movement
      join inventory.inventory_transactions transaction on transaction.id = movement.inventory_transaction_id
        and transaction.organization_id = movement.organization_id
      where movement.organization_id = level.organization_id
        and movement.inventory_item_id = level.inventory_item_id
        and movement.location_id = level.location_id
    ) last_movement on true
    left join lateral (
      select coalesce(sum(line.dispatched_quantity - line.received_quantity - coalesce(discrepancy.quantity, 0)), 0) as quantity
      from warehouse.transfer_lines line
      join warehouse.transfers transfer on transfer.id = line.transfer_id and transfer.organization_id = line.organization_id
      left join warehouse.transfer_line_discrepancies discrepancy on discrepancy.organization_id = line.organization_id and discrepancy.transfer_line_id = line.id
      where line.organization_id = level.organization_id and line.inventory_item_id = level.inventory_item_id
        and transfer.destination_location_id = level.location_id
        and transfer.status in ('IN_TRANSIT', 'PARTIALLY_RECEIVED')
    ) incoming_transfer on true
    left join lateral (
      select coalesce(sum(line.dispatched_quantity - line.received_quantity - coalesce(discrepancy.quantity, 0)), 0) as quantity
      from warehouse.transfer_lines line
      join warehouse.transfers transfer on transfer.id = line.transfer_id and transfer.organization_id = line.organization_id
      left join warehouse.transfer_line_discrepancies discrepancy on discrepancy.organization_id = line.organization_id and discrepancy.transfer_line_id = line.id
      where line.organization_id = level.organization_id and line.inventory_item_id = level.inventory_item_id
        and transfer.source_location_id = level.location_id
        and transfer.status in ('IN_TRANSIT', 'PARTIALLY_RECEIVED')
    ) outgoing_transfer on true
    left join lateral (
      select coalesce(sum(greatest(allocation.allocated_quantity - coalesce(received.quantity, 0), 0)), 0) as quantity
      from inbound_shipment.purchase_line_allocations allocation
      join inbound_shipment.shipments shipment on shipment.id = allocation.shipment_id
        and shipment.organization_id = allocation.organization_id
      left join lateral (
        select sum(receipt_line.quantity) as quantity
        from receiving.inbound_receipt_lines receipt_line
        where receipt_line.organization_id = allocation.organization_id
          and receipt_line.shipment_allocation_id = allocation.id
      ) received on true
      where allocation.organization_id = level.organization_id and allocation.variant_id = variant.id
        and shipment.receiving_location_id = level.location_id and shipment.status in ('IN_TRANSIT', 'ARRIVED')
        and shipment.receiving_status <> 'RECEIVED'
    ) incoming_supply on true
    left join lateral (
      select count(*) as quantity from inventory.inventory_reservations reservation
      where reservation.organization_id = level.organization_id
        and reservation.inventory_item_id = level.inventory_item_id
        and reservation.location_id = level.location_id
        and reservation.status in ('ACTIVE', 'PARTIALLY_CONSUMED')
    ) active_reservations on true
    where level.organization_id = ${organizationId}
      and ${locationFilter} and ${itemFilter} and ${searchFilter}
      and ${catalogStatusFilter} and ${conditionFilter} and ${availabilityFilter}
  `;
  const countResult = await sql<{
    count: string;
  }>`select count(*)::text as count ${fromAndFilters}`.execute(db);
  const result = await sql<{
    inventory_item_id: string;
    variant_id: string;
    product_id: string;
    sku: string;
    product_title: string;
    option_summary: string | null;
    inventory_status: 'ACTIVE' | 'ARCHIVED';
    variant_status: 'ACTIVE' | 'ARCHIVED';
    unit_code: string;
    location_id: string;
    location_code: string;
    location_name: string;
    on_hand: string;
    sellable: string;
    reserved: string;
    available_to_sell: string;
    unavailable: string;
    damaged: string;
    quarantine: string;
    inspection: string;
    incoming_transfer: string;
    outgoing_transfer: string;
    incoming_supply: string;
    active_reservation_count: string;
    last_movement_at: Date | null;
  }>`
    select level.inventory_item_id, item.variant_id, variant.product_id, variant.sku,
      product.title as product_title, coalesce(nullif(variant.title, ''), (
        select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
        from catalog.variant_option_values link
        join catalog.product_option_values value on value.id=link.option_value_id and value.organization_id=link.organization_id
        join catalog.product_option_axes axis on axis.id=link.option_axis_id and axis.organization_id=link.organization_id
        where link.organization_id=item.organization_id and link.variant_id=variant.id
      )) as option_summary, item.status as inventory_status,
      variant.status as variant_status, item.unit_code, level.location_id, location.code as location_code,
      location.name as location_name, (level.sellable_quantity + level.unavailable_quantity)::text as on_hand,
      level.sellable_quantity::text as sellable, level.reserved_quantity::text as reserved,
      (level.sellable_quantity - level.reserved_quantity)::text as available_to_sell,
      level.unavailable_quantity::text as unavailable, conditions.damaged::text, conditions.quarantine::text,
      conditions.inspection::text,
      coalesce(incoming_transfer.quantity, 0)::text as incoming_transfer,
      coalesce(outgoing_transfer.quantity, 0)::text as outgoing_transfer,
      coalesce(incoming_supply.quantity, 0)::text as incoming_supply,
      coalesce(active_reservations.quantity, 0)::text as active_reservation_count,
      last_movement.occurred_at as last_movement_at
    ${fromAndFilters}
    order by ${sortExpression} ${sortOrder} nulls last, variant.sku, location.name, level.inventory_item_id
    limit ${limit} offset ${offset}
  `.execute(db);
  return {
    items: result.rows.map((row) => ({
      inventoryItemId: row.inventory_item_id,
      variantId: row.variant_id,
      productId: row.product_id,
      sku: row.sku,
      productTitle: row.product_title,
      optionSummary: row.option_summary,
      inventoryStatus: row.inventory_status,
      variantStatus: row.variant_status,
      unitCode: row.unit_code,
      locationId: row.location_id,
      locationCode: row.location_code,
      locationName: row.location_name,
      onHand: subtract(row.on_hand, '0'),
      sellable: subtract(row.sellable, '0'),
      reserved: subtract(row.reserved, '0'),
      availableToSell: subtract(row.available_to_sell, '0'),
      unavailable: subtract(row.unavailable, '0'),
      damaged: subtract(row.damaged, '0'),
      quarantine: subtract(row.quarantine, '0'),
      inspection: subtract(row.inspection, '0'),
      incomingTransfer: subtract(row.incoming_transfer, '0'),
      outgoingTransfer: subtract(row.outgoing_transfer, '0'),
      incomingSupply: subtract(row.incoming_supply, '0'),
      activeReservationCount: Number(row.active_reservation_count),
      lastMovementAt: row.last_movement_at,
    })),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function listInventoryBalances(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    locationId?: string;
    search?: string;
    condition?: InventoryCondition;
    availability?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: readonly (InventoryBalance & {
    variantId: string;
    sku: string;
    productTitle: string;
    locationName: string;
  })[];
  totalCount: number;
}> {
  const offset = ((input.page || 1) - 1) * (input.limit || 25);

  const locationFilter = input.locationId
    ? sql`condition.location_id = ${input.locationId}::uuid`
    : sql`1=1`;
  const conditionFilter = input.condition
    ? sql`condition.condition_code = ${input.condition}`
    : sql`1=1`;
  const searchFilter = input.search
    ? sql`(variant.sku ilike '%' || ${input.search} || '%' or product.title ilike '%' || ${input.search} || '%')`
    : sql`1=1`;

  const availabilityFilter =
    input.availability === 'IN_STOCK'
      ? sql`level.sellable_quantity - level.reserved_quantity > 0`
      : input.availability === 'LOW_STOCK'
        ? sql`level.sellable_quantity - level.reserved_quantity > 0 and level.sellable_quantity - level.reserved_quantity <= 5`
        : input.availability === 'OUT_OF_STOCK'
          ? sql`level.sellable_quantity - level.reserved_quantity <= 0`
          : sql`1=1`;

  const countResult = await sql<{ count: string }>`
    select count(*)::text as count
    from inventory.inventory_level_conditions condition
    join inventory.inventory_levels level on level.organization_id = condition.organization_id and level.inventory_item_id = condition.inventory_item_id and level.location_id = condition.location_id
    join inventory.inventory_items item on item.id = condition.inventory_item_id and item.organization_id = condition.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    where condition.organization_id = ${organizationId}
      and ${locationFilter}
      and ${conditionFilter}
      and ${searchFilter}
      and ${availabilityFilter}
  `.execute(db);

  const result = await sql<{
    inventory_item_id: string;
    location_id: string;
    condition_code: InventoryCondition;
    quantity: string;
    reserved_quantity: string;
    variant_id: string;
    sku: string;
    product_title: string;
    location_name: string;
  }>`
    select condition.inventory_item_id, condition.location_id, condition.condition_code, condition.quantity::text, level.reserved_quantity::text,
      item.variant_id, variant.sku, product.title as product_title, location.name as location_name
    from inventory.inventory_level_conditions condition
    join inventory.inventory_levels level on level.organization_id = condition.organization_id and level.inventory_item_id = condition.inventory_item_id and level.location_id = condition.location_id
    join inventory.inventory_items item on item.id = condition.inventory_item_id and item.organization_id = condition.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    join warehouse.locations location on location.id = condition.location_id and location.organization_id = condition.organization_id
    where condition.organization_id = ${organizationId}
      and ${locationFilter}
      and ${conditionFilter}
      and ${searchFilter}
      and ${availabilityFilter}
    order by product.title, variant.sku, location.name, condition.condition_code
    limit ${input.limit || 25} offset ${offset}
  `.execute(db);

  return {
    items: result.rows.map((row) => ({
      ...rowBalance(row),
      variantId: row.variant_id,
      sku: row.sku,
      productTitle: row.product_title,
      locationName: row.location_name,
    })),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function listInventoryHistory(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    inventoryItemId?: string;
    locationId?: string;
    transactionType?: string;
    condition?: InventoryCondition;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: readonly {
    id: string;
    transactionId: string;
    inventoryItemId: string;
    variantId: string;
    productId: string;
    occurredAt: Date;
    transactionType: string;
    transactionNumber: string | null;
    sku: string;
    productTitle: string;
    optionSummary: string | null;
    locationId: string;
    locationName: string;
    condition: InventoryCondition;
    quantityDelta: string;
    reasonCode: string | null;
    reasonText: string | null;
    referenceType: string | null;
    referenceId: string | null;
    referenceNumber: string | null;
    actorId: string | null;
    actorDisplayName: string | null;
    runningBalance: string;
  }[];
  totalCount: number;
}> {
  const offset = ((input.page || 1) - 1) * (input.limit || 25);

  const itemFilter = input.inventoryItemId
    ? sql`line.inventory_item_id = ${input.inventoryItemId}::uuid`
    : sql`1=1`;
  const locationFilter = input.locationId
    ? sql`line.location_id = ${input.locationId}::uuid`
    : sql`1=1`;
  const typeFilter = input.transactionType
    ? sql`transaction.transaction_type = ${input.transactionType}`
    : sql`1=1`;
  const conditionFilter = input.condition
    ? sql`line.condition_code = ${input.condition}`
    : sql`1=1`;
  const searchFilter = input.search?.trim()
    ? sql`(variant.sku ilike '%' || ${input.search.trim()} || '%' or product.title ilike '%' || ${input.search.trim()} || '%' or location.name ilike '%' || ${input.search.trim()} || '%' or coalesce(transaction.reason_code, '') ilike '%' || ${input.search.trim()} || '%' or coalesce(transaction.reason_text, '') ilike '%' || ${input.search.trim()} || '%' or coalesce(transaction.transaction_number, '') ilike '%' || ${input.search.trim()} || '%' or coalesce(transaction.reference_id::text, '') ilike '%' || ${input.search.trim()} || '%' or exists (select 1 from warehouse.transfers reference where transaction.reference_type = 'warehouse.transfer' and reference.organization_id=line.organization_id and reference.id=transaction.reference_id and reference.transfer_number ilike '%' || ${input.search.trim()} || '%') or exists (select 1 from inventory.stocktake_sessions reference where transaction.reference_type = 'inventory.stocktake' and reference.organization_id=line.organization_id and reference.id=transaction.reference_id and reference.stocktake_number ilike '%' || ${input.search.trim()} || '%') or exists (select 1 from receiving.inbound_receipts reference where transaction.reference_type = 'receiving.inbound_receipt' and reference.organization_id=line.organization_id and reference.id=transaction.reference_id and reference.receipt_number ilike '%' || ${input.search.trim()} || '%') or exists (select 1 from fulfillment.fulfillments reference where transaction.reference_type = 'fulfillment.fulfillment' and reference.organization_id=line.organization_id and reference.id=transaction.reference_id and reference.fulfillment_number ilike '%' || ${input.search.trim()} || '%') or exists (select 1 from returns.return_receipts reference where transaction.reference_type = 'returns.return_receipt' and reference.organization_id=line.organization_id and reference.id=transaction.reference_id and reference.receipt_number ilike '%' || ${input.search.trim()} || '%'))`
    : sql`1=1`;
  const dateFromFilter = input.dateFrom
    ? sql`transaction.occurred_at >= ${input.dateFrom}::date`
    : sql`1=1`;
  const dateToFilter = input.dateTo
    ? sql`transaction.occurred_at < (${input.dateTo}::date + interval '1 day')`
    : sql`1=1`;
  const sortOrder = sql.raw(input.sortOrder === 'ASC' ? 'asc' : 'desc');

  const countResult = await sql<{ count: string }>`
    select count(*)::text as count
    from inventory.inventory_movement_lines line
    join inventory.inventory_transactions transaction on transaction.id = line.inventory_transaction_id
      and transaction.organization_id = line.organization_id
    join inventory.inventory_items item on item.id = line.inventory_item_id and item.organization_id = line.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    join warehouse.locations location on location.id = line.location_id and location.organization_id = line.organization_id
    where line.organization_id = ${organizationId}
      and ${itemFilter}
      and ${locationFilter}
      and ${typeFilter}
      and ${conditionFilter}
      and ${searchFilter}
      and ${dateFromFilter}
      and ${dateToFilter}
  `.execute(db);

  const result = await sql<{
    id: string;
    inventory_transaction_id: string;
    inventory_item_id: string;
    variant_id: string;
    product_id: string;
    occurred_at: Date;
    transaction_type: string;
    transaction_number: string | null;
    sku: string;
    product_title: string;
    option_summary: string | null;
    location_id: string;
    location_name: string;
    condition_code: InventoryCondition;
    quantity_delta: string;
    reason_code: string | null;
    reason_text: string | null;
    reference_type: string | null;
    reference_id: string | null;
    reference_number: string | null;
    created_by_actor_id: string | null;
    actor_display_name: string | null;
    running_balance: string;
  }>`
    select line.id::text, line.inventory_transaction_id, line.inventory_item_id, item.variant_id, variant.product_id, transaction.occurred_at,
      transaction.transaction_type, transaction.transaction_number, variant.sku, product.title as product_title,
      coalesce(nullif(variant.title, ''), (
        select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
        from catalog.variant_option_values link
        join catalog.product_option_values value on value.id=link.option_value_id and value.organization_id=link.organization_id
        join catalog.product_option_axes axis on axis.id=link.option_axis_id and axis.organization_id=link.organization_id
        where link.organization_id=item.organization_id and link.variant_id=variant.id
      )) as option_summary, line.location_id, location.name as location_name, line.condition_code,
      line.quantity_delta::text, transaction.reason_code, transaction.reason_text, transaction.reference_type,
      transaction.reference_id::text, transaction.created_by_actor_id,
      coalesce(membership.display_name, actor.email) as actor_display_name,
      (select coalesce(sum(prior.quantity_delta), 0)::text
        from inventory.inventory_movement_lines prior
        join inventory.inventory_transactions prior_transaction on prior_transaction.id = prior.inventory_transaction_id
          and prior_transaction.organization_id = prior.organization_id
        where prior.organization_id = line.organization_id and prior.inventory_item_id = line.inventory_item_id
          and prior.location_id = line.location_id and prior.condition_code = line.condition_code
          and (prior_transaction.occurred_at, prior.id) <= (transaction.occurred_at, line.id)) as running_balance,
      case transaction.reference_type
        when 'warehouse.transfer' then (select transfer_number from warehouse.transfers where organization_id=line.organization_id and id=transaction.reference_id)
        when 'inventory.stocktake' then (select stocktake_number from inventory.stocktake_sessions where organization_id=line.organization_id and id=transaction.reference_id)
        when 'receiving.inbound_receipt' then (select receipt_number from receiving.inbound_receipts where organization_id=line.organization_id and id=transaction.reference_id)
        when 'fulfillment.fulfillment' then (select fulfillment_number from fulfillment.fulfillments where organization_id=line.organization_id and id=transaction.reference_id)
        when 'returns.return_receipt' then (select receipt_number from returns.return_receipts where organization_id=line.organization_id and id=transaction.reference_id)
        else null
      end as reference_number
    from inventory.inventory_movement_lines line
    join inventory.inventory_transactions transaction on transaction.id = line.inventory_transaction_id and transaction.organization_id = line.organization_id
    join inventory.inventory_items item on item.id = line.inventory_item_id and item.organization_id = line.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    join warehouse.locations location on location.id = line.location_id and location.organization_id = line.organization_id
    left join iam.users actor on actor.id = transaction.created_by_actor_id
    left join iam.organization_memberships membership on membership.organization_id = line.organization_id
      and membership.user_id = transaction.created_by_actor_id
    where line.organization_id = ${organizationId}
      and ${itemFilter}
      and ${locationFilter}
      and ${typeFilter}
      and ${conditionFilter}
      and ${searchFilter}
      and ${dateFromFilter}
      and ${dateToFilter}
    order by transaction.occurred_at ${sortOrder}, line.id ${sortOrder}
    limit ${input.limit || 25} offset ${offset}
  `.execute(db);

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      transactionId: row.inventory_transaction_id,
      inventoryItemId: row.inventory_item_id,
      variantId: row.variant_id,
      productId: row.product_id,
      occurredAt: row.occurred_at,
      transactionType: row.transaction_type,
      transactionNumber: row.transaction_number,
      sku: row.sku,
      productTitle: row.product_title,
      optionSummary: row.option_summary,
      locationId: row.location_id,
      locationName: row.location_name,
      condition: row.condition_code,
      quantityDelta: row.quantity_delta,
      reasonCode: row.reason_code,
      reasonText: row.reason_text,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      referenceNumber: row.reference_number,
      actorId: row.created_by_actor_id,
      actorDisplayName: row.actor_display_name,
      runningBalance: subtract(row.running_balance, '0'),
    })),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function reconcileInventoryItem(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<{ matches: boolean; ledgerQuantity: string; balanceQuantity: string }> {
  const result = await sql<{ ledger_quantity: string; balance_quantity: string }>`
    select coalesce((select sum(quantity_delta) from inventory.inventory_movement_lines where organization_id = ${organizationId} and inventory_item_id = ${inventoryItemId} and location_id = ${locationId}), 0)::text as ledger_quantity,
      coalesce((select sum(quantity) from inventory.inventory_level_conditions where organization_id = ${organizationId} and inventory_item_id = ${inventoryItemId} and location_id = ${locationId}), 0)::text as balance_quantity
  `.execute(db);
  const row = result.rows[0] ?? { ledger_quantity: '0', balance_quantity: '0' };
  const ledgerQuantity = subtract(row.ledger_quantity, '0');
  const balanceQuantity = subtract(row.balance_quantity, '0');
  return { matches: ledgerQuantity === balanceQuantity, ledgerQuantity, balanceQuantity };
}

export interface InventoryIntegrityIssue {
  readonly code: string;
  readonly summary: string;
  readonly entityId?: string;
}

/** Read-only cross-checks for Inventory's ledger, projections, reservations, and source workflows. */
export async function verifyInventoryIntegrity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly InventoryIntegrityIssue[]> {
  const [rollups, ledger, reservations, terminalOwners, allocationHeaders, transfers, stocktakes] =
    await Promise.all([
      sql<{
        id: string;
      }>`select level.id from inventory.inventory_levels level left join lateral (select coalesce(sum(condition.quantity) filter (where condition.condition_code = 'SELLABLE'), 0) as sellable, coalesce(sum(condition.quantity) filter (where condition.condition_code <> 'SELLABLE'), 0) as unavailable from inventory.inventory_level_conditions condition where condition.organization_id = level.organization_id and condition.inventory_item_id = level.inventory_item_id and condition.location_id = level.location_id) actual on true where level.organization_id = ${organizationId} and (level.sellable_quantity <> actual.sellable or level.unavailable_quantity <> actual.unavailable)`.execute(
        db,
      ),
      sql<{
        id: string;
      }>`with movement as (select inventory_item_id, location_id, condition_code, sum(quantity_delta) as quantity from inventory.inventory_movement_lines where organization_id = ${organizationId} group by inventory_item_id, location_id, condition_code) select condition.id from inventory.inventory_level_conditions condition full join movement on movement.inventory_item_id = condition.inventory_item_id and movement.location_id = condition.location_id and movement.condition_code = condition.condition_code where condition.organization_id = ${organizationId} and coalesce(condition.quantity, 0) <> coalesce(movement.quantity, 0)`.execute(
        db,
      ),
      sql<{
        id: string;
      }>`select level.id from inventory.inventory_levels level left join lateral (select coalesce(sum(case when exists (select 1 from inventory.inventory_reservation_allocations allocation where allocation.reservation_id = reservation.id) then (select sum(allocation.reserved_quantity - allocation.consumed_quantity - allocation.released_quantity) from inventory.inventory_reservation_allocations allocation where allocation.reservation_id = reservation.id) else reservation.quantity end), 0) as quantity from inventory.inventory_reservations reservation where reservation.organization_id = level.organization_id and reservation.inventory_item_id = level.inventory_item_id and reservation.location_id = level.location_id and reservation.status in ('ACTIVE', 'PARTIALLY_CONSUMED')) active on true where level.organization_id = ${organizationId} and level.reserved_quantity <> active.quantity`.execute(
        db,
      ),
      sql<{ id: string }>`
      select reservation.id
      from inventory.inventory_reservations reservation
      join orders.order_inventory_reservations bridge
        on bridge.organization_id = reservation.organization_id and bridge.reservation_id = reservation.id
      join orders.orders order_row
        on order_row.organization_id = bridge.organization_id and order_row.id = bridge.order_id
      where reservation.organization_id = ${organizationId}
        and reservation.status in ('ACTIVE', 'PARTIALLY_CONSUMED')
        and order_row.order_status in ('COMPLETED', 'CANCELLED')
    `.execute(db),
      sql<{ id: string }>`
      select reservation.id
      from inventory.inventory_reservations reservation
      join inventory.inventory_reservation_allocations allocation
        on allocation.organization_id = reservation.organization_id
        and allocation.reservation_id = reservation.id
      where reservation.organization_id = ${organizationId}
        and (
          allocation.inventory_item_id <> reservation.inventory_item_id
          or allocation.location_id <> reservation.location_id
          or allocation.reserved_quantity <> reservation.quantity
        )
    `.execute(db),
      sql<{
        id: string;
      }>`select line.id from warehouse.transfer_lines line left join warehouse.transfer_line_discrepancies discrepancy on discrepancy.organization_id = line.organization_id and discrepancy.transfer_line_id = line.id join warehouse.transfers transfer on transfer.id = line.transfer_id and transfer.organization_id = line.organization_id where line.organization_id = ${organizationId} and (line.received_quantity + coalesce(discrepancy.quantity, 0) > line.dispatched_quantity or line.dispatched_quantity + line.cancelled_quantity > line.requested_quantity or ((line.dispatched_quantity > line.received_quantity + coalesce(discrepancy.quantity, 0)) and transfer.status not in ('IN_TRANSIT', 'PARTIALLY_RECEIVED')) or ((line.dispatched_quantity = line.received_quantity + coalesce(discrepancy.quantity, 0)) and transfer.status not in ('RECEIVED', 'CLOSED_WITH_DISCREPANCY')) or (transfer.status = 'RECEIVED' and coalesce(discrepancy.quantity, 0) > 0))`.execute(
        db,
      ),
      sql<{
        id: string;
      }>`select session.id from inventory.stocktake_sessions session where session.organization_id = ${organizationId} and ((session.status = 'POSTED' and session.posted_inventory_transaction_id is null) or (session.status <> 'POSTED' and session.posted_inventory_transaction_id is not null))`.execute(
        db,
      ),
    ]);
  return [
    ...rollups.rows.map((row) => ({
      code: 'LEVEL_CONDITION_ROLLUP_MISMATCH',
      summary: 'Inventory Level totals differ from their condition balances.',
      entityId: row.id,
    })),
    ...ledger.rows.map((row) => ({
      code: 'LEDGER_CONDITION_MISMATCH',
      summary: 'Condition balance differs from the immutable movement ledger.',
      entityId: row.id,
    })),
    ...reservations.rows.map((row) => ({
      code: 'RESERVATION_ROLLUP_MISMATCH',
      summary: 'Reserved quantity differs from active Reservation ownership.',
      entityId: row.id,
    })),
    ...terminalOwners.rows.map((row) => ({
      code: 'RESERVATION_TERMINAL_ORDER_OWNER',
      summary: 'An active Reservation belongs to a terminal Order.',
      entityId: row.id,
    })),
    ...allocationHeaders.rows.map((row) => ({
      code: 'RESERVATION_ALLOCATION_HEADER_MISMATCH',
      summary: 'Reservation allocation identity or quantity differs from its header.',
      entityId: row.id,
    })),
    ...transfers.rows.map((row) => ({
      code: 'TRANSFER_TRANSIT_MISMATCH',
      summary: 'Transfer line quantities do not agree with its lifecycle state.',
      entityId: row.id,
    })),
    ...stocktakes.rows.map((row) => ({
      code: 'STOCKTAKE_POSTING_MISMATCH',
      summary: 'Stocktake lifecycle state disagrees with its posted Inventory Transaction.',
      entityId: row.id,
    })),
  ];
}

export async function createWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    sourceLocationId: string;
    destinationLocationId: string;
    lines: readonly { variantId: string; quantity: string }[];
    notes?: string | null;
    idempotencyKey: string;
  },
): Promise<{ transferId: string; version: number }> {
  validateWarehouseTransferDraft(input);
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'warehouse.transfer.create',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as { transferId: string; version: number };
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.sourceLocationId,
      'TRANSFER_SEND',
    );
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.destinationLocationId,
      'TRANSFER_RECEIVE',
    );
    const created = await sql<{
      id: string;
    }>`insert into warehouse.transfers (organization_id, transfer_number, source_location_id, destination_location_id, notes, created_by_actor_id) values (${input.organizationId}, concat('TR-', replace(uuidv7()::text, '-', '')), ${input.sourceLocationId}, ${input.destinationLocationId}, ${input.notes?.trim() || null}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const transferId = created.rows[0]?.id;
    if (!transferId) throw new Error('Transfer creation did not return an id.');
    await replaceWarehouseTransferDraftLines(transaction, {
      organizationId: input.organizationId,
      transferId,
      lines: input.lines,
    });
    const response = { transferId, version: 1 };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'warehouse.transfer',
      transferId,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.created',
      eventType: 'warehouse.transfer.created',
      targetType: 'warehouse.transfer',
      targetId: transferId,
      metadata: {
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        lineCount: input.lines.length,
      },
    });
    return response;
  });
}

function validateWarehouseTransferDraft(input: {
  sourceLocationId: string;
  destinationLocationId: string;
  lines: readonly { variantId: string; quantity: string }[];
}): void {
  if (input.sourceLocationId === input.destinationLocationId)
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Transfer source and destination must differ.',
    );
  if (input.lines.length === 0)
    throw new InventoryDomainError('VALIDATION_FAILED', 'Transfer needs at least one line.');
  const variants = new Set<string>();
  for (const line of input.lines) {
    if (!line.variantId)
      throw new InventoryDomainError('VALIDATION_FAILED', 'Transfer line needs a Variant.');
    if (variants.has(line.variantId))
      throw new InventoryDomainError(
        'VALIDATION_FAILED',
        'A Variant can appear only once in a Transfer draft.',
      );
    variants.add(line.variantId);
    assertQuantity(line.quantity);
  }
}

async function replaceWarehouseTransferDraftLines(
  transaction: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    transferId: string;
    lines: readonly { variantId: string; quantity: string }[];
  },
): Promise<void> {
  await sql`delete from warehouse.transfer_lines where organization_id = ${input.organizationId} and transfer_id = ${input.transferId}`.execute(
    transaction,
  );
  for (const line of input.lines) {
    const itemId = await ensureItem(transaction, input.organizationId, line.variantId);
    await assertInventoryItemQuantityPolicy(
      transaction,
      input.organizationId,
      itemId,
      line.quantity,
    );
    await sql`insert into warehouse.transfer_lines (organization_id, transfer_id, inventory_item_id, requested_quantity) values (${input.organizationId}, ${input.transferId}, ${itemId}, ${line.quantity}::numeric)`.execute(
      transaction,
    );
  }
}

/** A Draft is an editable commercial instruction. Once dispatched, correction requires new facts. */
export async function updateWarehouseTransferDraft(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    transferId: string;
    expectedVersion: number;
    sourceLocationId: string;
    destinationLocationId: string;
    lines: readonly { variantId: string; quantity: string }[];
    notes?: string | null;
    idempotencyKey: string;
  },
): Promise<{ transferId: string; version: number }> {
  validateWarehouseTransferDraft(input);
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'warehouse.transfer.update_draft',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay) return started.replay as { transferId: string; version: number };
    const current = await sql<{ id: string; status: string; version: string }>`
      select id, status, version::text
      from warehouse.transfers
      where id = ${input.transferId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const transfer = current.rows[0];
    if (!transfer) throw new InventoryDomainError('NOT_FOUND', 'Transfer was not found.');
    if (transfer.status !== 'DRAFT' || Number(transfer.version) !== input.expectedVersion)
      throw new InventoryDomainError(
        'STALE_VERSION',
        'Transfer is no longer a current Draft; reload before saving.',
      );
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.sourceLocationId,
      'TRANSFER_SEND',
    );
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.destinationLocationId,
      'TRANSFER_RECEIVE',
    );
    await replaceWarehouseTransferDraftLines(transaction, {
      organizationId: input.organizationId,
      transferId: transfer.id,
      lines: input.lines,
    });
    const updated = await sql<{ version: string }>`
      update warehouse.transfers
      set source_location_id = ${input.sourceLocationId},
        destination_location_id = ${input.destinationLocationId},
        notes = ${input.notes?.trim() || null},
        version = version + 1,
        updated_at = now()
      where id = ${transfer.id} and organization_id = ${input.organizationId}
      returning version::text
    `.execute(transaction);
    const response = { transferId: transfer.id, version: Number(updated.rows[0]!.version) };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'warehouse.transfer',
      transfer.id,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.draft_updated',
      eventType: 'warehouse.transfer.draft_updated',
      targetType: 'warehouse.transfer',
      targetId: transfer.id,
      metadata: {
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        lineCount: input.lines.length,
      },
    });
    return response;
  });
}

export async function approveWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; transferId: string; expectedVersion: number },
): Promise<{ transferId: string; version: number }> {
  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      version: string;
    }>`update warehouse.transfers set status = 'READY', approved_at = now(), version = version + 1, updated_at = now() where id = ${input.transferId} and organization_id = ${input.organizationId} and status = 'DRAFT' and version = ${input.expectedVersion} returning id, version::text`.execute(
      transaction,
    );
    const row = updated.rows[0];
    if (!row)
      throw new InventoryDomainError('STALE_VERSION', 'Transfer is no longer a current Draft.');
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.ready',
      eventType: 'warehouse.transfer.ready',
      targetType: 'warehouse.transfer',
      targetId: row.id,
    });
    return { transferId: row.id, version: Number(row.version) };
  });
}

/** Draft cancellation is deliberately the only reversible transfer state: dispatched stock never teleports back. */
export async function cancelWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; transferId: string; expectedVersion: number },
): Promise<{ transferId: string; version: number }> {
  return db.transaction().execute(async (transaction) => {
    const updated = await sql<{
      id: string;
      version: string;
    }>`update warehouse.transfers set status = 'CANCELLED', version = version + 1, updated_at = now() where id = ${input.transferId} and organization_id = ${input.organizationId} and status = 'DRAFT' and version = ${input.expectedVersion} returning id, version::text`.execute(
      transaction,
    );
    const row = updated.rows[0];
    if (!row)
      throw new InventoryDomainError(
        'STALE_VERSION',
        'Only a current Draft Transfer can be cancelled.',
      );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.cancelled',
      eventType: 'warehouse.transfer.cancelled',
      targetType: 'warehouse.transfer',
      targetId: row.id,
    });
    return { transferId: row.id, version: Number(row.version) };
  });
}

export async function dispatchWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; transferId: string; idempotencyKey: string },
): Promise<{ transferId: string; inventoryTransactionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'warehouse.transfer.dispatch',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return started.replay as { transferId: string; inventoryTransactionId: string };
    const transfer = await sql<{
      id: string;
      source_location_id: string;
      status: string;
    }>`select id, source_location_id, status from warehouse.transfers where id = ${input.transferId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const header = transfer.rows[0];
    if (!header) throw new InventoryDomainError('NOT_FOUND', 'Transfer was not found.');
    if (header.status !== 'READY')
      throw new InventoryDomainError('CONFLICT', 'Only a ready Transfer can be dispatched.');
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      header.source_location_id,
      'TRANSFER_SEND',
    );
    const lines = await sql<{
      id: string;
      inventory_item_id: string;
      quantity: string;
    }>`select id, inventory_item_id, (requested_quantity - cancelled_quantity - dispatched_quantity)::text as quantity from warehouse.transfer_lines where transfer_id = ${header.id} and organization_id = ${input.organizationId} order by inventory_item_id for update`.execute(
      transaction,
    );
    if (lines.rows.some((line) => line.quantity === '0'))
      throw new InventoryDomainError(
        'CONFLICT',
        'Transfer has no remaining dispatchable quantity.',
      );
    const inventoryTransactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: 'TRANSFER_DISPATCH',
      reasonCode: 'TRANSFER_DISPATCH',
      referenceType: 'warehouse.transfer',
      referenceId: header.id,
      idempotencyRecordId: started.recordId,
      lines: lines.rows.map((line) => ({
        inventoryItemId: line.inventory_item_id,
        locationId: header.source_location_id,
        condition: 'SELLABLE' as const,
        quantityDelta: `-${line.quantity}`,
      })),
    });
    await dispatchTransferCostPositionsInTransaction(transaction, {
      organizationId: input.organizationId,
      sourceLocationId: header.source_location_id,
      inventoryTransactionId,
      lines: lines.rows.map((line) => ({
        transferLineId: line.id,
        inventoryItemId: line.inventory_item_id,
        quantity: line.quantity,
      })),
    });
    for (const line of lines.rows)
      await sql`update warehouse.transfer_lines set dispatched_quantity = dispatched_quantity + ${line.quantity}::numeric where id = ${line.id}`.execute(
        transaction,
      );
    await sql`update warehouse.transfers set status = 'IN_TRANSIT', dispatched_at = now(), version = version + 1, updated_at = now() where id = ${header.id}`.execute(
      transaction,
    );
    const response = { transferId: header.id, inventoryTransactionId };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'warehouse.transfer',
      header.id,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.dispatched',
      eventType: 'warehouse.transfer.dispatched',
      targetType: 'warehouse.transfer',
      targetId: header.id,
    });
    return response;
  });
}

export async function receiveWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    transferId: string;
    lines: readonly {
      transferLineId: string;
      sellableQuantity: string;
      damagedQuantity?: string;
      quarantineQuantity?: string;
      inspectionQuantity?: string;
    }[];
    idempotencyKey: string;
  },
): Promise<{ transferId: string; inventoryTransactionId: string; status: string }> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'warehouse.transfer.receive',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return started.replay as {
        transferId: string;
        inventoryTransactionId: string;
        status: string;
      };
    const transfer = await sql<{
      id: string;
      destination_location_id: string;
      status: string;
    }>`select id, destination_location_id, status from warehouse.transfers where id = ${input.transferId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const header = transfer.rows[0];
    if (!header) throw new InventoryDomainError('NOT_FOUND', 'Transfer was not found.');
    if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(header.status))
      throw new InventoryDomainError('CONFLICT', 'Transfer is not awaiting receipt.');
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      header.destination_location_id,
      'TRANSFER_RECEIVE',
    );
    const movementLines: {
      inventoryItemId: string;
      locationId: string;
      condition: InventoryCondition;
      quantityDelta: string;
    }[] = [];
    const costReceiptLines: {
      transferLineId: string;
      quantities: { condition: InventoryCondition; quantity: string }[];
    }[] = [];
    for (const receipt of input.lines) {
      const line = await sql<{
        id: string;
        inventory_item_id: string;
        remaining: string;
      }>`select line.id, line.inventory_item_id, (line.dispatched_quantity - line.received_quantity - coalesce((select discrepancy.quantity from warehouse.transfer_line_discrepancies discrepancy where discrepancy.transfer_line_id = line.id), 0))::text as remaining from warehouse.transfer_lines line where line.id = ${receipt.transferLineId} and line.transfer_id = ${header.id} and line.organization_id = ${input.organizationId} for update`.execute(
        transaction,
      );
      const source = line.rows[0];
      if (!source) throw new InventoryDomainError('NOT_FOUND', 'Transfer line was not found.');
      const quantities: [InventoryCondition, string][] = [
        ['SELLABLE', receipt.sellableQuantity],
        ['DAMAGED', receipt.damagedQuantity ?? '0'],
        ['QUARANTINE', receipt.quarantineQuantity ?? '0'],
        ['INSPECTION', receipt.inspectionQuantity ?? '0'],
      ];
      const received = quantities.reduce((total, [, value]) => subtract(total, `-${value}`), '0');
      if (received === '0' || subtract(source.remaining, received).startsWith('-'))
        throw new InventoryDomainError(
          'VALIDATION_FAILED',
          'Receipt quantity exceeds inventory in transit.',
        );
      for (const [condition, quantity] of quantities)
        if (quantity !== '0') {
          assertQuantity(quantity);
          movementLines.push({
            inventoryItemId: source.inventory_item_id,
            locationId: header.destination_location_id,
            condition,
            quantityDelta: quantity,
          });
        }
      costReceiptLines.push({
        transferLineId: source.id,
        quantities: quantities
          .filter(([, quantity]) => quantity !== '0')
          .map(([condition, quantity]) => ({ condition, quantity })),
      });
      await sql`update warehouse.transfer_lines set received_quantity = received_quantity + ${received}::numeric where id = ${source.id}`.execute(
        transaction,
      );
    }
    if (movementLines.length === 0)
      throw new InventoryDomainError(
        'VALIDATION_FAILED',
        'Receipt needs at least one positive quantity.',
      );
    const inventoryTransactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: 'TRANSFER_RECEIPT',
      reasonCode: 'TRANSFER_RECEIPT',
      referenceType: 'warehouse.transfer',
      referenceId: header.id,
      idempotencyRecordId: started.recordId,
      lines: movementLines,
    });
    await receiveTransferCostPositionsInTransaction(transaction, {
      organizationId: input.organizationId,
      destinationLocationId: header.destination_location_id,
      inventoryTransactionId,
      lines: costReceiptLines,
    });
    const remaining = await sql<{
      count: string;
    }>`select count(*)::text as count from warehouse.transfer_lines line where line.transfer_id = ${header.id} and line.dispatched_quantity > line.received_quantity + coalesce((select discrepancy.quantity from warehouse.transfer_line_discrepancies discrepancy where discrepancy.transfer_line_id = line.id), 0)`.execute(
      transaction,
    );
    const status = Number(remaining.rows[0]?.count ?? 0) === 0 ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await sql`update warehouse.transfers set status = ${status}, completed_at = case when ${status} = 'RECEIVED' then now() else completed_at end, version = version + 1, updated_at = now() where id = ${header.id}`.execute(
      transaction,
    );
    const response = { transferId: header.id, inventoryTransactionId, status };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'warehouse.transfer',
      header.id,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action:
        status === 'RECEIVED'
          ? 'warehouse.transfer.received'
          : 'warehouse.transfer.partially_received',
      eventType:
        status === 'RECEIVED'
          ? 'warehouse.transfer.received'
          : 'warehouse.transfer.partially_received',
      targetType: 'warehouse.transfer',
      targetId: header.id,
    });
    return response;
  });
}

export async function closeWarehouseTransferDiscrepancy(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    transferId: string;
    lines: readonly {
      transferLineId: string;
      dispositionCode: 'MISSING' | 'LOST';
      quantity: string;
      reasonCode: string;
      notes?: string;
    }[];
    idempotencyKey: string;
  },
): Promise<{ transferId: string; inventoryTransactionId: string; status: string }> {
  if (!input.lines.length)
    throw new InventoryDomainError('VALIDATION_FAILED', 'Select at least one remaining line.');
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'warehouse.transfer.close_discrepancy',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return started.replay as {
        transferId: string;
        inventoryTransactionId: string;
        status: string;
      };
    const transfer = await sql<{
      id: string;
      source_location_id: string;
      status: string;
    }>`select id, source_location_id, status from warehouse.transfers where id=${input.transferId} and organization_id=${input.organizationId} for update`.execute(
      transaction,
    );
    const header = transfer.rows[0];
    if (!header) throw new InventoryDomainError('NOT_FOUND', 'Transfer was not found.');
    if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(header.status))
      throw new InventoryDomainError('CONFLICT', 'Transfer is not awaiting reconciliation.');
    const resolved: { transferLineId: string; quantity: string }[] = [];
    for (const entry of input.lines) {
      assertQuantity(entry.quantity, 'Discrepancy quantity');
      if (!entry.reasonCode.trim())
        throw new InventoryDomainError('VALIDATION_FAILED', 'A discrepancy reason is required.');
      const line = await sql<{
        id: string;
        remaining: string;
      }>`select line.id, (line.dispatched_quantity - line.received_quantity - coalesce((select discrepancy.quantity from warehouse.transfer_line_discrepancies discrepancy where discrepancy.transfer_line_id=line.id), 0))::text as remaining from warehouse.transfer_lines line where line.id=${entry.transferLineId} and line.transfer_id=${header.id} and line.organization_id=${input.organizationId} for update`.execute(
        transaction,
      );
      if (!line.rows[0] || subtract(line.rows[0].remaining, entry.quantity) !== '0')
        throw new InventoryDomainError(
          'VALIDATION_FAILED',
          'A discrepancy must resolve all remaining quantity for its transfer line.',
        );
      await sql`insert into warehouse.transfer_line_discrepancies (organization_id, transfer_line_id, disposition_code, quantity, reason_code, notes, recorded_by_actor_id) values (${input.organizationId}, ${entry.transferLineId}, ${entry.dispositionCode}, ${entry.quantity}::numeric, ${entry.reasonCode.trim()}, ${entry.notes?.trim() || null}, ${input.actorId})`.execute(
        transaction,
      );
      resolved.push({ transferLineId: entry.transferLineId, quantity: entry.quantity });
    }
    const inventoryTransactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: 'TRANSFER_WRITE_OFF',
      reasonCode: 'TRANSFER_DISCREPANCY',
      referenceType: 'warehouse.transfer',
      referenceId: header.id,
      idempotencyRecordId: started.recordId,
      lines: [],
    });
    await writeOffTransferCostPositionsInTransaction(transaction, {
      organizationId: input.organizationId,
      sourceLocationId: header.source_location_id,
      inventoryTransactionId,
      lines: resolved,
    });
    const open = await sql<{
      count: string;
    }>`select count(*)::text as count from warehouse.transfer_lines line where line.transfer_id=${header.id} and line.dispatched_quantity > line.received_quantity + coalesce((select discrepancy.quantity from warehouse.transfer_line_discrepancies discrepancy where discrepancy.transfer_line_id=line.id), 0)`.execute(
      transaction,
    );
    const status =
      Number(open.rows[0]?.count ?? 0) === 0 ? 'CLOSED_WITH_DISCREPANCY' : 'PARTIALLY_RECEIVED';
    await sql`update warehouse.transfers set status=${status}, completed_at=case when ${status}='CLOSED_WITH_DISCREPANCY' then now() else completed_at end, version=version+1, updated_at=now() where id=${header.id}`.execute(
      transaction,
    );
    const response = { transferId: header.id, inventoryTransactionId, status };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'warehouse.transfer',
      header.id,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'warehouse.transfer.discrepancy_closed',
      eventType: 'warehouse.transfer.discrepancy_closed',
      targetType: 'warehouse.transfer',
      targetId: header.id,
      metadata: { lineCount: resolved.length },
    });
    return response;
  });
}

export async function startStocktake(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; locationId: string },
): Promise<{ stocktakeId: string; version: number }> {
  return db.transaction().execute(async (transaction) => {
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.locationId,
      'STOCK_HOLDING',
    );
    const created = await sql<{
      id: string;
    }>`insert into inventory.stocktake_sessions (organization_id, stocktake_number, location_id, status, created_by_actor_id) values (${input.organizationId}, concat('ST-', replace(uuidv7()::text, '-', '')), ${input.locationId}, 'COUNTING', ${input.actorId}) returning id`.execute(
      transaction,
    );
    const stocktakeId = created.rows[0]?.id;
    if (!stocktakeId) throw new Error('Stocktake creation did not return an id.');
    await sql`insert into inventory.stocktake_lines (organization_id, stocktake_session_id, inventory_item_id, expected_quantity_at_snapshot)
      select ${input.organizationId}, ${stocktakeId}, level.inventory_item_id, (level.sellable_quantity + level.unavailable_quantity)
      from inventory.inventory_levels level where level.organization_id = ${input.organizationId} and level.location_id = ${input.locationId}`.execute(
      transaction,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inventory.stocktake.started',
      eventType: 'inventory.stocktake.started',
      targetType: 'inventory.stocktake',
      targetId: stocktakeId,
      metadata: { locationId: input.locationId },
    });
    return { stocktakeId, version: 1 };
  });
}

export async function recordStocktakeCount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    stocktakeId: string;
    inventoryItemId: string;
    countedQuantity: string;
    expectedVersion: number;
  },
): Promise<void> {
  if (!/^\d+(?:\.\d{1,6})?$/.test(input.countedQuantity))
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Counted quantity must be a non-negative decimal with at most six places.',
    );
  await db.transaction().execute(async (transaction) => {
    const session = await sql<{
      location_id: string;
      status: string;
      version: string;
    }>`select location_id, status, version::text from inventory.stocktake_sessions where id = ${input.stocktakeId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const header = session.rows[0];
    if (!header) throw new InventoryDomainError('NOT_FOUND', 'Stocktake was not found.');
    if (header.status !== 'COUNTING' || Number(header.version) !== input.expectedVersion)
      throw new InventoryDomainError(
        'STALE_VERSION',
        'Stocktake is no longer current for counting.',
      );
    const updated = await sql<{
      id: string;
    }>`update inventory.stocktake_lines set counted_quantity = ${input.countedQuantity}::numeric, status = 'COUNTED', version = version + 1 where stocktake_session_id = ${input.stocktakeId} and organization_id = ${input.organizationId} and inventory_item_id = ${input.inventoryItemId} returning id`.execute(
      transaction,
    );
    if (!updated.rows[0])
      throw new InventoryDomainError('NOT_FOUND', 'Stocktake line was not found.');
    await sql`update inventory.stocktake_sessions set version = version + 1, updated_at = now() where id = ${input.stocktakeId}`.execute(
      transaction,
    );
  });
}

export async function postStocktake(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    stocktakeId: string;
    idempotencyKey: string;
    /** Test-only lock probe; production callers must never provide it. */
    afterBalancesLocked?: () => Promise<void>;
  },
): Promise<{ stocktakeId: string; inventoryTransactionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inventory.stocktake.post',
      idempotencyKey: input.idempotencyKey,
      request: { ...input, afterBalancesLocked: undefined },
    });
    if (started.replay)
      return started.replay as { stocktakeId: string; inventoryTransactionId: string };
    const session = await sql<{
      id: string;
      location_id: string;
      status: string;
    }>`select id, location_id, status from inventory.stocktake_sessions where id = ${input.stocktakeId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const header = session.rows[0];
    if (!header) throw new InventoryDomainError('NOT_FOUND', 'Stocktake was not found.');
    if (header.status === 'POSTED')
      throw new InventoryDomainError('CONFLICT', 'Stocktake was already posted.');
    if (!['COUNTING', 'REVIEW'].includes(header.status))
      throw new InventoryDomainError(
        'CONFLICT',
        'Stocktake cannot be posted from its current state.',
      );
    const lines = await sql<{
      inventory_item_id: string;
      expected_quantity_at_snapshot: string;
      counted_quantity: string | null;
      actual_quantity: string;
    }>`select line.inventory_item_id, line.expected_quantity_at_snapshot::text, line.counted_quantity::text, (level.sellable_quantity + level.unavailable_quantity)::text as actual_quantity from inventory.stocktake_lines line join inventory.inventory_levels level on level.organization_id = line.organization_id and level.inventory_item_id = line.inventory_item_id and level.location_id = ${header.location_id} where line.stocktake_session_id = ${header.id} and line.organization_id = ${input.organizationId} order by line.inventory_item_id for update of line, level`.execute(
      transaction,
    );
    if (lines.rows.some((line) => line.counted_quantity === null))
      throw new InventoryDomainError(
        'VALIDATION_FAILED',
        'Every stocktake line must be counted before posting.',
      );
    await input.afterBalancesLocked?.();
    const movements: {
      inventoryItemId: string;
      locationId: string;
      condition: InventoryCondition;
      quantityDelta: string;
    }[] = [];
    for (const line of lines.rows) {
      const variance = subtract(line.counted_quantity!, line.actual_quantity);
      if (variance !== '0')
        movements.push({
          inventoryItemId: line.inventory_item_id,
          locationId: header.location_id,
          condition: 'SELLABLE',
          quantityDelta: variance,
        });
      await sql`update inventory.stocktake_lines set movements_after_snapshot = ${subtract(line.actual_quantity, line.expected_quantity_at_snapshot)}::numeric, final_expected_quantity = ${line.actual_quantity}::numeric, variance_quantity = ${variance}::numeric, status = 'POSTED', version = version + 1 where stocktake_session_id = ${header.id} and inventory_item_id = ${line.inventory_item_id}`.execute(
        transaction,
      );
    }
    const inventoryTransactionId = await postTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transactionType: 'STOCKTAKE_ADJUSTMENT',
      reasonCode: 'STOCKTAKE_CORRECTION',
      referenceType: 'inventory.stocktake',
      referenceId: header.id,
      idempotencyRecordId: started.recordId,
      lines: movements,
    });
    for (const movement of movements)
      if (movement.quantityDelta.startsWith('-'))
        await consumeCostPositionsForInventoryLossInTransaction(transaction, {
          organizationId: input.organizationId,
          inventoryItemId: movement.inventoryItemId,
          locationId: movement.locationId,
          condition: movement.condition,
          quantity: movement.quantityDelta.slice(1),
          inventoryTransactionId,
        });
      else
        await recordUnvaluedInventoryAdditionInTransaction(transaction, {
          organizationId: input.organizationId,
          inventoryTransactionId,
          inventoryItemId: movement.inventoryItemId,
          locationId: movement.locationId,
          condition: movement.condition,
          quantity: movement.quantityDelta,
          reasonCode: 'STOCKTAKE_CORRECTION',
        });
    await sql`update inventory.stocktake_sessions set status = 'POSTED', posted_inventory_transaction_id = ${inventoryTransactionId}, posted_at = now(), version = version + 1 where id = ${header.id}`.execute(
      transaction,
    );
    const response = { stocktakeId: header.id, inventoryTransactionId };
    await completeIdempotency(
      transaction,
      started.recordId!,
      'inventory.stocktake',
      header.id,
      response,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inventory.stocktake.posted',
      eventType: 'inventory.stocktake.posted',
      targetType: 'inventory.stocktake',
      targetId: header.id,
      metadata: { locationId: header.location_id },
    });
    return response;
  });
}

export async function getStocktakeWorkspace(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  stocktakeId: string,
): Promise<
  | {
      id: string;
      stocktakeNumber: string;
      locationId: string;
      locationName: string;
      status: string;
      snapshotAt: Date;
      postedAt: Date | null;
      createdByActorId: string | null;
      postedInventoryTransactionId: string | null;
      version: number;
      totalLines: number;
      countedLines: number;
      lines: readonly {
        id: string;
        inventoryItemId: string;
        variantId: string;
        sku: string;
        productTitle: string;
        optionSummary: string | null;
        expectedQuantityAtSnapshot: string;
        countedQuantity: string | null;
        movementsAfterSnapshot: string;
        finalExpectedQuantity: string | null;
        varianceQuantity: string | null;
        status: string;
      }[];
    }
  | undefined
> {
  const session = await sql<{
    id: string;
    stocktake_number: string;
    location_id: string;
    location_name: string;
    status: string;
    snapshot_at: Date;
    posted_at: Date | null;
    created_by_actor_id: string | null;
    posted_inventory_transaction_id: string | null;
    version: string;
  }>`
    select s.id, s.stocktake_number, s.location_id, s.status, s.snapshot_at, s.posted_at,
      s.created_by_actor_id, s.posted_inventory_transaction_id, s.version::text, l.name as location_name
    from inventory.stocktake_sessions s
    join warehouse.locations l on l.id = s.location_id
    where s.id = ${stocktakeId} and s.organization_id = ${organizationId}
  `.execute(db);
  const header = session.rows[0];
  if (!header) return undefined;

  const lines = await sql<{
    id: string;
    inventory_item_id: string;
    variant_id: string;
    expected_quantity_at_snapshot: string;
    counted_quantity: string | null;
    movements_after_snapshot: string;
    final_expected_quantity: string | null;
    variance_quantity: string | null;
    status: string;
    sku: string;
    product_title: string;
    option_summary: string | null;
  }>`
    select
      sl.id, sl.inventory_item_id, item.variant_id,
      sl.expected_quantity_at_snapshot::text,
      sl.counted_quantity::text,
      sl.movements_after_snapshot::text,
      sl.final_expected_quantity::text,
      sl.variance_quantity::text,
      sl.status,
      variant.sku,
      product.title as product_title,
      (
        select string_agg(ov.display_value, ' / ' order by axis.position)
        from catalog.product_option_axes axis
        join catalog.product_option_values ov on ov.axis_id = axis.id
        join catalog.variant_option_values vov on vov.option_value_id = ov.id and vov.variant_id = variant.id
        where axis.product_id = product.id
      ) as option_summary
    from inventory.stocktake_lines sl
    join inventory.inventory_items item on item.id = sl.inventory_item_id
    join catalog.product_variants variant on variant.id = item.variant_id
    join catalog.products product on product.id = variant.product_id
    where sl.stocktake_session_id = ${header.id} and sl.organization_id = ${organizationId}
    order by product.title, variant.sku
  `.execute(db);

  return {
    id: header.id,
    stocktakeNumber: header.stocktake_number,
    locationId: header.location_id,
    locationName: header.location_name,
    status: header.status,
    snapshotAt: header.snapshot_at,
    postedAt: header.posted_at,
    createdByActorId: header.created_by_actor_id,
    postedInventoryTransactionId: header.posted_inventory_transaction_id,
    version: Number(header.version),
    totalLines: lines.rows.length,
    countedLines: lines.rows.filter((line) => line.counted_quantity !== null).length,
    lines: lines.rows.map((line) => ({
      id: line.id,
      inventoryItemId: line.inventory_item_id,
      variantId: line.variant_id,
      sku: line.sku,
      productTitle: line.product_title,
      optionSummary: line.option_summary,
      expectedQuantityAtSnapshot: subtract(line.expected_quantity_at_snapshot, '0'),
      countedQuantity: line.counted_quantity === null ? null : subtract(line.counted_quantity, '0'),
      movementsAfterSnapshot: subtract(line.movements_after_snapshot, '0'),
      finalExpectedQuantity:
        line.final_expected_quantity === null ? null : subtract(line.final_expected_quantity, '0'),
      varianceQuantity:
        line.variance_quantity === null ? null : subtract(line.variance_quantity, '0'),
      status: line.status,
    })),
  };
}

export async function getInventoryStats(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<{
  totalOnHand: string;
  totalAvailable: string;
  totalReserved: string;
  totalUnavailable: string;
  totalDamaged: string;
  lowStockCount: number;
  outOfStockCount: number;
}> {
  const result = await sql<{
    total_on_hand: string;
    total_available: string;
    total_reserved: string;
    total_unavailable: string;
    total_damaged: string;
    low_stock_count: string;
    out_of_stock_count: string;
  }>`
    select 
      coalesce(sum(level.sellable_quantity + level.unavailable_quantity), 0)::text as total_on_hand,
      coalesce(sum(level.sellable_quantity - level.reserved_quantity), 0)::text as total_available,
      coalesce(sum(level.reserved_quantity), 0)::text as total_reserved,
      coalesce(sum(level.unavailable_quantity), 0)::text as total_unavailable,
      coalesce((select sum(quantity) from inventory.inventory_level_conditions where organization_id = ${organizationId} and condition_code = 'DAMAGED'), 0)::text as total_damaged,
      count(case when level.sellable_quantity - level.reserved_quantity > 0 and level.sellable_quantity - level.reserved_quantity <= 5 then 1 end)::text as low_stock_count,
      count(case when level.sellable_quantity - level.reserved_quantity <= 0 then 1 end)::text as out_of_stock_count
    from inventory.inventory_levels level
    where level.organization_id = ${organizationId}
  `.execute(db);
  const row = result.rows[0];
  return {
    totalOnHand: subtract(row?.total_on_hand ?? '0', '0'),
    totalAvailable: subtract(row?.total_available ?? '0', '0'),
    totalReserved: subtract(row?.total_reserved ?? '0', '0'),
    totalUnavailable: subtract(row?.total_unavailable ?? '0', '0'),
    totalDamaged: subtract(row?.total_damaged ?? '0', '0'),
    lowStockCount: Number(row?.low_stock_count ?? '0'),
    outOfStockCount: Number(row?.out_of_stock_count ?? '0'),
  };
}

export async function listInventoryReservations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: {
    inventoryItemId?: string;
    locationId?: string;
    status?: 'ACTIVE' | 'ALL';
    search?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: readonly {
    id: string;
    inventoryItemId: string;
    variantId: string;
    sku: string;
    productTitle: string;
    locationId: string;
    locationName: string;
    quantity: string;
    consumedQuantity: string;
    releasedQuantity: string;
    remainingQuantity: string;
    status: 'ACTIVE' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';
    sourceType: string;
    sourceReference: string;
    owner?: {
      type: 'ORDER';
      orderId: string;
      orderNumber: string;
      orderStatus: string;
      fulfillmentStatus?: string;
      paymentStatus: string;
      paymentExpiresAt?: string;
    };
    attentionCode?:
      | 'TERMINAL_ORDER_OWNER'
      | 'ORDER_ON_HOLD'
      | 'PAYMENT_REJECTED'
      | 'PAYMENT_REVIEW_OVERDUE'
      | 'EXPIRED_STANDALONE_HOLD';
    releaseAllowed: boolean;
    releaseBlockedReason?: string;
    expiresAt?: string;
    createdAt: string;
  }[];
  totalCount: number;
}> {
  const offset = ((input.page || 1) - 1) * (input.limit || 25);
  const statusFilter =
    input.status === 'ALL' ? sql`1=1` : sql`res.status in ('ACTIVE', 'PARTIALLY_CONSUMED')`;
  const locationFilter = input.locationId
    ? sql`res.location_id = ${input.locationId}::uuid`
    : sql`1=1`;
  const itemFilter = input.inventoryItemId
    ? sql`res.inventory_item_id = ${input.inventoryItemId}::uuid`
    : sql`1=1`;
  const searchFilter = input.search?.trim()
    ? sql`(
        variant.sku ilike ${`%${input.search.trim()}%`}
        or product.title ilike ${`%${input.search.trim()}%`}
        or res.source_reference ilike ${`%${input.search.trim()}%`}
        or order_row.order_number ilike ${`%${input.search.trim()}%`}
      )`
    : sql`1=1`;

  const countResult = await sql<{ count: string }>`
    select count(*)::text as count
    from inventory.inventory_reservations res
    join inventory.inventory_items item on item.id = res.inventory_item_id and item.organization_id = res.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    left join orders.order_inventory_reservations bridge on bridge.organization_id = res.organization_id and bridge.reservation_id = res.id
    left join orders.orders order_row on order_row.organization_id = bridge.organization_id and order_row.id = bridge.order_id
    where res.organization_id = ${organizationId}
      and ${statusFilter}
      and ${locationFilter}
      and ${itemFilter}
      and ${searchFilter}
  `.execute(db);

  const result = await sql<{
    id: string;
    inventory_item_id: string;
    location_id: string;
    quantity: string;
    consumed_quantity: string;
    released_quantity: string;
    remaining_quantity: string;
    status: 'ACTIVE' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';
    source_type: string;
    source_reference: string;
    expires_at: string | null;
    created_at: string;
    variant_id: string;
    sku: string;
    product_title: string;
    location_name: string;
    order_id: string | null;
    order_number: string | null;
    order_status: string | null;
    fulfillment_status: string | null;
    payment_status: string | null;
    payment_expires_at: string | null;
  }>`
    select res.id, res.inventory_item_id, res.location_id, res.quantity::text, res.status, res.source_type, res.source_reference, res.expires_at, res.created_at,
      coalesce(allocation.consumed_quantity, 0)::text as consumed_quantity,
      coalesce(allocation.released_quantity, 0)::text as released_quantity,
      (res.quantity - coalesce(allocation.consumed_quantity, 0) - coalesce(allocation.released_quantity, 0))::text as remaining_quantity,
      variant.id as variant_id, variant.sku, product.title as product_title, location.name as location_name,
      order_row.id as order_id, order_row.order_number, order_row.order_status,
      fulfillment_state.status as fulfillment_status,
      payment_state.status as payment_status, payment_state.expires_at as payment_expires_at
    from inventory.inventory_reservations res
    join inventory.inventory_items item on item.id = res.inventory_item_id
      and item.organization_id = res.organization_id
    join catalog.product_variants variant on variant.id = item.variant_id
      and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id
      and product.organization_id = variant.organization_id
    join warehouse.locations location on location.id = res.location_id
      and location.organization_id = res.organization_id
    left join inventory.inventory_reservation_allocations allocation
      on allocation.organization_id = res.organization_id and allocation.reservation_id = res.id
    left join orders.order_inventory_reservations bridge
      on bridge.organization_id = res.organization_id and bridge.reservation_id = res.id
    left join orders.orders order_row
      on order_row.organization_id = bridge.organization_id and order_row.id = bridge.order_id
    left join lateral (
      select string_agg(distinct fulfillment.status, ', ' order by fulfillment.status) as status
      from inventory.fulfillment_inventory_allocations fulfillment_allocation
      join fulfillment.fulfillment_lines fulfillment_line
        on fulfillment_line.organization_id = fulfillment_allocation.organization_id
        and fulfillment_line.id = fulfillment_allocation.fulfillment_line_id
      join fulfillment.fulfillments fulfillment
        on fulfillment.organization_id = fulfillment_line.organization_id
        and fulfillment.id = fulfillment_line.fulfillment_id
      where fulfillment_allocation.organization_id = res.organization_id
        and fulfillment_allocation.reservation_allocation_id = allocation.id
        and fulfillment.status <> 'CANCELLED'
    ) fulfillment_state on true
    left join lateral (
      select
        case
          when method.method_type = 'COD' then 'COD'
          when intent.status = 'SATISFIED' then 'PAID'
          when exists (
            select 1 from payments.payment_attempts attempt
            where attempt.organization_id = intent.organization_id
              and attempt.payment_intent_id = intent.id
              and attempt.status = 'PENDING_VERIFICATION'
          ) then 'PAYMENT_REVIEW'
          when exists (
            select 1 from payments.payment_attempts attempt
            where attempt.organization_id = intent.organization_id
              and attempt.payment_intent_id = intent.id
              and attempt.status = 'REJECTED'
          ) then 'PAYMENT_REJECTED'
          when intent.status = 'READY' then 'AWAITING_PAYMENT'
          else intent.status
        end as status,
        intent.expires_at
      from payments.payment_intents intent
      join payments.payment_methods method
        on method.organization_id = intent.organization_id and method.id = intent.payment_method_id
      where intent.organization_id = res.organization_id and intent.order_id = order_row.id
      order by intent.created_at desc
      limit 1
    ) payment_state on true
    where res.organization_id = ${organizationId}
      and ${statusFilter}
      and ${locationFilter}
      and ${itemFilter}
      and ${searchFilter}
    order by res.created_at desc
    limit ${input.limit || 25} offset ${offset}
  `.execute(db);

  return {
    items: result.rows.map((row) => {
      const paymentExpiryPassed =
        row.payment_expires_at !== null && new Date(row.payment_expires_at).getTime() <= Date.now();
      const attentionCode = row.order_id
        ? ['COMPLETED', 'CANCELLED'].includes(row.order_status ?? '')
          ? ('TERMINAL_ORDER_OWNER' as const)
          : row.order_status === 'ON_HOLD'
            ? ('ORDER_ON_HOLD' as const)
            : row.payment_status === 'PAYMENT_REJECTED'
              ? ('PAYMENT_REJECTED' as const)
              : row.payment_status === 'PAYMENT_REVIEW' && paymentExpiryPassed
                ? ('PAYMENT_REVIEW_OVERDUE' as const)
                : undefined
        : row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()
          ? ('EXPIRED_STANDALONE_HOLD' as const)
          : undefined;
      return {
        id: row.id,
        inventoryItemId: row.inventory_item_id,
        variantId: row.variant_id,
        sku: row.sku,
        productTitle: row.product_title,
        locationId: row.location_id,
        locationName: row.location_name,
        quantity: subtract(row.quantity, '0'),
        consumedQuantity: subtract(row.consumed_quantity, '0'),
        releasedQuantity: subtract(row.released_quantity, '0'),
        remainingQuantity: subtract(row.remaining_quantity, '0'),
        status: row.status,
        sourceType: row.source_type,
        sourceReference: row.source_reference,
        ...(row.order_id && row.order_number && row.order_status
          ? {
              owner: {
                type: 'ORDER' as const,
                orderId: row.order_id,
                orderNumber: row.order_number,
                orderStatus: row.order_status,
                ...(row.fulfillment_status ? { fulfillmentStatus: row.fulfillment_status } : {}),
                paymentStatus: row.payment_status ?? 'UNKNOWN',
                ...(row.payment_expires_at ? { paymentExpiresAt: row.payment_expires_at } : {}),
              },
            }
          : {}),
        releaseAllowed:
          row.order_id === null && ['ACTIVE', 'PARTIALLY_CONSUMED'].includes(row.status),
        ...(row.order_id
          ? { releaseBlockedReason: 'Cancel the owning Order to release this stock safely.' }
          : {}),
        ...(attentionCode ? { attentionCode } : {}),
        ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
        createdAt: row.created_at,
      };
    }),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function listStocktakeSessions(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: { locationId?: string; status?: string; page?: number; limit?: number } = {},
): Promise<{
  items: readonly {
    id: string;
    stocktakeNumber: string;
    locationId: string;
    locationName: string;
    status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
    snapshotAt: Date;
    postedAt: Date | null;
    version: number;
    totalLines: number;
    countedLines: number;
  }[];
  totalCount: number;
}> {
  const offset = ((input.page || 1) - 1) * (input.limit || 25);
  const locationFilter = input.locationId
    ? sql`session.location_id = ${input.locationId}::uuid`
    : sql`1=1`;
  const statusFilter = input.status ? sql`session.status = ${input.status}` : sql`1=1`;

  const countResult = await sql<{ count: string }>`
    select count(*)::text as count
    from inventory.stocktake_sessions session
    where session.organization_id = ${organizationId}
      and ${locationFilter}
      and ${statusFilter}
  `.execute(db);

  const result = await sql<{
    id: string;
    stocktake_number: string;
    location_id: string;
    location_name: string;
    status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
    snapshot_at: Date;
    posted_at: Date | null;
    version: string;
    total_lines: string;
    counted_lines: string;
  }>`
    select session.id, session.stocktake_number, session.location_id, session.status, session.snapshot_at, session.posted_at, session.version::text, location.name as location_name,
      (select count(*) from inventory.stocktake_lines where stocktake_session_id = session.id) as total_lines,
      (select count(*) from inventory.stocktake_lines where stocktake_session_id = session.id and counted_quantity is not null) as counted_lines
    from inventory.stocktake_sessions session
    join warehouse.locations location on location.id = session.location_id
    where session.organization_id = ${organizationId}
      and ${locationFilter}
      and ${statusFilter}
    order by session.created_at desc
    limit ${input.limit || 25} offset ${offset}
  `.execute(db);

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      stocktakeNumber: row.stocktake_number,
      locationId: row.location_id,
      locationName: row.location_name,
      status: row.status,
      snapshotAt: row.snapshot_at,
      postedAt: row.posted_at,
      version: Number(row.version),
      totalLines: Number(row.total_lines),
      countedLines: Number(row.counted_lines),
    })),
    totalCount: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export async function getInventoryItemDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  inventoryItemId: string,
): Promise<
  | {
      id: string;
      variantId: string;
      productId: string;
      sku: string;
      productTitle: string;
      optionSummary?: string;
      inventoryStatus: 'ACTIVE' | 'ARCHIVED';
      variantStatus: 'ACTIVE' | 'ARCHIVED';
      trackingMode: 'STANDARD' | 'LOT' | 'SERIAL';
      unitCode: string;
      summary: {
        onHand: string;
        sellable: string;
        reserved: string;
        availableToSell: string;
        unavailable: string;
        incomingTransfer: string;
        outgoingTransfer: string;
        incomingSupply: string;
      };
      balances: readonly (InventoryBalance & {
        variantId: string;
        sku: string;
        productTitle: string;
        locationName: string;
      })[];
      recentHistory: Awaited<ReturnType<typeof listInventoryHistory>>['items'];
      activeReservations: Awaited<ReturnType<typeof listInventoryReservations>>['items'];
    }
  | undefined
> {
  const itemResult = await sql<{
    id: string;
    variant_id: string;
    product_id: string;
    sku: string;
    product_title: string;
    option_summary: string | null;
    inventory_status: 'ACTIVE' | 'ARCHIVED';
    variant_status: 'ACTIVE' | 'ARCHIVED';
    tracking_mode: 'STANDARD' | 'LOT' | 'SERIAL';
    unit_code: string;
  }>`
    select item.id, item.variant_id, variant.product_id, item.tracking_mode, item.unit_code,
      item.status as inventory_status, variant.status as variant_status, variant.sku,
      coalesce(nullif(variant.title, ''), (
        select string_agg(axis.name || ': ' || value.display_value, ', ' order by axis.position, value.position)
        from catalog.variant_option_values link
        join catalog.product_option_values value on value.id=link.option_value_id and value.organization_id=link.organization_id
        join catalog.product_option_axes axis on axis.id=link.option_axis_id and axis.organization_id=link.organization_id
        where link.organization_id=item.organization_id and link.variant_id=variant.id
      )) as option_summary, product.title as product_title
    from inventory.inventory_items item
    join catalog.product_variants variant on variant.id = item.variant_id and variant.organization_id = item.organization_id
    join catalog.products product on product.id = variant.product_id and product.organization_id = variant.organization_id
    where item.id = ${inventoryItemId} and item.organization_id = ${organizationId}
  `.execute(db);
  const item = itemResult.rows[0];
  if (!item) return undefined;

  const [positions, recentHistory, activeReservations, balancesResult] = await Promise.all([
    listInventoryPositions(db, organizationId, { inventoryItemId, limit: 100 }),
    listInventoryHistory(db, organizationId, { inventoryItemId, limit: 25 }),
    listInventoryReservations(db, organizationId, {
      inventoryItemId,
      status: 'ACTIVE',
      limit: 100,
    }),
    sql<{
      location_id: string;
      condition_code: InventoryCondition;
      quantity: string;
      reserved_quantity: string;
      location_name: string;
    }>`
      select condition.location_id, condition.condition_code, condition.quantity::text,
        level.reserved_quantity::text, location.name as location_name
      from inventory.inventory_level_conditions condition
      join inventory.inventory_levels level on level.organization_id = condition.organization_id
        and level.inventory_item_id = condition.inventory_item_id and level.location_id = condition.location_id
      join warehouse.locations location on location.id = condition.location_id
        and location.organization_id = condition.organization_id
      where condition.inventory_item_id = ${inventoryItemId} and condition.organization_id = ${organizationId}
      order by location.name, condition.condition_code
    `.execute(db),
  ]);

  return {
    id: item.id,
    variantId: item.variant_id,
    productId: item.product_id,
    sku: item.sku,
    productTitle: item.product_title,
    ...(item.option_summary === null ? {} : { optionSummary: item.option_summary }),
    inventoryStatus: item.inventory_status,
    variantStatus: item.variant_status,
    trackingMode: item.tracking_mode,
    unitCode: item.unit_code,
    summary: {
      onHand: sumPositiveQuantities(positions.items.map((position) => position.onHand)),
      sellable: sumPositiveQuantities(positions.items.map((position) => position.sellable)),
      reserved: sumPositiveQuantities(positions.items.map((position) => position.reserved)),
      availableToSell: sumPositiveQuantities(
        positions.items.map((position) => position.availableToSell),
      ),
      unavailable: sumPositiveQuantities(positions.items.map((position) => position.unavailable)),
      incomingTransfer: sumPositiveQuantities(
        positions.items.map((position) => position.incomingTransfer),
      ),
      outgoingTransfer: sumPositiveQuantities(
        positions.items.map((position) => position.outgoingTransfer),
      ),
      incomingSupply: sumPositiveQuantities(
        positions.items.map((position) => position.incomingSupply),
      ),
    },
    balances: balancesResult.rows.map((row) => ({
      inventoryItemId: item.id,
      variantId: item.variant_id,
      sku: item.sku,
      productTitle: item.product_title,
      locationId: row.location_id,
      locationName: row.location_name,
      condition: row.condition_code,
      onHand: subtract(row.quantity, '0'),
      reserved: row.condition_code === 'SELLABLE' ? subtract(row.reserved_quantity, '0') : '0',
      availableToSell:
        row.condition_code === 'SELLABLE'
          ? subtract(subtract(row.quantity, '0'), subtract(row.reserved_quantity, '0'))
          : '0',
    })),
    recentHistory: recentHistory.items,
    activeReservations: activeReservations.items,
  };
}
