import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { requireActiveLocationCapability } from './warehouse.js';

export type InventoryCondition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
export type InventoryTransactionType =
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT'
  | 'CONDITION_CHANGE'
  | 'TRANSFER_DISPATCH'
  | 'TRANSFER_RECEIPT'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'FULFILLMENT_DISPATCH'
  | 'INBOUND_RECEIPT';

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

async function ensureItem(
  transaction: Transaction<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<string> {
  const variant = await sql<{
    id: string;
  }>`select id from catalog.product_variants where id = ${variantId} and organization_id = ${organizationId}`.execute(
    transaction,
  );
  if (!variant.rows[0])
    throw new InventoryDomainError(
      'NOT_FOUND',
      'Catalog Variant was not found in this organization.',
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
    operation: string;
    idempotencyKey: string;
    request: unknown;
  },
): Promise<{ replay?: unknown; recordId?: string }> {
  try {
    const record = await claimIdempotencyRecord(transaction, {
      organizationId: input.organizationId,
      principalType: 'USER',
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
    actorId: string;
    action: string;
    eventType: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(transaction, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
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
    const inventoryItemId = await ensureItem(transaction, input.organizationId, input.variantId);
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
  const inventoryItemId = await ensureItem(transaction, input.organizationId, input.variantId);
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
  input: { organizationId: string; actorId: string; reservationId: string; idempotencyKey: string },
): Promise<{ reservationId: string; released: boolean }> {
  return db
    .transaction()
    .execute((transaction) => releaseInventoryReservationInTransaction(transaction, input));
}

export async function releaseInventoryReservationInTransaction(
  transaction: Transaction<DatabaseSchema>,
  input: { organizationId: string; actorId: string; reservationId: string; idempotencyKey: string },
): Promise<{ reservationId: string; released: boolean }> {
  const started = await beginIdempotent(transaction, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    operation: 'inventory.release-reservation',
    idempotencyKey: input.idempotencyKey,
    request: input,
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
    const status = allocations.rows.some((allocation) => allocation.consumed_quantity !== '0')
      ? 'CONSUMED'
      : 'RELEASED';
    await sql`update inventory.inventory_reservations set status = ${status}, released_at = now(), updated_at = now(), version = version + 1 where id = ${row.id}`.execute(
      transaction,
    );
    released = true;
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'inventory.reservation.released',
      eventType: 'inventory.reservation.released',
      targetType: 'inventory.reservation',
      targetId: row.id,
      metadata: {
        inventoryItemId: row.inventory_item_id,
        locationId: row.location_id,
        quantity: remaining,
      },
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

export async function listInventoryBalances(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: { locationId?: string; search?: string } = {},
): Promise<
  readonly (InventoryBalance & {
    variantId: string;
    sku: string;
    productTitle: string;
    locationName: string;
  })[]
> {
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
      and (${input.locationId ?? null}::uuid is null or condition.location_id = ${input.locationId ?? null}::uuid)
      and (${input.search ?? null}::text is null or variant.sku ilike '%' || ${input.search ?? null} || '%' or product.title ilike '%' || ${input.search ?? null} || '%')
    order by product.title, variant.sku, location.name, condition.condition_code
  `.execute(db);
  return result.rows.map((row) => ({
    ...rowBalance(row),
    variantId: row.variant_id,
    sku: row.sku,
    productTitle: row.product_title,
    locationName: row.location_name,
  }));
}

export async function listInventoryHistory(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  limit = 100,
): Promise<
  readonly {
    id: string;
    occurredAt: Date;
    transactionType: string;
    sku: string;
    locationName: string;
    condition: InventoryCondition;
    quantityDelta: string;
    reasonCode: string | null;
  }[]
> {
  const result = await sql<{
    id: string;
    occurred_at: Date;
    transaction_type: string;
    sku: string;
    location_name: string;
    condition_code: InventoryCondition;
    quantity_delta: string;
    reason_code: string | null;
  }>`
    select line.id::text, transaction.occurred_at, transaction.transaction_type, variant.sku, location.name as location_name, line.condition_code, line.quantity_delta::text, transaction.reason_code
    from inventory.inventory_movement_lines line
    join inventory.inventory_transactions transaction on transaction.id = line.inventory_transaction_id
    join inventory.inventory_items item on item.id = line.inventory_item_id
    join catalog.product_variants variant on variant.id = item.variant_id
    join warehouse.locations location on location.id = line.location_id
    where line.organization_id = ${organizationId} order by transaction.occurred_at desc, line.id desc limit ${Math.min(Math.max(limit, 1), 250)}
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    transactionType: row.transaction_type,
    sku: row.sku,
    locationName: row.location_name,
    condition: row.condition_code,
    quantityDelta: row.quantity_delta,
    reasonCode: row.reason_code,
  }));
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

export async function createWarehouseTransfer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    sourceLocationId: string;
    destinationLocationId: string;
    lines: readonly { variantId: string; quantity: string }[];
    notes?: string;
  },
): Promise<{ transferId: string; version: number }> {
  if (input.sourceLocationId === input.destinationLocationId)
    throw new InventoryDomainError(
      'VALIDATION_FAILED',
      'Transfer source and destination must differ.',
    );
  if (input.lines.length === 0)
    throw new InventoryDomainError('VALIDATION_FAILED', 'Transfer needs at least one line.');
  for (const line of input.lines) assertQuantity(line.quantity);
  return db.transaction().execute(async (transaction) => {
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
    }>`insert into warehouse.transfers (organization_id, transfer_number, source_location_id, destination_location_id, notes, created_by_actor_id) values (${input.organizationId}, concat('TR-', replace(uuidv7()::text, '-', '')), ${input.sourceLocationId}, ${input.destinationLocationId}, ${input.notes ?? null}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const transferId = created.rows[0]?.id;
    if (!transferId) throw new Error('Transfer creation did not return an id.');
    for (const line of input.lines) {
      const itemId = await ensureItem(transaction, input.organizationId, line.variantId);
      await sql`insert into warehouse.transfer_lines (organization_id, transfer_id, inventory_item_id, requested_quantity) values (${input.organizationId}, ${transferId}, ${itemId}, ${line.quantity}::numeric)`.execute(
        transaction,
      );
    }
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
      },
    });
    return { transferId, version: 1 };
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
    for (const receipt of input.lines) {
      const line = await sql<{
        id: string;
        inventory_item_id: string;
        remaining: string;
      }>`select id, inventory_item_id, (dispatched_quantity - received_quantity)::text as remaining from warehouse.transfer_lines where id = ${receipt.transferLineId} and transfer_id = ${header.id} and organization_id = ${input.organizationId} for update`.execute(
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
    const remaining = await sql<{
      count: string;
    }>`select count(*)::text as count from warehouse.transfer_lines where transfer_id = ${header.id} and dispatched_quantity > received_quantity`.execute(
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
  input: { organizationId: string; actorId: string; stocktakeId: string; idempotencyKey: string },
): Promise<{ stocktakeId: string; inventoryTransactionId: string }> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'inventory.stocktake.post',
      idempotencyKey: input.idempotencyKey,
      request: input,
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
    }>`select line.inventory_item_id, line.expected_quantity_at_snapshot::text, line.counted_quantity::text, coalesce(level.sellable_quantity + level.unavailable_quantity, 0)::text as actual_quantity from inventory.stocktake_lines line left join inventory.inventory_levels level on level.organization_id = line.organization_id and level.inventory_item_id = line.inventory_item_id and level.location_id = ${header.location_id} where line.stocktake_session_id = ${header.id} and line.organization_id = ${input.organizationId} order by line.inventory_item_id for update of line`.execute(
      transaction,
    );
    if (lines.rows.some((line) => line.counted_quantity === null))
      throw new InventoryDomainError(
        'VALIDATION_FAILED',
        'Every stocktake line must be counted before posting.',
      );
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

export async function listWarehouseTransfers(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<
  readonly {
    id: string;
    transferNumber: string;
    sourceLocationId: string;
    destinationLocationId: string;
    status: string;
    version: number;
    lines: readonly {
      id: string;
      inventoryItemId: string;
      requestedQuantity: string;
      dispatchedQuantity: string;
      receivedQuantity: string;
    }[];
  }[]
> {
  const transfers = await sql<{
    id: string;
    transfer_number: string;
    source_location_id: string;
    destination_location_id: string;
    status: string;
    version: string;
  }>`select id, transfer_number, source_location_id, destination_location_id, status, version::text from warehouse.transfers where organization_id = ${organizationId} order by created_at desc`.execute(
    db,
  );
  return Promise.all(
    transfers.rows.map(async (transfer) => {
      const lines = await sql<{
        id: string;
        inventory_item_id: string;
        requested_quantity: string;
        dispatched_quantity: string;
        received_quantity: string;
      }>`select id, inventory_item_id, requested_quantity::text, dispatched_quantity::text, received_quantity::text from warehouse.transfer_lines where organization_id = ${organizationId} and transfer_id = ${transfer.id} order by id`.execute(
        db,
      );
      return {
        id: transfer.id,
        transferNumber: transfer.transfer_number,
        sourceLocationId: transfer.source_location_id,
        destinationLocationId: transfer.destination_location_id,
        status: transfer.status,
        version: Number(transfer.version),
        lines: lines.rows.map((line) => ({
          id: line.id,
          inventoryItemId: line.inventory_item_id,
          requestedQuantity: subtract(line.requested_quantity, '0'),
          dispatchedQuantity: subtract(line.dispatched_quantity, '0'),
          receivedQuantity: subtract(line.received_quantity, '0'),
        })),
      };
    }),
  );
}

export async function getStocktakeWorkspace(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  stocktakeId: string,
): Promise<
  | {
      id: string;
      locationId: string;
      status: string;
      version: number;
      lines: readonly {
        inventoryItemId: string;
        expectedQuantity: string;
        countedQuantity: string | null;
      }[];
    }
  | undefined
> {
  const session = await sql<{
    id: string;
    location_id: string;
    status: string;
    version: string;
  }>`select id, location_id, status, version::text from inventory.stocktake_sessions where id = ${stocktakeId} and organization_id = ${organizationId}`.execute(
    db,
  );
  const header = session.rows[0];
  if (!header) return undefined;
  const lines = await sql<{
    inventory_item_id: string;
    expected_quantity_at_snapshot: string;
    counted_quantity: string | null;
  }>`select inventory_item_id, expected_quantity_at_snapshot::text, counted_quantity::text from inventory.stocktake_lines where stocktake_session_id = ${header.id} and organization_id = ${organizationId} order by inventory_item_id`.execute(
    db,
  );
  return {
    id: header.id,
    locationId: header.location_id,
    status: header.status,
    version: Number(header.version),
    lines: lines.rows.map((line) => ({
      inventoryItemId: line.inventory_item_id,
      expectedQuantity: subtract(line.expected_quantity_at_snapshot, '0'),
      countedQuantity: line.counted_quantity === null ? null : subtract(line.counted_quantity, '0'),
    })),
  };
}
