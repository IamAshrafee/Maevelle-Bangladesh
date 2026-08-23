import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { consumeReservationAllocationInTransaction, InventoryDomainError } from './inventory.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { requireActiveLocationCapability } from './warehouse.js';

export type FulfillmentStatus =
  'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';

export class FulfillmentDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'INVALID_TRANSITION'
      | 'STALE_VERSION'
      | 'OVER_FULFILLMENT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'FulfillmentDomainError';
  }
}

export interface FulfillmentView {
  readonly id: string;
  readonly version: number;
  readonly fulfillmentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly status: FulfillmentStatus;
  readonly createdAt: string;
  readonly dispatchedAt?: string;
  readonly lines: readonly {
    id: string;
    orderLineId: string;
    sku: string;
    productTitle: string;
    quantity: string;
    consumed: string;
  }[];
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input);
}

function assertLines(lines: readonly { orderLineId: string; quantity: string }[]): void {
  if (!lines.length)
    throw new FulfillmentDomainError('VALIDATION_FAILED', 'At least one Order line is required.');
  const ids = new Set<string>();
  for (const line of lines) {
    if (!line.orderLineId || ids.has(line.orderLineId))
      throw new FulfillmentDomainError('VALIDATION_FAILED', 'Fulfillment lines must be unique.');
    ids.add(line.orderLineId);
    if (!/^\d+(?:\.\d{1,6})?$/.test(line.quantity) || /^0(?:\.0{1,6})?$/.test(line.quantity))
      throw new FulfillmentDomainError(
        'VALIDATION_FAILED',
        'Fulfillment quantity must be a positive decimal with at most six places.',
      );
  }
}

async function beginIdempotent(
  db: Kysely<DatabaseSchema>,
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
      const existing = await sql<{
        safe_response: unknown;
        status: string;
      }>`select safe_response, status from platform.idempotency_records where id = ${record.id}`.execute(
        db,
      );
      if (existing.rows[0]?.status === 'SUCCEEDED')
        return { replay: existing.rows[0].safe_response };
      throw new FulfillmentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'The same fulfillment command is already in progress.',
      );
    }
    return { recordId: record.id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new FulfillmentDomainError('IDEMPOTENCY_CONFLICT', error.message);
    throw error;
  }
}

async function completeIdempotency(
  db: Kysely<DatabaseSchema>,
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
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    eventType: string;
    fulfillmentId: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'fulfillment.fulfillment',
    targetId: input.fulfillmentId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, ${input.eventType}, 1, 'fulfillment.fulfillment', ${input.fulfillmentId}::uuid, 1, ${JSON.stringify({ fulfillmentId: input.fulfillmentId })}::jsonb, now())`.execute(
    db,
  );
}

function fulfillmentNumber(): string {
  return `FUL-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export async function getFulfillment(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; fulfillmentId: string },
): Promise<FulfillmentView> {
  const header = await sql<{
    id: string;
    version: string;
    fulfillment_number: string;
    order_id: string;
    order_number: string;
    location_id: string;
    location_name: string;
    status: FulfillmentStatus;
    created_at: Date;
    dispatched_at: Date | null;
  }>`
    select fulfillment.id, fulfillment.version::text, fulfillment.fulfillment_number, fulfillment.order_id,
      order_row.order_number, fulfillment.location_id, location.name as location_name, fulfillment.status,
      fulfillment.created_at, fulfillment.dispatched_at
    from fulfillment.fulfillments fulfillment
    join orders.orders order_row on order_row.id = fulfillment.order_id
    join warehouse.locations location on location.id = fulfillment.location_id
    where fulfillment.organization_id = ${input.organizationId} and fulfillment.id = ${input.fulfillmentId}
  `.execute(db);
  const row = header.rows[0];
  if (!row) throw new FulfillmentDomainError('NOT_FOUND', 'Fulfillment was not found.');
  const lines = await sql<{
    id: string;
    order_line_id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    quantity: string;
    consumed: string;
  }>`
    select line.id, line.order_line_id, order_line.sku_snapshot, order_line.product_title_snapshot,
      line.quantity::text, allocation.quantity_consumed::text as consumed
    from fulfillment.fulfillment_lines line
    join orders.order_lines order_line on order_line.id = line.order_line_id
    join inventory.fulfillment_inventory_allocations allocation on allocation.fulfillment_line_id = line.id
    where line.organization_id = ${input.organizationId} and line.fulfillment_id = ${row.id}
    order by line.created_at asc, line.id asc
  `.execute(db);
  return {
    id: row.id,
    version: Number(row.version),
    fulfillmentNumber: row.fulfillment_number,
    orderId: row.order_id,
    orderNumber: row.order_number,
    locationId: row.location_id,
    locationName: row.location_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    ...(row.dispatched_at ? { dispatchedAt: row.dispatched_at.toISOString() } : {}),
    lines: lines.rows.map((line) => ({
      id: line.id,
      orderLineId: line.order_line_id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      quantity: line.quantity,
      consumed: line.consumed,
    })),
  };
}

