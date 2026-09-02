import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { recognizeCogsForDeliveredFulfillmentInTransaction } from './costing.js';

export type DeliveryOperationalStatus =
  'READY' | 'BOOKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type DeliveryOutcomeStatus =
  'PENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED_BEFORE_HANDOVER' | 'LOST' | 'DAMAGED';

export class DeliveryDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'INVALID_TRANSITION'
      | 'STALE_VERSION'
      | 'IDEMPOTENCY_CONFLICT'
      | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryDomainError';
  }
}

export interface DeliveryView {
  readonly id: string;
  readonly version: number;
  readonly deliveryNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly fulfillmentId: string;
  readonly fulfillmentNumber: string;
  readonly method: string;
  readonly operationalStatus: DeliveryOperationalStatus;
  readonly outcomeStatus: DeliveryOutcomeStatus;
  readonly recipient: { readonly name: string; readonly phone: string; readonly address: string };
  readonly cod: {
    readonly required: boolean;
    readonly expectedAmount: string;
    readonly currency: string;
  };
  readonly manualCarrierName?: string;
  readonly trackingReference?: string;
  readonly lines: readonly {
    readonly orderLineId: string;
    readonly sku: string;
    readonly quantity: string;
  }[];
  readonly events: readonly {
    readonly type: string;
    readonly source: string;
    readonly occurredAt: string;
  }[];
}

/** Safe to show on the secure checkout-confirmation route: no warehouse or courier internals. */
export interface PublicOrderFulfillmentStatus {
  readonly fulfillment: 'PREPARING' | 'DISPATCHED' | null;
  readonly delivery: 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | null;
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input);
}

function deliveryNumber(): string {
  return `DLV-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
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
      throw new DeliveryDomainError(
        'IDEMPOTENCY_CONFLICT',
        'The same delivery command is already in progress.',
      );
    }
    return { recordId: record.id };
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new DeliveryDomainError('IDEMPOTENCY_CONFLICT', error.message);
    throw error;
  }
}

async function completeIdempotency(
  db: Kysely<DatabaseSchema>,
  recordId: string,
  deliveryId: string,
): Promise<void> {
  await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'delivery.delivery', result_entity_id = ${deliveryId}::uuid, safe_response = ${JSON.stringify({ deliveryId })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
    db,
  );
}

async function appendEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    deliveryId: string;
    type: string;
    source?: 'MANUAL' | 'SYSTEM' | 'PROVIDER';
    metadata?: unknown;
  },
): Promise<void> {
  await sql`insert into delivery.delivery_events (organization_id, delivery_id, event_type, source, metadata) values (${input.organizationId}, ${input.deliveryId}, ${input.type}, ${input.source ?? 'MANUAL'}, ${JSON.stringify(input.metadata ?? {})}::jsonb)`.execute(
    db,
  );
}

async function emit(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    action: string;
    eventType: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'delivery.delivery',
    targetId: input.deliveryId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, ${input.eventType}, 1, 'delivery.delivery', ${input.deliveryId}::uuid, 1, ${JSON.stringify({ deliveryId: input.deliveryId })}::jsonb, now())`.execute(
    db,
  );
}