export async function listFulfillments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly FulfillmentView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from fulfillment.fulfillments where organization_id = ${organizationId} order by created_at desc, id desc limit 100`.execute(
    db,
  );
  return Promise.all(
    ids.rows.map((row) => getFulfillment(db, { organizationId, fulfillmentId: row.id })),
  );
}

export async function createFulfillment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    locationId: string;
    lines: readonly { orderLineId: string; quantity: string }[];
    idempotencyKey: string;
  },
): Promise<FulfillmentView> {
  assertLines(input.lines);
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'fulfillment.create',
      idempotencyKey: input.idempotencyKey,
      request: { orderId: input.orderId, locationId: input.locationId, lines: input.lines },
    });
    if (started.replay) {
      const replay = started.replay as { fulfillmentId: string };
      return getFulfillment(transaction, {
        organizationId: input.organizationId,
        fulfillmentId: replay.fulfillmentId,
      });
    }
    await requireActiveLocationCapability(
      transaction,
      input.organizationId,
      input.locationId,
      'STOCK_HOLDING',
    );
    const order = await sql<{
      id: string;
      order_status: string;
    }>`select id, order_status from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    if (!order.rows[0]) throw new FulfillmentDomainError('NOT_FOUND', 'Order was not found.');
    if (!['PENDING', 'CONFIRMED'].includes(order.rows[0].order_status))
      throw new FulfillmentDomainError(
        'INVALID_TRANSITION',
        'This Order is not eligible for fulfillment.',
      );
    for (const line of [...input.lines].sort((left, right) =>
      left.orderLineId.localeCompare(right.orderLineId),
    )) {
      const source = await sql<{
        order_quantity: string;
        reservation_allocation_id: string;
        location_id: string;
        available_reservation_quantity: string;
      }>`
        select order_line.quantity::text as order_quantity, allocation.id as reservation_allocation_id,
          allocation.location_id, (allocation.reserved_quantity - allocation.consumed_quantity - allocation.released_quantity)::text as available_reservation_quantity
        from orders.order_lines order_line
        join orders.order_inventory_reservations bridge on bridge.order_line_id = order_line.id
        join inventory.inventory_reservation_allocations allocation on allocation.reservation_id = bridge.reservation_id
        where order_line.organization_id = ${input.organizationId} and order_line.order_id = ${input.orderId} and order_line.id = ${line.orderLineId}
        for update of order_line, allocation
      `.execute(transaction);
      const sourceRow = source.rows[0];
      if (!sourceRow)
        throw new FulfillmentDomainError('NOT_FOUND', 'Order line reservation was not found.');
      if (sourceRow.location_id !== input.locationId)
        throw new FulfillmentDomainError(
          'VALIDATION_FAILED',
          'Fulfillment location must match the Order reservation location.',
        );
      const claimed = await sql<{ quantity: string }>`
        select coalesce(sum(fulfillment_line.quantity), 0)::text as quantity
        from fulfillment.fulfillment_lines fulfillment_line
        join fulfillment.fulfillments existing on existing.id = fulfillment_line.fulfillment_id
        where fulfillment_line.organization_id = ${input.organizationId} and fulfillment_line.order_line_id = ${line.orderLineId}
          and existing.status <> 'CANCELLED'
      `.execute(transaction);
      const permitted = await sql<{
        valid: boolean;
      }>`select ${line.quantity}::numeric <= ${sourceRow.order_quantity}::numeric - ${claimed.rows[0]!.quantity}::numeric and ${line.quantity}::numeric <= ${sourceRow.available_reservation_quantity}::numeric as valid`.execute(
        transaction,
      );
      if (!permitted.rows[0]!.valid)
        throw new FulfillmentDomainError(
          'OVER_FULFILLMENT',
          'Fulfillment quantity exceeds the remaining reserved Order quantity.',
        );
    }
    const created = await sql<{
      id: string;
    }>`insert into fulfillment.fulfillments (organization_id, fulfillment_number, order_id, location_id, created_by_actor_id) values (${input.organizationId}, ${fulfillmentNumber()}, ${input.orderId}, ${input.locationId}, ${input.actorId}) returning id`.execute(
      transaction,
    );
    const fulfillmentId = created.rows[0]?.id;
    if (!fulfillmentId) throw new Error('Fulfillment creation did not return an id.');
    for (const line of input.lines) {
      const source = await sql<{ reservation_allocation_id: string }>`
        select allocation.id as reservation_allocation_id
        from orders.order_inventory_reservations bridge
        join inventory.inventory_reservation_allocations allocation on allocation.reservation_id = bridge.reservation_id
        where bridge.order_line_id = ${line.orderLineId} and bridge.organization_id = ${input.organizationId}
      `.execute(transaction);
      const fulfillmentLine = await sql<{
        id: string;
      }>`insert into fulfillment.fulfillment_lines (organization_id, fulfillment_id, order_line_id, quantity) values (${input.organizationId}, ${fulfillmentId}, ${line.orderLineId}, ${line.quantity}::numeric) returning id`.execute(
        transaction,
      );
      await sql`insert into inventory.fulfillment_inventory_allocations (organization_id, fulfillment_line_id, reservation_allocation_id) values (${input.organizationId}, ${fulfillmentLine.rows[0]!.id}, ${source.rows[0]!.reservation_allocation_id})`.execute(
        transaction,
      );
    }
    await completeIdempotency(
      transaction,
      started.recordId!,
      'fulfillment.fulfillment',
      fulfillmentId,
      { fulfillmentId },
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'fulfillment.fulfillment.created',
      eventType: 'fulfillment.created',
      fulfillmentId,
      metadata: {
        orderId: input.orderId,
        locationId: input.locationId,
        lineCount: input.lines.length,
      },
    });
    return getFulfillment(transaction, { organizationId: input.organizationId, fulfillmentId });
  });
}

export async function transitionFulfillment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
    expectedVersion: number;
    nextStatus: 'READY' | 'PICKING' | 'PACKED';
  },
): Promise<FulfillmentView> {
  return db.transaction().execute(async (transaction) => {
    const current = await sql<{
      status: FulfillmentStatus;
      version: string;
    }>`select status, version::text from fulfillment.fulfillments where organization_id = ${input.organizationId} and id = ${input.fulfillmentId} for update`.execute(
      transaction,
    );
    const row = current.rows[0];
    if (!row) throw new FulfillmentDomainError('NOT_FOUND', 'Fulfillment was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new FulfillmentDomainError(
        'STALE_VERSION',
        'Fulfillment has changed; reload before updating.',
      );
    const valid =
      (row.status === 'DRAFT' && input.nextStatus === 'READY') ||
      (row.status === 'READY' && input.nextStatus === 'PICKING') ||
      (row.status === 'PICKING' && input.nextStatus === 'PACKED');
    if (!valid)
      throw new FulfillmentDomainError(
        'INVALID_TRANSITION',
        'This fulfillment transition is not allowed.',
      );
    await sql`update fulfillment.fulfillments set status = ${input.nextStatus}, ready_at = case when ${input.nextStatus} = 'READY' then now() else ready_at end, picking_started_at = case when ${input.nextStatus} = 'PICKING' then now() else picking_started_at end, packed_at = case when ${input.nextStatus} = 'PACKED' then now() else packed_at end, version = version + 1, updated_at = now() where id = ${input.fulfillmentId}`.execute(
      transaction,
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: `fulfillment.fulfillment.${input.nextStatus.toLocaleLowerCase()}`,
      eventType: `fulfillment.${input.nextStatus.toLocaleLowerCase()}`,
      fulfillmentId: input.fulfillmentId,
    });
    return getFulfillment(transaction, {
      organizationId: input.organizationId,
      fulfillmentId: input.fulfillmentId,
    });
  });
}