export async function getDelivery(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; deliveryId: string },
): Promise<DeliveryView> {
  const header = await sql<{
    id: string;
    version: string;
    delivery_number: string;
    order_id: string;
    order_number: string;
    fulfillment_id: string;
    fulfillment_number: string;
    method: string;
    operational_status: DeliveryOperationalStatus;
    outcome_status: DeliveryOutcomeStatus;
    recipient_name: string;
    recipient_phone: string;
    address_snapshot: {
      addressLine1?: string;
      addressLine2?: string;
      area?: string;
      city?: string;
      district?: string;
      postalCode?: string;
      countryCode?: string;
    };
    cod_required: boolean;
    cod_expected_amount: string;
    currency_code: string;
    manual_carrier_name: string | null;
    tracking_reference: string | null;
  }>`
    select delivery.id, delivery.version::text, delivery.delivery_number, delivery.order_id, order_row.order_number,
      delivery.fulfillment_id, fulfillment.fulfillment_number, method.name as method,
      delivery.operational_status, delivery.outcome_status, delivery.recipient_name, delivery.recipient_phone,
      delivery.address_snapshot, delivery.cod_required, delivery.cod_expected_amount::text, delivery.currency_code,
      delivery.manual_carrier_name, delivery.tracking_reference
    from delivery.deliveries delivery
    join orders.orders order_row on order_row.id = delivery.order_id
    join fulfillment.fulfillments fulfillment on fulfillment.id = delivery.fulfillment_id
    join delivery.delivery_methods method on method.id = delivery.delivery_method_id
    where delivery.organization_id = ${input.organizationId} and delivery.id = ${input.deliveryId}
  `.execute(db);
  const row = header.rows[0];
  if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Delivery was not found.');
  const address = [
    row.address_snapshot.addressLine1,
    row.address_snapshot.addressLine2,
    row.address_snapshot.area,
    row.address_snapshot.city,
    row.address_snapshot.district,
    row.address_snapshot.postalCode,
    row.address_snapshot.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
  const lines = await sql<{ order_line_id: string; sku_snapshot: string; quantity: string }>`
    select delivery_line.order_line_id, order_line.sku_snapshot, delivery_line.quantity::text
    from delivery.delivery_lines delivery_line
    join orders.order_lines order_line on order_line.id = delivery_line.order_line_id
    where delivery_line.organization_id = ${input.organizationId} and delivery_line.delivery_id = ${row.id}
    order by delivery_line.created_at asc, delivery_line.id asc
  `.execute(db);
  const events = await sql<{ event_type: string; source: string; occurred_at: Date }>`
    select event_type, source, occurred_at from delivery.delivery_events
    where organization_id = ${input.organizationId} and delivery_id = ${row.id}
    order by occurred_at asc, id asc
  `.execute(db);
  return {
    id: row.id,
    version: Number(row.version),
    deliveryNumber: row.delivery_number,
    orderId: row.order_id,
    orderNumber: row.order_number,
    fulfillmentId: row.fulfillment_id,
    fulfillmentNumber: row.fulfillment_number,
    method: row.method,
    operationalStatus: row.operational_status,
    outcomeStatus: row.outcome_status,
    recipient: { name: row.recipient_name, phone: row.recipient_phone, address },
    cod: {
      required: row.cod_required,
      expectedAmount: row.cod_expected_amount,
      currency: row.currency_code,
    },
    ...(row.manual_carrier_name ? { manualCarrierName: row.manual_carrier_name } : {}),
    ...(row.tracking_reference ? { trackingReference: row.tracking_reference } : {}),
    lines: lines.rows.map((line) => ({
      orderLineId: line.order_line_id,
      sku: line.sku_snapshot,
      quantity: line.quantity,
    })),
    events: events.rows.map((event) => ({
      type: event.event_type,
      source: event.source,
      occurredAt: event.occurred_at.toISOString(),
    })),
  };
}

export async function listDeliveries(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly DeliveryView[]> {
  const ids = await sql<{
    id: string;
  }>`select id from delivery.deliveries where organization_id = ${organizationId} order by created_at desc, id desc limit 100`.execute(
    db,
  );
  return Promise.all(
    ids.rows.map((row) => getDelivery(db, { organizationId, deliveryId: row.id })),
  );
}

export async function getPublicOrderFulfillmentStatus(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string },
): Promise<PublicOrderFulfillmentStatus> {
  const fulfillment = await sql<{ status: string }>`
    select status from fulfillment.fulfillments
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
    order by dispatched_at desc nulls last, created_at desc, id desc limit 1
  `.execute(db);
  const delivery = await sql<{ operational_status: DeliveryOperationalStatus }>`
    select operational_status from delivery.deliveries
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
    order by updated_at desc, id desc limit 1
  `.execute(db);
  const fulfillmentStatus = fulfillment.rows[0]?.status;
  const deliveryStatus = delivery.rows[0]?.operational_status;
  return {
    fulfillment: fulfillmentStatus
      ? fulfillmentStatus === 'DISPATCHED'
        ? 'DISPATCHED'
        : 'PREPARING'
      : null,
    delivery: deliveryStatus
      ? deliveryStatus === 'DELIVERED'
        ? 'DELIVERED'
        : deliveryStatus === 'FAILED'
          ? 'FAILED'
          : deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'HANDED_OVER'
            ? 'IN_TRANSIT'
            : 'PREPARING'
      : null,
  };
}

export async function createDelivery(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; fulfillmentId: string; idempotencyKey: string },
): Promise<DeliveryView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.create',
      idempotencyKey: input.idempotencyKey,
      request: { fulfillmentId: input.fulfillmentId },
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const source = await sql<{
      order_id: string;
      order_number: string;
      payment_method: string;
      total_amount: string;
      currency_code: string;
      status: string;
      recipient_name: string;
      phone: string;
      address_line_1: string;
      address_line_2: string | null;
      area: string | null;
      city: string | null;
      district: string | null;
      postal_code: string | null;
      country_code: string;
    }>`
      select fulfillment.order_id, order_row.order_number, order_row.payment_method, order_row.total_amount::text,
        order_row.currency_code, fulfillment.status, address.recipient_name, address.phone,
        address.address_line_1, address.address_line_2, address.area, address.city, address.district,
        address.postal_code, address.country_code
      from fulfillment.fulfillments fulfillment
      join orders.orders order_row on order_row.id = fulfillment.order_id
      join orders.order_addresses address on address.order_id = order_row.id and address.address_type = 'DELIVERY'
      where fulfillment.organization_id = ${input.organizationId} and fulfillment.id = ${input.fulfillmentId}
      for update of fulfillment
    `.execute(transaction);
    const row = source.rows[0];
    if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Dispatched fulfillment was not found.');
    if (row.status !== 'DISPATCHED')
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'A Delivery can be created only after physical fulfillment dispatch.',
      );
    // Organizations created after the forward-only migration still need the
    // documented V1 delivery method. This mirrors migration backfill only.
    await sql`insert into delivery.delivery_methods (organization_id, code, name, method_type) values (${input.organizationId}, 'HOME_DELIVERY', 'Home delivery', 'HOME_DELIVERY') on conflict (organization_id, code) do nothing`.execute(
      transaction,
    );
    const method = await sql<{
      id: string;
    }>`select id from delivery.delivery_methods where organization_id = ${input.organizationId} and code = 'HOME_DELIVERY' and status = 'ACTIVE' for update`.execute(
      transaction,
    );
    if (!method.rows[0])
      throw new DeliveryDomainError(
        'CONFLICT',
        'Home delivery is not enabled for this organization.',
      );
    const created = await sql<{ id: string }>`
      insert into delivery.deliveries (organization_id, delivery_number, order_id, fulfillment_id, delivery_method_id, recipient_name, recipient_phone, address_snapshot, currency_code, cod_required, cod_expected_amount, created_by_actor_id)
      values (${input.organizationId}, ${deliveryNumber()}, ${row.order_id}, ${input.fulfillmentId}, ${method.rows[0].id}, ${row.recipient_name}, ${row.phone}, ${JSON.stringify({ addressLine1: row.address_line_1, addressLine2: row.address_line_2, area: row.area, city: row.city, district: row.district, postalCode: row.postal_code, countryCode: row.country_code })}::jsonb, ${row.currency_code}, ${row.payment_method === 'COD'}, ${row.payment_method === 'COD' ? row.total_amount : '0'}::numeric, ${input.actorId})
      returning id
    `.execute(transaction);
    const deliveryId = created.rows[0]?.id;
    if (!deliveryId) throw new Error('Delivery creation did not return an id.');
    const lines = await sql<{
      fulfillment_line_id: string;
      order_line_id: string;
      quantity: string;
    }>`select id as fulfillment_line_id, order_line_id, quantity::text from fulfillment.fulfillment_lines where organization_id = ${input.organizationId} and fulfillment_id = ${input.fulfillmentId}`.execute(
      transaction,
    );
    for (const line of lines.rows) {
      const deliveryLine = await sql<{
        id: string;
      }>`insert into delivery.delivery_lines (organization_id, delivery_id, fulfillment_line_id, order_line_id, quantity) values (${input.organizationId}, ${deliveryId}, ${line.fulfillment_line_id}, ${line.order_line_id}, ${line.quantity}::numeric) returning id`.execute(
        transaction,
      );
      // V1 creates one operational package that contains each Fulfillment line.
      if (line === lines.rows[0]) {
        await sql`insert into delivery.delivery_packages (organization_id, delivery_id, declared_value, currency_code) values (${input.organizationId}, ${deliveryId}, ${row.total_amount}::numeric, ${row.currency_code})`.execute(
          transaction,
        );
      }
      const packageRow = await sql<{
        id: string;
      }>`select id from delivery.delivery_packages where delivery_id = ${deliveryId} and package_number = 1`.execute(
        transaction,
      );
      await sql`insert into delivery.delivery_package_lines (package_id, delivery_line_id, quantity) values (${packageRow.rows[0]!.id}, ${deliveryLine.rows[0]!.id}, ${line.quantity}::numeric)`.execute(
        transaction,
      );
    }
    if (row.payment_method === 'COD')
      await sql`insert into delivery.cod_collection_instructions (organization_id, delivery_id, version_number, currency_code, expected_amount) values (${input.organizationId}, ${deliveryId}, 1, ${row.currency_code}, ${row.total_amount}::numeric)`.execute(
        transaction,
      );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId,
      type: 'CREATED',
    });
    await completeIdempotency(transaction, started.recordId!, deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId,
      action: 'delivery.delivery.created',
      eventType: 'delivery.created',
      metadata: { fulfillmentId: input.fulfillmentId, codRequired: row.payment_method === 'COD' },
    });
    return getDelivery(transaction, { organizationId: input.organizationId, deliveryId });
  });
}