export async function dispatchFulfillment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
    expectedVersion: number;
    idempotencyKey: string;
    fault?: () => void;
  },
): Promise<FulfillmentView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'fulfillment.dispatch',
      idempotencyKey: input.idempotencyKey,
      request: { fulfillmentId: input.fulfillmentId, expectedVersion: input.expectedVersion },
    });
    if (started.replay) {
      const replay = started.replay as { fulfillmentId: string };
      return getFulfillment(transaction, {
        organizationId: input.organizationId,
        fulfillmentId: replay.fulfillmentId,
      });
    }
    const current = await sql<{
      status: FulfillmentStatus;
      version: string;
    }>`select status, version::text from fulfillment.fulfillments where organization_id = ${input.organizationId} and id = ${input.fulfillmentId} for update`.execute(
      transaction,
    );
    const row = current.rows[0];
    if (!row) throw new FulfillmentDomainError('NOT_FOUND', 'Fulfillment was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new FulfillmentDomainError(
        'STALE_VERSION',
        'Fulfillment has changed; reload before dispatching.',
      );
    if (row.status !== 'PACKED')
      throw new FulfillmentDomainError(
        'INVALID_TRANSITION',
        'Only a packed fulfillment may be dispatched.',
      );
    const allocations = await sql<{
      fulfillment_line_id: string;
      reservation_allocation_id: string;
      quantity: string;
      quantity_consumed: string;
    }>`
      select allocation.fulfillment_line_id, allocation.reservation_allocation_id, line.quantity::text,
        allocation.quantity_consumed::text
      from inventory.fulfillment_inventory_allocations allocation
      join fulfillment.fulfillment_lines line on line.id = allocation.fulfillment_line_id
      where allocation.organization_id = ${input.organizationId} and line.fulfillment_id = ${input.fulfillmentId}
      order by allocation.reservation_allocation_id
      for update of allocation, line
    `.execute(transaction);
    for (const allocation of allocations.rows) {
      if (Number(allocation.quantity_consumed) !== 0)
        throw new FulfillmentDomainError('CONFLICT', 'Fulfillment inventory was already consumed.');
      try {
        const consumed = await consumeReservationAllocationInTransaction(transaction, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          reservationAllocationId: allocation.reservation_allocation_id,
          quantity: allocation.quantity,
          fulfillmentId: input.fulfillmentId,
        });
        await sql`update inventory.fulfillment_inventory_allocations set quantity_consumed = ${consumed.consumed}::numeric, inventory_transaction_id = ${consumed.inventoryTransactionId}::uuid, version = version + 1, updated_at = now() where fulfillment_line_id = ${allocation.fulfillment_line_id} and reservation_allocation_id = ${allocation.reservation_allocation_id}`.execute(
          transaction,
        );
      } catch (error) {
        if (error instanceof InventoryDomainError)
          throw new FulfillmentDomainError('CONFLICT', error.message);
        throw error;
      }
    }
    input.fault?.();
    await sql`update fulfillment.fulfillments set status = 'DISPATCHED', dispatched_at = now(), version = version + 1, updated_at = now() where id = ${input.fulfillmentId}`.execute(
      transaction,
    );
    await completeIdempotency(
      transaction,
      started.recordId!,
      'fulfillment.fulfillment',
      input.fulfillmentId,
      { fulfillmentId: input.fulfillmentId },
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'fulfillment.fulfillment.dispatched',
      eventType: 'fulfillment.dispatched',
      fulfillmentId: input.fulfillmentId,
      metadata: { physicalInventoryConsumed: true },
    });
    return getFulfillment(transaction, {
      organizationId: input.organizationId,
      fulfillmentId: input.fulfillmentId,
    });
  });
}

export async function cancelFulfillment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    fulfillmentId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<FulfillmentView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'fulfillment.cancel',
      idempotencyKey: input.idempotencyKey,
      request: { fulfillmentId: input.fulfillmentId, expectedVersion: input.expectedVersion },
    });
    if (started.replay) {
      const replay = started.replay as { fulfillmentId: string };
      return getFulfillment(transaction, {
        organizationId: input.organizationId,
        fulfillmentId: replay.fulfillmentId,
      });
    }
    const current = await sql<{
      status: FulfillmentStatus;
      version: string;
    }>`select status, version::text from fulfillment.fulfillments where organization_id = ${input.organizationId} and id = ${input.fulfillmentId} for update`.execute(
      transaction,
    );
    const row = current.rows[0];
    if (!row) throw new FulfillmentDomainError('NOT_FOUND', 'Fulfillment was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new FulfillmentDomainError(
        'STALE_VERSION',
        'Fulfillment has changed; reload before cancelling.',
      );
    if (row.status === 'DISPATCHED')
      throw new FulfillmentDomainError(
        'INVALID_TRANSITION',
        'Dispatched stock cannot be cancelled or restored automatically.',
      );
    if (row.status === 'CANCELLED') {
      await completeIdempotency(
        transaction,
        started.recordId!,
        'fulfillment.fulfillment',
        input.fulfillmentId,
        { fulfillmentId: input.fulfillmentId },
      );
      return getFulfillment(transaction, {
        organizationId: input.organizationId,
        fulfillmentId: input.fulfillmentId,
      });
    }
    await sql`update fulfillment.fulfillments set status = 'CANCELLED', cancelled_at = now(), version = version + 1, updated_at = now() where id = ${input.fulfillmentId}`.execute(
      transaction,
    );
    await completeIdempotency(
      transaction,
      started.recordId!,
      'fulfillment.fulfillment',
      input.fulfillmentId,
      { fulfillmentId: input.fulfillmentId },
    );
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'fulfillment.fulfillment.cancelled',
      eventType: 'fulfillment.cancelled',
      fulfillmentId: input.fulfillmentId,
    });
    return getFulfillment(transaction, {
      organizationId: input.organizationId,
      fulfillmentId: input.fulfillmentId,
    });
  });
}