async function lockDelivery(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; deliveryId: string; expectedVersion: number },
): Promise<{ status: DeliveryOperationalStatus; version: string }> {
  const current = await sql<{
    operational_status: DeliveryOperationalStatus;
    version: string;
  }>`select operational_status, version::text from delivery.deliveries where organization_id = ${input.organizationId} and id = ${input.deliveryId} for update`.execute(
    db,
  );
  const row = current.rows[0];
  if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Delivery was not found.');
  if (Number(row.version) !== input.expectedVersion)
    throw new DeliveryDomainError('STALE_VERSION', 'Delivery has changed; reload before updating.');
  return { status: row.operational_status, version: row.version };
}

export async function recordManualCourierBooking(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    carrierName: string;
    trackingReference: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (!input.carrierName.trim() || !input.trackingReference.trim())
    throw new DeliveryDomainError(
      'VALIDATION_FAILED',
      'Manual carrier and tracking reference are required.',
    );
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.manual-booking',
      idempotencyKey: input.idempotencyKey,
      request: {
        deliveryId: input.deliveryId,
        expectedVersion: input.expectedVersion,
        carrierName: input.carrierName,
        trackingReference: input.trackingReference,
      },
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await lockDelivery(transaction, input);
    if (current.status !== 'READY')
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'Only a ready Delivery can receive a manual courier booking.',
      );
    // lockDelivery already serializes operations on this Delivery. PostgreSQL
    // intentionally disallows FOR UPDATE on an aggregate query.
    const number = await sql<{
      next: string;
    }>`select (coalesce(max(booking_sequence), 0) + 1)::text as next from delivery.courier_bookings where organization_id = ${input.organizationId} and delivery_id = ${input.deliveryId}`.execute(
      transaction,
    );
    await sql`insert into delivery.courier_bookings (organization_id, delivery_id, provider_code, booking_sequence, status, merchant_reference, external_consignment_id, tracking_number, requested_cod_amount) select ${input.organizationId}, id, 'MANUAL', ${Number(number.rows[0]!.next)}, 'BOOKED', delivery_number || '-M' || ${number.rows[0]!.next}, ${input.trackingReference.trim()}, ${input.trackingReference.trim()}, cod_expected_amount from delivery.deliveries where id = ${input.deliveryId}`.execute(
      transaction,
    );
    await sql`update delivery.deliveries set operational_status = 'BOOKED', manual_carrier_name = ${input.carrierName.trim()}, tracking_reference = ${input.trackingReference.trim()}, version = version + 1, updated_at = now() where id = ${input.deliveryId}`.execute(
      transaction,
    );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'MANUAL_BOOKED',
      metadata: { carrierName: input.carrierName.trim() },
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.delivery.manual_booked',
      eventType: 'delivery.manual_booked',
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export async function dispatchDelivery(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.dispatch',
      idempotencyKey: input.idempotencyKey,
      request: { deliveryId: input.deliveryId, expectedVersion: input.expectedVersion },
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await lockDelivery(transaction, input);
    if (current.status !== 'BOOKED')
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'Only a booked Delivery can be handed over.',
      );
    await sql`update delivery.deliveries set operational_status = 'IN_TRANSIT', handed_over_at = now(), version = version + 1, updated_at = now() where id = ${input.deliveryId}`.execute(
      transaction,
    );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'HANDED_OVER',
    });
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'IN_TRANSIT',
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.delivery.dispatched',
      eventType: 'delivery.dispatched',
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

async function recordOutcome(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    idempotencyKey: string;
    kind: 'DELIVERED' | 'FAILED';
    reasonCode?: string;
    note?: string;
    fault?: () => void;
  },
): Promise<DeliveryView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: `delivery.${input.kind.toLowerCase()}`,
      idempotencyKey: input.idempotencyKey,
      request: {
        deliveryId: input.deliveryId,
        expectedVersion: input.expectedVersion,
        reasonCode: input.reasonCode,
        note: input.note,
      },
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await lockDelivery(transaction, input);
    if (current.status !== 'IN_TRANSIT')
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'Only an in-transit Delivery can receive a final customer outcome.',
      );
    // The Delivery row lock above also makes attempt numbering deterministic.
    const attempt = await sql<{
      next: string;
    }>`select (coalesce(max(attempt_number), 0) + 1)::text as next from delivery.delivery_attempts where organization_id = ${input.organizationId} and delivery_id = ${input.deliveryId}`.execute(
      transaction,
    );
    const outcome = input.kind === 'DELIVERED' ? 'DELIVERED' : 'OTHER_FAILED';
    await sql`insert into delivery.delivery_attempts (organization_id, delivery_id, attempt_number, outcome, reason_code, notes) values (${input.organizationId}, ${input.deliveryId}, ${Number(attempt.rows[0]!.next)}, ${outcome}, ${input.reasonCode ?? null}, ${input.note ?? null})`.execute(
      transaction,
    );
    if (input.kind === 'DELIVERED') {
      await sql`update delivery.delivery_lines set delivered_quantity = quantity, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and delivery_id = ${input.deliveryId}`.execute(
        transaction,
      );
      await sql`update delivery.deliveries set operational_status = 'DELIVERED', outcome_status = 'DELIVERED', delivered_at = now(), version = version + 1, updated_at = now() where id = ${input.deliveryId}`.execute(
        transaction,
      );
      const deliveryInfo = await sql<{
        fulfillment_id: string;
        order_id: string;
      }>`select fulfillment_id, order_id from delivery.deliveries where id = ${input.deliveryId}`.execute(
        transaction,
      );
      await recognizeCogsForDeliveredFulfillmentInTransaction(transaction, {
        organizationId: input.organizationId,
        fulfillmentId: deliveryInfo.rows[0]!.fulfillment_id,
      });

      const undelivered = await sql<{ count: string }>`
        select count(*)::text as count
        from orders.order_lines ol
        where ol.order_id = ${deliveryInfo.rows[0]!.order_id}
          and (
            select coalesce(sum(dl.delivered_quantity), 0)
            from delivery.delivery_lines dl
            join delivery.deliveries d on d.id = dl.delivery_id
            where dl.order_line_id = ol.id
              and d.outcome_status = 'DELIVERED'
          ) < ol.quantity
      `.execute(transaction);

      if (Number(undelivered.rows[0]?.count ?? 1) === 0) {
        await sql`
          insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
          values (${input.organizationId}, 'delivery.all_lines_delivered', 1, 'orders.order', ${deliveryInfo.rows[0]!.order_id}, 1,
            ${JSON.stringify({ orderId: deliveryInfo.rows[0]!.order_id, deliveryId: input.deliveryId })}::jsonb, now())
        `.execute(transaction);
      }
    } else {
      await sql`update delivery.delivery_lines set failed_quantity = quantity, version = version + 1, updated_at = now() where organization_id = ${input.organizationId} and delivery_id = ${input.deliveryId}`.execute(
        transaction,
      );
      await sql`update delivery.deliveries set operational_status = 'FAILED', outcome_status = 'FAILED', failed_at = now(), version = version + 1, updated_at = now() where id = ${input.deliveryId}`.execute(
        transaction,
      );
    }
    input.fault?.();
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: input.kind,
      metadata: input.reasonCode ? { reasonCode: input.reasonCode } : {},
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: `delivery.delivery.${input.kind.toLowerCase()}`,
      eventType: `delivery.${input.kind.toLowerCase()}`,
      metadata: input.reasonCode ? { reasonCode: input.reasonCode } : {},
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export async function markDelivered(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    idempotencyKey: string;
    note?: string;
    fault?: () => void;
  },
): Promise<DeliveryView> {
  return recordOutcome(db, { ...input, kind: 'DELIVERED' });
}

export async function markDeliveryFailed(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reasonCode: string;
    note?: string;
    fault?: () => void;
  },
): Promise<DeliveryView> {
  if (!input.reasonCode.trim())
    throw new DeliveryDomainError('VALIDATION_FAILED', 'A delivery failure reason is required.');
  return recordOutcome(db, { ...input, kind: 'FAILED' });
}
