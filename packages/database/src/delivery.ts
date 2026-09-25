import { sql, type Kysely } from 'kysely';
import type { CourierBookingRequest } from '@maevelle/core';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { getOrderPaymentSummary } from './payments.js';
import { recognizeCogsForDeliveredFulfillmentInTransaction } from './costing.js';
import { dispatchFulfillmentInTransaction, FulfillmentDomainError } from './fulfillment.js';
import { ingestProviderEvent } from './notifications.js';

export type DeliveryOperationalStatus =
  | 'READY'
  | 'BOOKING'
  | 'BOOKED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RTO_INITIATED'
  | 'RETURNING'
  | 'RETURNED_TO_ORIGIN'
  | 'LOST'
  | 'DAMAGED';
export type DeliveryOutcomeStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED_BEFORE_HANDOVER'
  | 'LOST'
  | 'DAMAGED'
  | 'RETURNED_TO_ORIGIN';

export type DeliveryAttemptOutcome =
  | 'DELIVERED'
  | 'CUSTOMER_UNAVAILABLE'
  | 'CUSTOMER_REFUSED'
  | 'ADDRESS_NOT_FOUND'
  | 'RESCHEDULE_REQUESTED'
  | 'PHONE_UNREACHABLE'
  | 'PROVIDER_FAILURE'
  | 'OTHER_FAILED';

export type ProviderTrackingStatus =
  | 'BOOKED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'ATTEMPT_FAILED'
  | 'FAILED'
  | 'RTO_INITIATED'
  | 'RETURNING'
  | 'RETURNED_TO_ORIGIN'
  | 'LOST'
  | 'DAMAGED'
  | 'CANCELLED';

function providerTransitionAllowed(
  current: DeliveryOperationalStatus,
  next: ProviderTrackingStatus,
): boolean {
  if (current === next) return true;
  const allowed: Partial<Record<DeliveryOperationalStatus, readonly string[]>> = {
    BOOKED: ['HANDED_OVER', 'IN_TRANSIT', 'CANCELLED'],
    HANDED_OVER: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'LOST', 'DAMAGED'],
    IN_TRANSIT: ['OUT_FOR_DELIVERY', 'LOST', 'DAMAGED'],
    OUT_FOR_DELIVERY: ['LOST', 'DAMAGED'],
    FAILED: ['RTO_INITIATED'],
    RTO_INITIATED: ['RETURNING', 'RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'],
    RETURNING: ['RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'],
  };
  return allowed[current]?.includes(next) ?? false;
}

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
  readonly activeBooking?: {
    readonly id: string;
    readonly providerCode: string;
    readonly status: string;
    readonly externalConsignmentId?: string;
    readonly trackingNumber?: string;
  };
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
  readonly attempts: readonly {
    readonly attemptNumber: number;
    readonly outcome: DeliveryAttemptOutcome;
    readonly reasonCode?: string;
    readonly note?: string;
    readonly attemptedAt: string;
    readonly nextAttemptAt?: string;
  }[];
  readonly exceptions: readonly {
    readonly id: string;
    readonly type: string;
    readonly severity: string;
    readonly summary: string;
    readonly createdAt: string;
  }[];
  readonly claims: readonly {
    readonly id: string;
    readonly version: number;
    readonly claimNumber: string;
    readonly reason: string;
    readonly status: string;
    readonly claimedAmount?: string;
    readonly approvedAmount?: string;
    readonly currency: string;
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
    courierBookingId?: string;
    providerStatusRaw?: string;
    providerEventId?: string;
    normalizedStatus?: string;
    occurredAt?: Date;
    metadata?: unknown;
  },
): Promise<void> {
  await sql`insert into delivery.delivery_events (organization_id, delivery_id, courier_booking_id, event_type, normalized_status, provider_status_raw, provider_event_id, occurred_at, source, metadata) values (${input.organizationId}, ${input.deliveryId}, ${input.courierBookingId ?? null}, ${input.type}, ${input.normalizedStatus ?? null}, ${input.providerStatusRaw ?? null}, ${input.providerEventId ?? null}, ${input.occurredAt ?? new Date()}, ${input.source ?? 'MANUAL'}, ${JSON.stringify(input.metadata ?? {})}::jsonb)`.execute(
    db,
  );
}

async function emit(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    actorType?: 'USER' | 'SYSTEM';
    deliveryId: string;
    action: string;
    eventType: string;
    metadata?: unknown;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: input.actorType ?? 'USER',
    ...(input.actorId ? { actorId: input.actorId } : {}),
    action: input.action,
    targetType: 'delivery.delivery',
    targetId: input.deliveryId,
    metadata: input.metadata,
  });
  await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    select delivery.organization_id,${input.eventType},1,'delivery.delivery',delivery.id,delivery.version,
      jsonb_build_object('deliveryId',delivery.id,'orderId',delivery.order_id),now()
    from delivery.deliveries delivery
    where delivery.organization_id=${input.organizationId} and delivery.id=${input.deliveryId}`.execute(
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
  const [events, bookings, attempts, exceptions, claims] = await Promise.all([
    sql<{ event_type: string; source: string; occurred_at: Date }>`
    select event_type, source, occurred_at from delivery.delivery_events
    where organization_id = ${input.organizationId} and delivery_id = ${row.id}
    order by occurred_at asc, id asc
  `.execute(db),
    sql<{
      id: string;
      provider_code: string;
      status: string;
      external_consignment_id: string | null;
      tracking_number: string | null;
    }>`select id, provider_code, status, external_consignment_id, tracking_number
      from delivery.courier_bookings
      where organization_id=${input.organizationId} and delivery_id=${row.id}
        and status in ('PENDING','BOOKED','CANCELLATION_PENDING','UNKNOWN_OUTCOME')
      order by booking_sequence desc limit 1`.execute(db),
    sql<{
      attempt_number: number;
      outcome: DeliveryAttemptOutcome;
      reason_code: string | null;
      notes: string | null;
      attempted_at: Date;
      next_attempt_at: Date | null;
    }>`select attempt_number, outcome, reason_code, notes, attempted_at, next_attempt_at
      from delivery.delivery_attempts
      where organization_id=${input.organizationId} and delivery_id=${row.id}
      order by attempt_number asc`.execute(db),
    sql<{
      id: string;
      exception_type: string;
      severity: string;
      summary: string;
      created_at: Date;
    }>`select id, exception_type, severity, summary, created_at
      from delivery.delivery_exceptions
      where organization_id=${input.organizationId} and delivery_id=${row.id} and status='OPEN'
      order by created_at desc`.execute(db),
    sql<{
      id: string;
      version: string;
      claim_number: string;
      reason: string;
      status: string;
      claimed_amount: string | null;
      approved_amount: string | null;
      currency_code: string;
    }>`select id,version::text,claim_number,reason,status,claimed_amount::text,approved_amount::text,currency_code
      from delivery.delivery_claims
      where organization_id=${input.organizationId} and delivery_id=${row.id}
      order by created_at desc,id desc`.execute(db),
  ]);
  const activeBooking = bookings.rows[0];
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
    ...(activeBooking
      ? {
          activeBooking: {
            id: activeBooking.id,
            providerCode: activeBooking.provider_code,
            status: activeBooking.status,
            ...(activeBooking.external_consignment_id
              ? { externalConsignmentId: activeBooking.external_consignment_id }
              : {}),
            ...(activeBooking.tracking_number
              ? { trackingNumber: activeBooking.tracking_number }
              : {}),
          },
        }
      : {}),
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
    attempts: attempts.rows.map((attempt) => ({
      attemptNumber: attempt.attempt_number,
      outcome: attempt.outcome,
      ...(attempt.reason_code ? { reasonCode: attempt.reason_code } : {}),
      ...(attempt.notes ? { note: attempt.notes } : {}),
      attemptedAt: attempt.attempted_at.toISOString(),
      ...(attempt.next_attempt_at ? { nextAttemptAt: attempt.next_attempt_at.toISOString() } : {}),
    })),
    exceptions: exceptions.rows.map((exception) => ({
      id: exception.id,
      type: exception.exception_type,
      severity: exception.severity,
      summary: exception.summary,
      createdAt: exception.created_at.toISOString(),
    })),
    claims: claims.rows.map((claim) => ({
      id: claim.id,
      version: Number(claim.version),
      claimNumber: claim.claim_number,
      reason: claim.reason,
      status: claim.status,
      ...(claim.claimed_amount ? { claimedAmount: claim.claimed_amount } : {}),
      ...(claim.approved_amount ? { approvedAmount: claim.approved_amount } : {}),
      currency: claim.currency_code,
    })),
  };
}

export async function listDeliveries(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly DeliveryView[]> {
  return (await listDeliveryPage(db, organizationId, { pageSize: 100 })).items;
}

export async function listDeliveryPage(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly search?: string;
    readonly status?: DeliveryOperationalStatus;
  } = {},
): Promise<{
  readonly items: readonly DeliveryView[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() || null;
  const status = filters.status ?? null;
  const [ids, total] = await Promise.all([
    sql<{ id: string }>`select delivery.id
      from delivery.deliveries delivery
      join orders.orders order_row on order_row.id=delivery.order_id and order_row.organization_id=delivery.organization_id
      where delivery.organization_id=${organizationId}
        and (${status}::text is null or delivery.operational_status=${status})
        and (${search}::text is null or delivery.delivery_number ilike '%'||${search}||'%'
          or order_row.order_number ilike '%'||${search}||'%'
          or coalesce(delivery.tracking_reference,'') ilike '%'||${search}||'%'
          or delivery.recipient_name ilike '%'||${search}||'%'
          or delivery.recipient_phone ilike '%'||${search}||'%')
      order by delivery.created_at desc,delivery.id desc
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from delivery.deliveries delivery
      join orders.orders order_row on order_row.id=delivery.order_id and order_row.organization_id=delivery.organization_id
      where delivery.organization_id=${organizationId}
        and (${status}::text is null or delivery.operational_status=${status})
        and (${search}::text is null or delivery.delivery_number ilike '%'||${search}||'%'
          or order_row.order_number ilike '%'||${search}||'%'
          or coalesce(delivery.tracking_reference,'') ilike '%'||${search}||'%'
          or delivery.recipient_name ilike '%'||${search}||'%'
          or delivery.recipient_phone ilike '%'||${search}||'%')`.execute(db),
  ]);
  const totalItems = Number(total.rows[0]?.total ?? 0);
  const items = await Promise.all(
    ids.rows.map((row) => getDelivery(db, { organizationId, deliveryId: row.id })),
  );
  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
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
    if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Packed fulfillment was not found.');
    if (!['PACKED', 'DISPATCHED'].includes(row.status))
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'A Delivery can be prepared only for a packed or dispatched fulfillment.',
      );
    const paymentSummary =
      row.payment_method === 'COD'
        ? await getOrderPaymentSummary(transaction, {
            organizationId: input.organizationId,
            orderId: row.order_id,
            paymentMethod: 'COD',
            expectedAmount: row.total_amount,
          })
        : undefined;
    const codExpectedAmount = paymentSummary?.outstanding ?? '0';
    const codRequired = Number(codExpectedAmount) > 0;
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
      values (${input.organizationId}, ${deliveryNumber()}, ${row.order_id}, ${input.fulfillmentId}, ${method.rows[0].id}, ${row.recipient_name}, ${row.phone}, ${JSON.stringify({ addressLine1: row.address_line_1, addressLine2: row.address_line_2, area: row.area, city: row.city, district: row.district, postalCode: row.postal_code, countryCode: row.country_code })}::jsonb, ${row.currency_code}, ${codRequired}, ${codExpectedAmount}::numeric, ${input.actorId})
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
    if (codRequired)
      await sql`insert into delivery.cod_collection_instructions (organization_id, delivery_id, version_number, currency_code, expected_amount) values (${input.organizationId}, ${deliveryId}, 1, ${row.currency_code}, ${codExpectedAmount}::numeric)`.execute(
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
      metadata: { fulfillmentId: input.fulfillmentId, codRequired, codExpectedAmount },
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

export interface CourierIntegrationAccountView {
  readonly id: string;
  readonly providerCode: string;
  readonly name: string;
  readonly capabilities: Record<string, boolean>;
}

export async function listCourierIntegrationAccounts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly CourierIntegrationAccountView[]> {
  const rows = await sql<{
    id: string;
    provider_code: string;
    name: string;
    non_secret_config: { capabilities?: Record<string, boolean> };
  }>`select account.id,integration.provider_code,account.name,account.non_secret_config
    from integrations.integration_accounts account
    join integrations.integrations integration on integration.id=account.integration_id and integration.organization_id=account.organization_id
    where account.organization_id=${organizationId} and account.status='ACTIVE'
      and integration.status='ACTIVE' and integration.integration_type='COURIER'
    order by integration.provider_code,account.name`.execute(db);
  return rows.rows.map((row) => ({
    id: row.id,
    providerCode: row.provider_code,
    name: row.name,
    capabilities: row.non_secret_config.capabilities ?? {},
  }));
}

export async function getCourierQuoteRequest(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    deliveryId: string;
    integrationAccountId: string;
    packageWeightKg?: string;
  },
): Promise<{ providerCode: string; request: CourierBookingRequest }> {
  if (
    input.packageWeightKg !== undefined &&
    (!/^\d+(?:\.\d{1,6})?$/.test(input.packageWeightKg) || Number(input.packageWeightKg) <= 0)
  )
    throw new DeliveryDomainError(
      'VALIDATION_FAILED',
      'Package weight must be a positive number of kilograms.',
    );
  const result = await sql<{
    provider_code: string;
    delivery_id: string;
    delivery_number: string;
    recipient_name: string;
    recipient_phone: string;
    address_snapshot: Record<string, string | null>;
    cod_required: boolean;
    cod_expected_amount: string;
    currency_code: string;
    location_id: string;
    provider_location_id: string | null;
    item_quantity: string;
    item_description: string;
    packages: {
      packageNumber: number;
      weightValue: string | null;
      weightUnit: 'KG';
      lengthValue: string | null;
      widthValue: string | null;
      heightValue: string | null;
      dimensionUnit: 'CM' | 'IN';
      declaredValue: string | null;
    }[];
  }>`select integration.provider_code,delivery.id as delivery_id,delivery.delivery_number,
      delivery.recipient_name,delivery.recipient_phone,delivery.address_snapshot,delivery.cod_required,
      delivery.cod_expected_amount::text,delivery.currency_code,fulfillment.location_id,
      coalesce(mapped_store.external_store_id,fallback_store.external_store_id) as provider_location_id,
      coalesce((select sum(delivery_line.quantity)::text from delivery.delivery_lines delivery_line
        where delivery_line.delivery_id=delivery.id),'1') as item_quantity,
      coalesce((select string_agg(order_line.sku_snapshot || ' x' || delivery_line.quantity::text,', ' order by order_line.sku_snapshot)
        from delivery.delivery_lines delivery_line join orders.order_lines order_line on order_line.id=delivery_line.order_line_id
        where delivery_line.delivery_id=delivery.id),delivery.delivery_number) as item_description,
      coalesce((select jsonb_agg(jsonb_build_object(
        'packageNumber',package.package_number,'weightValue',package.weight_value::text,
        'weightUnit',package.weight_unit,'lengthValue',package.length_value::text,
        'widthValue',package.width_value::text,'heightValue',package.height_value::text,
        'dimensionUnit',package.dimension_unit,'declaredValue',package.declared_value::text
      ) order by package.package_number) from delivery.delivery_packages package
        where package.delivery_id=delivery.id),'[]'::jsonb) as packages
    from delivery.deliveries delivery
    join fulfillment.fulfillments fulfillment on fulfillment.id=delivery.fulfillment_id
      and fulfillment.organization_id=delivery.organization_id
    join integrations.integration_accounts account on account.id=${input.integrationAccountId}::uuid
      and account.organization_id=delivery.organization_id and account.status='ACTIVE'
    join integrations.integrations integration on integration.id=account.integration_id
      and integration.organization_id=account.organization_id and integration.status='ACTIVE'
      and integration.integration_type='COURIER'
    left join integrations.courier_pickup_store_mappings store_mapping
      on store_mapping.organization_id=delivery.organization_id
      and store_mapping.integration_account_id=account.id and store_mapping.location_id=fulfillment.location_id
    left join integrations.courier_provider_stores mapped_store
      on mapped_store.id=store_mapping.provider_store_id and mapped_store.organization_id=store_mapping.organization_id
      and mapped_store.is_active
    left join lateral (
      select provider_store.external_store_id from integrations.courier_provider_stores provider_store
      where provider_store.organization_id=delivery.organization_id
        and provider_store.integration_account_id=account.id and provider_store.is_active
        and (provider_store.is_default or (select count(*) from integrations.courier_provider_stores candidate
          where candidate.integration_account_id=account.id and candidate.is_active)=1)
      order by provider_store.is_default desc,provider_store.name limit 1
    ) fallback_store on mapped_store.id is null
    where delivery.organization_id=${input.organizationId} and delivery.id=${input.deliveryId}::uuid`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row)
    throw new DeliveryDomainError('NOT_FOUND', 'Delivery or active courier account was not found.');
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
  return {
    providerCode: row.provider_code,
    request: {
      deliveryId: row.delivery_id,
      merchantReference: row.delivery_number,
      pickup: {
        locationId: row.location_id,
        ...(row.provider_location_id ? { providerLocationId: row.provider_location_id } : {}),
      },
      recipient: { name: row.recipient_name, phone: row.recipient_phone, address },
      cod: {
        required: row.cod_required,
        expectedAmount: row.cod_expected_amount,
        currency: row.currency_code,
      },
      packages: row.packages.map((item) => ({
        packageNumber: item.packageNumber,
        ...(input.packageWeightKg
          ? { weight: { value: input.packageWeightKg, unit: 'KG' as const } }
          : item.weightValue
            ? { weight: { value: item.weightValue, unit: item.weightUnit } }
            : {}),
        ...(item.lengthValue && item.widthValue && item.heightValue
          ? {
              dimensions: {
                length: item.lengthValue,
                width: item.widthValue,
                height: item.heightValue,
                unit: item.dimensionUnit,
              },
            }
          : {}),
        ...(item.declaredValue ? { declaredValue: item.declaredValue } : {}),
      })),
      contents: {
        quantity: Math.max(1, Math.ceil(Number(row.item_quantity))),
        description: row.item_description.slice(0, 120),
      },
    },
  };
}

export async function recordCourierQuote(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    deliveryId: string;
    integrationAccountId: string;
    providerCode: string;
    request: CourierBookingRequest;
    quote: {
      amount: string;
      currency: string;
      baseAmount?: string;
      discountAmount?: string;
      codFeeAmount?: string;
      additionalChargeAmount?: string;
      providerQuoteReference?: string;
      metadata?: Readonly<Record<string, string | number | boolean | null>>;
      expiresAt?: string;
    };
  },
): Promise<{ id: string; quotedAt: string }> {
  const result = await sql<{ id: string; quoted_at: Date }>`insert into delivery.courier_quotes
    (organization_id,delivery_id,integration_account_id,provider_code,currency_code,base_amount,
      discount_amount,cod_fee_amount,additional_charge_amount,final_amount,provider_quote_reference,
      request_snapshot,provider_metadata,expires_at)
    values (${input.organizationId},${input.deliveryId},${input.integrationAccountId},${input.providerCode},
      ${input.quote.currency},${input.quote.baseAmount ?? null}::numeric,${input.quote.discountAmount ?? null}::numeric,
      ${input.quote.codFeeAmount ?? null}::numeric,${input.quote.additionalChargeAmount ?? null}::numeric,
      ${input.quote.amount}::numeric,${input.quote.providerQuoteReference ?? null},
      ${JSON.stringify({ pickup: input.request.pickup, cod: input.request.cod, packages: input.request.packages })}::jsonb,
      ${JSON.stringify(input.quote.metadata ?? {})}::jsonb,${input.quote.expiresAt ? new Date(input.quote.expiresAt) : null})
    returning id,quoted_at`.execute(db);
  return { id: result.rows[0]!.id, quotedAt: result.rows[0]!.quoted_at.toISOString() };
}

export async function requestCourierBooking(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    integrationAccountId: string;
    packageWeightKg?: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.courier-booking.request',
      idempotencyKey: input.idempotencyKey,
      request: input,
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
        'Only a ready Delivery can request a courier booking.',
      );
    const account = await sql<{
      id: string;
      provider_code: string;
      non_secret_config: { capabilities?: Record<string, boolean> };
    }>`select account.id,integration.provider_code,account.non_secret_config
      from integrations.integration_accounts account
      join integrations.integrations integration on integration.id=account.integration_id and integration.organization_id=account.organization_id
      where account.organization_id=${input.organizationId} and account.id=${input.integrationAccountId}
        and account.status='ACTIVE' and integration.status='ACTIVE' and integration.integration_type='COURIER'
      for update of account`.execute(transaction);
    const accountRow = account.rows[0];
    if (!accountRow)
      throw new DeliveryDomainError(
        'NOT_FOUND',
        'Active courier integration account was not found.',
      );
    if (input.packageWeightKg !== undefined) {
      if (!/^\d+(?:\.\d{1,6})?$/.test(input.packageWeightKg) || Number(input.packageWeightKg) <= 0)
        throw new DeliveryDomainError(
          'VALIDATION_FAILED',
          'Package weight must be a positive number of kilograms.',
        );
      await sql`update delivery.delivery_packages set weight_value=${input.packageWeightKg}::numeric,
        weight_unit='KG',weight_source='MANUAL',updated_at=now(),version=version+1
        where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}`.execute(
        transaction,
      );
    }
    const delivery = await sql<{
      delivery_number: string;
      cod_required: boolean;
      cod_expected_amount: string;
      address_snapshot: unknown;
    }>`select delivery_number,cod_required,cod_expected_amount::text,address_snapshot
      from delivery.deliveries where id=${input.deliveryId}`.execute(transaction);
    if (delivery.rows[0]!.cod_required && accountRow.non_secret_config.capabilities?.cod === false)
      throw new DeliveryDomainError(
        'VALIDATION_FAILED',
        'The selected courier account does not support COD.',
      );
    const number = await sql<{
      next: string;
    }>`select (coalesce(max(booking_sequence),0)+1)::text as next from delivery.courier_bookings where delivery_id=${input.deliveryId}`.execute(
      transaction,
    );
    const booking = await sql<{
      id: string;
      merchant_reference: string;
    }>`insert into delivery.courier_bookings (organization_id,delivery_id,integration_account_id,provider_code,booking_sequence,status,merchant_reference,requested_cod_amount,address_snapshot)
      values (${input.organizationId},${input.deliveryId},${input.integrationAccountId},${accountRow.provider_code},${Number(number.rows[0]!.next)},'PENDING',${`${delivery.rows[0]!.delivery_number}-${number.rows[0]!.next}`},${delivery.rows[0]!.cod_expected_amount}::numeric,${JSON.stringify(delivery.rows[0]!.address_snapshot)}::jsonb)
      returning id,merchant_reference`.execute(transaction);
    const operationKey = `courier-booking:${booking.rows[0]!.id}`;
    const operation = await sql<{
      id: string;
    }>`insert into integrations.integration_operations (organization_id,integration_account_id,operation_type,operation_key,local_entity_type,local_entity_id,request_fingerprint)
      values (${input.organizationId},${input.integrationAccountId},'COURIER_BOOKING_CREATE',${operationKey},'delivery.courier_booking',${booking.rows[0]!.id},${fingerprint({ deliveryId: input.deliveryId, bookingId: booking.rows[0]!.id })}) returning id`.execute(
      transaction,
    );
    await sql`update delivery.courier_bookings set integration_operation_id=${operation.rows[0]!.id} where id=${booking.rows[0]!.id}`.execute(
      transaction,
    );
    await sql`update delivery.deliveries set operational_status='BOOKING',version=version+1,updated_at=now() where id=${input.deliveryId}`.execute(
      transaction,
    );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      courierBookingId: booking.rows[0]!.id,
      type: 'COURIER_BOOKING_REQUESTED',
      normalizedStatus: 'BOOKING',
      metadata: { providerCode: accountRow.provider_code },
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.booking.requested',
      eventType: 'delivery.courier_booking_requested',
      metadata: { bookingId: booking.rows[0]!.id, providerCode: accountRow.provider_code },
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export interface PendingCourierBookingOperation {
  readonly operationId: string;
  readonly bookingId: string;
  readonly organizationId: string;
  readonly integrationAccountId: string;
  readonly providerCode: string;
  readonly request: {
    readonly deliveryId: string;
    readonly merchantReference: string;
    readonly pickup: {
      readonly locationId: string;
      readonly providerLocationId?: string;
    };
    readonly recipient: { readonly name: string; readonly phone: string; readonly address: string };
    readonly cod: {
      readonly required: boolean;
      readonly expectedAmount: string;
      readonly currency: string;
    };
    readonly packages: readonly {
      readonly packageNumber: number;
      readonly weight?: { readonly value: string; readonly unit: 'KG' };
      readonly dimensions?: {
        readonly length: string;
        readonly width: string;
        readonly height: string;
        readonly unit: 'CM' | 'IN';
      };
      readonly declaredValue?: string;
    }[];
    readonly contents: { readonly quantity: number; readonly description: string };
  };
}

/** A crashed worker must never silently retry a possibly accepted consignment. */
export async function recoverStaleCourierBookingOperations(
  db: Kysely<DatabaseSchema>,
  leaseSeconds = 600,
): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const stale = await sql<{
      operation_id: string;
      operation_type: string;
      organization_id: string;
      booking_id: string;
      delivery_id: string;
    }>`with stale_operation as (
        select operation.id
        from integrations.integration_operations operation
        where operation.operation_type in ('COURIER_BOOKING_CREATE','COURIER_BOOKING_CANCEL') and operation.status='SENT'
          and operation.last_attempt_at < now()-(${Math.max(60, leaseSeconds)} * interval '1 second')
        for update skip locked
      ), updated as (
        update integrations.integration_operations operation
        set status='UNKNOWN_OUTCOME',reconcile_after=now(),updated_at=now(),version=operation.version+1
        from stale_operation
        where operation.id=stale_operation.id
        returning operation.id,operation.operation_type,operation.organization_id,operation.local_entity_id
      )
      select updated.id as operation_id,updated.operation_type,updated.organization_id,booking.id as booking_id,booking.delivery_id
      from updated
      join delivery.courier_bookings booking on booking.id=updated.local_entity_id
        and booking.organization_id=updated.organization_id`.execute(tx);
    for (const operation of stale.rows) {
      await sql`update delivery.courier_bookings
        set status=case when ${operation.operation_type}='COURIER_BOOKING_CREATE' then 'UNKNOWN_OUTCOME' else status end,
          last_error_code='WORKER_LEASE_EXPIRED',updated_at=now(),version=version+1
        where organization_id=${operation.organization_id} and id=${operation.booking_id}
          and status=case when ${operation.operation_type}='COURIER_BOOKING_CREATE' then 'PENDING' else 'CANCELLATION_PENDING' end`.execute(
        tx,
      );
      const exceptionType =
        operation.operation_type === 'COURIER_BOOKING_CREATE'
          ? 'BOOKING_UNKNOWN_OUTCOME'
          : 'BOOKING_CANCELLATION_UNKNOWN_OUTCOME';
      await sql`insert into delivery.delivery_exceptions
        (organization_id,delivery_id,courier_booking_id,exception_type,severity,summary,details)
        select ${operation.organization_id},${operation.delivery_id},${operation.booking_id},${exceptionType},'ERROR',
          ${operation.operation_type === 'COURIER_BOOKING_CREATE' ? 'Courier booking worker stopped before the provider outcome was recorded.' : 'Courier cancellation worker stopped before the provider outcome was recorded.'},
          ${JSON.stringify({ operationId: operation.operation_id, reason: 'WORKER_LEASE_EXPIRED' })}::jsonb
        where not exists (select 1 from delivery.delivery_exceptions
          where organization_id=${operation.organization_id} and courier_booking_id=${operation.booking_id}
            and exception_type=${exceptionType} and status='OPEN')`.execute(tx);
    }
    return stale.rows.length;
  });
}

export async function listPendingCourierBookingOperations(
  db: Kysely<DatabaseSchema>,
  limit = 10,
): Promise<readonly PendingCourierBookingOperation[]> {
  const rows = await sql<{
    operation_id: string;
    booking_id: string;
    organization_id: string;
    integration_account_id: string;
    provider_code: string;
    delivery_id: string;
    merchant_reference: string;
    recipient_name: string;
    recipient_phone: string;
    address_snapshot: Record<string, string | null>;
    cod_required: boolean;
    cod_expected_amount: string;
    currency_code: string;
    location_id: string;
    provider_location_id: string | null;
    item_quantity: string;
    item_description: string;
    packages: {
      packageNumber: number;
      weightValue: string | null;
      weightUnit: 'KG';
      lengthValue: string | null;
      widthValue: string | null;
      heightValue: string | null;
      dimensionUnit: 'CM' | 'IN';
      declaredValue: string | null;
    }[];
  }>`with candidate as (
      select operation.id
      from integrations.integration_operations operation
      where operation.operation_type='COURIER_BOOKING_CREATE' and operation.status='PENDING'
        and (operation.reconcile_after is null or operation.reconcile_after <= now())
      order by operation.created_at,operation.id
      for update skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    ), operation as (
      update integrations.integration_operations claimed
      set status='SENT',attempt_count=claimed.attempt_count+1,last_attempt_at=now(),updated_at=now(),version=claimed.version+1
      from candidate
      where claimed.id=candidate.id
      returning claimed.*
    )
    select operation.id as operation_id,booking.id as booking_id,booking.organization_id,
      booking.integration_account_id,booking.provider_code,delivery.id as delivery_id,
      booking.merchant_reference,delivery.recipient_name,delivery.recipient_phone,delivery.address_snapshot,
      delivery.cod_required,delivery.cod_expected_amount::text,delivery.currency_code,
      fulfillment.location_id,
      coalesce(mapped_store.external_store_id,fallback_store.external_store_id) as provider_location_id,
      coalesce((select sum(delivery_line.quantity)::text from delivery.delivery_lines delivery_line
        where delivery_line.delivery_id=delivery.id),'1') as item_quantity,
      coalesce((select string_agg(order_line.sku_snapshot || ' x' || delivery_line.quantity::text,', ' order by order_line.sku_snapshot)
        from delivery.delivery_lines delivery_line join orders.order_lines order_line on order_line.id=delivery_line.order_line_id
        where delivery_line.delivery_id=delivery.id),booking.merchant_reference) as item_description,
      coalesce((select jsonb_agg(jsonb_build_object(
        'packageNumber',package.package_number,'weightValue',package.weight_value::text,
        'weightUnit',package.weight_unit,'lengthValue',package.length_value::text,
        'widthValue',package.width_value::text,'heightValue',package.height_value::text,
        'dimensionUnit',package.dimension_unit,'declaredValue',package.declared_value::text
      ) order by package.package_number) from delivery.delivery_packages package where package.delivery_id=delivery.id),'[]'::jsonb) as packages
    from operation
    join delivery.courier_bookings booking on booking.integration_operation_id=operation.id
    join delivery.deliveries delivery on delivery.id=booking.delivery_id and delivery.organization_id=booking.organization_id
    join fulfillment.fulfillments fulfillment on fulfillment.id=delivery.fulfillment_id and fulfillment.organization_id=delivery.organization_id
    left join integrations.courier_pickup_store_mappings store_mapping
      on store_mapping.organization_id=booking.organization_id
      and store_mapping.integration_account_id=booking.integration_account_id
      and store_mapping.location_id=fulfillment.location_id
    left join integrations.courier_provider_stores mapped_store
      on mapped_store.id=store_mapping.provider_store_id and mapped_store.organization_id=store_mapping.organization_id
      and mapped_store.is_active
    left join lateral (
      select provider_store.external_store_id
      from integrations.courier_provider_stores provider_store
      where provider_store.organization_id=booking.organization_id
        and provider_store.integration_account_id=booking.integration_account_id and provider_store.is_active
        and (provider_store.is_default or (select count(*) from integrations.courier_provider_stores candidate
          where candidate.integration_account_id=booking.integration_account_id and candidate.is_active)=1)
      order by provider_store.is_default desc,provider_store.name
      limit 1
    ) fallback_store on mapped_store.id is null
    order by operation.created_at,operation.id`.execute(db);
  return rows.rows.map((row) => {
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
    return {
      operationId: row.operation_id,
      bookingId: row.booking_id,
      organizationId: row.organization_id,
      integrationAccountId: row.integration_account_id,
      providerCode: row.provider_code,
      request: {
        deliveryId: row.delivery_id,
        merchantReference: row.merchant_reference,
        pickup: {
          locationId: row.location_id,
          ...(row.provider_location_id ? { providerLocationId: row.provider_location_id } : {}),
        },
        recipient: { name: row.recipient_name, phone: row.recipient_phone, address },
        cod: {
          required: row.cod_required,
          expectedAmount: row.cod_expected_amount,
          currency: row.currency_code,
        },
        packages: row.packages.map((item) => ({
          packageNumber: item.packageNumber,
          ...(item.weightValue
            ? { weight: { value: item.weightValue, unit: item.weightUnit } }
            : {}),
          ...(item.lengthValue && item.widthValue && item.heightValue
            ? {
                dimensions: {
                  length: item.lengthValue,
                  width: item.widthValue,
                  height: item.heightValue,
                  unit: item.dimensionUnit,
                },
              }
            : {}),
          ...(item.declaredValue ? { declaredValue: item.declaredValue } : {}),
        })),
        contents: {
          quantity: Math.max(1, Math.ceil(Number(row.item_quantity))),
          description: row.item_description.slice(0, 120),
        },
      },
    };
  });
}

export async function completeCourierBookingOperation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    operationId: string;
    bookingId: string;
    result:
      | {
          kind: 'BOOKED';
          providerBookingId: string;
          trackingReference?: string;
          trackingUrl?: string;
          providerStatus?: string;
          charge?: {
            amount: string;
            currency: string;
            basis: 'ESTIMATE' | 'ACTUAL';
            providerReference?: string;
          };
        }
      | { kind: 'UNKNOWN_OUTCOME'; providerStatus?: string }
      | { kind: 'REJECTED'; reasonCode: string };
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const booking = await sql<{ delivery_id: string; provider_code: string; status: string }>`
      select delivery_id,provider_code,status from delivery.courier_bookings
      where organization_id=${input.organizationId} and id=${input.bookingId}
        and integration_operation_id=${input.operationId} for update
    `.execute(transaction);
    const row = booking.rows[0];
    if (!row)
      throw new DeliveryDomainError('NOT_FOUND', 'Courier booking operation was not found.');
    if (!['PENDING', 'UNKNOWN_OUTCOME'].includes(row.status)) return;
    if (input.result.kind === 'BOOKED') {
      await sql`update delivery.courier_bookings set status='BOOKED',external_consignment_id=${input.result.providerBookingId},tracking_number=${input.result.trackingReference ?? input.result.providerBookingId},tracking_url=${input.result.trackingUrl ?? null},provider_status_raw=${input.result.providerStatus ?? null},booked_at=now(),last_reconciled_at=now(),updated_at=now(),version=version+1 where id=${input.bookingId}`.execute(
        transaction,
      );
      await sql`update delivery.deliveries set operational_status='BOOKED',tracking_reference=${input.result.trackingReference ?? input.result.providerBookingId},version=version+1,updated_at=now() where id=${row.delivery_id}`.execute(
        transaction,
      );
      await sql`update integrations.integration_operations set status='CONFIRMED_SUCCESS',external_reference=${input.result.providerBookingId},updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        transaction,
      );
      if (input.result.charge)
        await sql`insert into delivery.provider_charges
          (organization_id,delivery_id,courier_booking_id,charge_type,charge_basis,currency_code,amount,provider_reference)
          values (${input.organizationId},${row.delivery_id},${input.bookingId},'DELIVERY',${input.result.charge.basis},
            ${input.result.charge.currency},${input.result.charge.amount}::numeric,${input.result.charge.providerReference ?? null})
          on conflict(organization_id,courier_booking_id,provider_reference,charge_type)
          where provider_reference is not null do nothing`.execute(transaction);
      await appendEvent(transaction, {
        organizationId: input.organizationId,
        deliveryId: row.delivery_id,
        courierBookingId: input.bookingId,
        type: 'COURIER_BOOKED',
        normalizedStatus: 'BOOKED',
        source: 'PROVIDER',
        ...(input.result.providerStatus ? { providerStatusRaw: input.result.providerStatus } : {}),
      });
    } else if (input.result.kind === 'UNKNOWN_OUTCOME') {
      await sql`update delivery.courier_bookings set status='UNKNOWN_OUTCOME',provider_status_raw=${input.result.providerStatus ?? null},last_reconciled_at=now(),updated_at=now(),version=version+1 where id=${input.bookingId}`.execute(
        transaction,
      );
      await sql`update integrations.integration_operations set status='UNKNOWN_OUTCOME',reconcile_after=now()+interval '5 minutes',updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        transaction,
      );
      await sql`insert into delivery.delivery_exceptions (organization_id,delivery_id,courier_booking_id,exception_type,severity,summary) values (${input.organizationId},${row.delivery_id},${input.bookingId},'BOOKING_UNKNOWN_OUTCOME','ERROR','Courier booking outcome is unknown and must be reconciled.')`.execute(
        transaction,
      );
      await appendEvent(transaction, {
        organizationId: input.organizationId,
        deliveryId: row.delivery_id,
        courierBookingId: input.bookingId,
        type: 'COURIER_BOOKING_UNKNOWN_OUTCOME',
        source: 'SYSTEM',
      });
    } else {
      await sql`update delivery.courier_bookings set status='REJECTED',last_error_code=${input.result.reasonCode},last_reconciled_at=now(),updated_at=now(),version=version+1 where id=${input.bookingId}`.execute(
        transaction,
      );
      await sql`update delivery.deliveries set operational_status='READY',version=version+1,updated_at=now() where id=${row.delivery_id}`.execute(
        transaction,
      );
      await sql`update integrations.integration_operations set status='CONFIRMED_FAILURE',updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        transaction,
      );
      await sql`insert into delivery.delivery_exceptions (organization_id,delivery_id,courier_booking_id,exception_type,severity,summary,details) values (${input.organizationId},${row.delivery_id},${input.bookingId},'BOOKING_REJECTED','WARNING','Courier rejected the booking request.',${JSON.stringify({ reasonCode: input.result.reasonCode })}::jsonb)`.execute(
        transaction,
      );
      await appendEvent(transaction, {
        organizationId: input.organizationId,
        deliveryId: row.delivery_id,
        courierBookingId: input.bookingId,
        type: 'COURIER_BOOKING_REJECTED',
        source: 'PROVIDER',
        metadata: { reasonCode: input.result.reasonCode },
      });
    }
    await emit(transaction, {
      organizationId: input.organizationId,
      ...(input.actorId ? { actorId: input.actorId } : { actorType: 'SYSTEM' as const }),
      deliveryId: row.delivery_id,
      action: 'delivery.courier_booking.completed',
      eventType: 'delivery.courier_booking_completed',
      metadata: { bookingId: input.bookingId, outcome: input.result.kind },
    });
  });
}

export interface PendingCourierCancellationOperation {
  readonly operationId: string;
  readonly bookingId: string;
  readonly organizationId: string;
  readonly integrationAccountId: string;
  readonly providerCode: string;
  readonly providerBookingId: string;
}

export async function listPendingCourierCancellationOperations(
  db: Kysely<DatabaseSchema>,
  limit = 10,
): Promise<readonly PendingCourierCancellationOperation[]> {
  const result = await sql<{
    operation_id: string;
    booking_id: string;
    organization_id: string;
    integration_account_id: string;
    provider_code: string;
    provider_booking_id: string;
  }>`with candidate as (
      select operation.id
      from integrations.integration_operations operation
      where operation.operation_type='COURIER_BOOKING_CANCEL' and operation.status='PENDING'
      order by operation.created_at,operation.id
      for update skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    ), operation as (
      update integrations.integration_operations claimed
      set status='SENT',attempt_count=claimed.attempt_count+1,last_attempt_at=now(),updated_at=now(),version=claimed.version+1
      from candidate where claimed.id=candidate.id returning claimed.*
    )
    select operation.id as operation_id,booking.id as booking_id,booking.organization_id,booking.integration_account_id,
      booking.provider_code,booking.external_consignment_id as provider_booking_id
    from operation
    join delivery.courier_bookings booking on booking.id=operation.local_entity_id
      and booking.organization_id=operation.organization_id
    where booking.status='CANCELLATION_PENDING' and booking.external_consignment_id is not null
    order by operation.created_at,operation.id`.execute(db);
  return result.rows.map((row) => ({
    operationId: row.operation_id,
    bookingId: row.booking_id,
    organizationId: row.organization_id,
    integrationAccountId: row.integration_account_id,
    providerCode: row.provider_code,
    providerBookingId: row.provider_booking_id,
  }));
}

export async function completeCourierCancellationOperation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    operationId: string;
    bookingId: string;
    result:
      | { kind: 'CANCELLED' }
      | { kind: 'REJECTED'; reasonCode: string }
      | { kind: 'UNKNOWN_OUTCOME' };
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const booking = await sql<{
      delivery_id: string;
      status: string;
    }>`select booking.delivery_id,booking.status
      from delivery.courier_bookings booking
      join integrations.integration_operations operation on operation.id=${input.operationId}
        and operation.organization_id=booking.organization_id and operation.local_entity_id=booking.id
      where booking.organization_id=${input.organizationId} and booking.id=${input.bookingId}
      for update of booking,operation`.execute(tx);
    const row = booking.rows[0];
    if (!row)
      throw new DeliveryDomainError('NOT_FOUND', 'Courier cancellation operation was not found.');
    if (row.status !== 'CANCELLATION_PENDING') return;
    if (input.result.kind === 'CANCELLED') {
      await sql`update delivery.courier_bookings set status='CANCELLED',cancelled_at=now(),last_reconciled_at=now(),updated_at=now(),version=version+1 where id=${input.bookingId}`.execute(
        tx,
      );
      await sql`update delivery.deliveries set operational_status='READY',tracking_reference=null,version=version+1,updated_at=now() where id=${row.delivery_id} and operational_status='BOOKED'`.execute(
        tx,
      );
      await sql`update integrations.integration_operations set status='CONFIRMED_SUCCESS',updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        tx,
      );
    } else if (input.result.kind === 'REJECTED') {
      await sql`update delivery.courier_bookings set status='BOOKED',last_error_code=${input.result.reasonCode},last_reconciled_at=now(),updated_at=now(),version=version+1 where id=${input.bookingId}`.execute(
        tx,
      );
      await sql`update integrations.integration_operations set status='CONFIRMED_FAILURE',updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        tx,
      );
      await sql`insert into delivery.delivery_exceptions
        (organization_id,delivery_id,courier_booking_id,exception_type,severity,summary,details)
        values (${input.organizationId},${row.delivery_id},${input.bookingId},'BOOKING_CANCELLATION_REJECTED','WARNING',
          'Courier rejected the booking cancellation.',${JSON.stringify({ reasonCode: input.result.reasonCode })}::jsonb)`.execute(
        tx,
      );
    } else {
      await sql`update integrations.integration_operations set status='UNKNOWN_OUTCOME',reconcile_after=now()+interval '5 minutes',updated_at=now(),version=version+1 where id=${input.operationId}`.execute(
        tx,
      );
      await sql`insert into delivery.delivery_exceptions
        (organization_id,delivery_id,courier_booking_id,exception_type,severity,summary)
        values (${input.organizationId},${row.delivery_id},${input.bookingId},'BOOKING_CANCELLATION_UNKNOWN_OUTCOME','ERROR',
          'Courier booking cancellation outcome is unknown and must be reconciled.')`.execute(tx);
    }
    await appendEvent(tx, {
      organizationId: input.organizationId,
      deliveryId: row.delivery_id,
      courierBookingId: input.bookingId,
      type: `COURIER_BOOKING_CANCELLATION_${input.result.kind}`,
      source: 'PROVIDER',
    });
    await emit(tx, {
      organizationId: input.organizationId,
      actorType: 'SYSTEM',
      deliveryId: row.delivery_id,
      action: 'delivery.booking.cancellation_completed',
      eventType: 'delivery.booking_cancellation_completed',
      metadata: { bookingId: input.bookingId, outcome: input.result.kind },
    });
  });
}

export async function reconcileUnknownCourierBooking(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    bookingId: string;
    expectedVersion: number;
    outcome:
      | {
          kind: 'BOOKED';
          providerBookingId: string;
          trackingReference?: string;
          trackingUrl?: string;
        }
      | { kind: 'NOT_CREATED'; reasonCode: string };
  },
): Promise<DeliveryView> {
  const reference = await sql<{
    operation_id: string;
    delivery_version: string;
    booking_status: string;
    delivery_status: string;
  }>`select booking.integration_operation_id as operation_id,delivery.version::text as delivery_version,
      booking.status as booking_status,delivery.operational_status as delivery_status
    from delivery.courier_bookings booking
    join delivery.deliveries delivery on delivery.id=booking.delivery_id and delivery.organization_id=booking.organization_id
    where booking.organization_id=${input.organizationId} and booking.id=${input.bookingId}
      and booking.delivery_id=${input.deliveryId}`.execute(db);
  const row = reference.rows[0];
  if (!row?.operation_id)
    throw new DeliveryDomainError('NOT_FOUND', 'Unknown courier booking operation was not found.');
  if (Number(row.delivery_version) !== input.expectedVersion)
    throw new DeliveryDomainError('STALE_VERSION', 'Delivery changed; reload before reconciling.');
  if (row.booking_status !== 'UNKNOWN_OUTCOME' || row.delivery_status !== 'BOOKING')
    throw new DeliveryDomainError(
      'CONFLICT',
      'Only an unknown in-flight booking can be reconciled.',
    );
  await completeCourierBookingOperation(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    operationId: row.operation_id,
    bookingId: input.bookingId,
    result:
      input.outcome.kind === 'BOOKED'
        ? input.outcome
        : { kind: 'REJECTED', reasonCode: input.outcome.reasonCode },
  });
  return getDelivery(db, {
    organizationId: input.organizationId,
    deliveryId: input.deliveryId,
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
    const fulfillment = await sql<{ id: string; status: string }>`
      select fulfillment.id, fulfillment.status
      from delivery.deliveries delivery
      join fulfillment.fulfillments fulfillment on fulfillment.id=delivery.fulfillment_id
      where delivery.organization_id=${input.organizationId} and delivery.id=${input.deliveryId}
      for update of fulfillment
    `.execute(transaction);
    const fulfillmentRow = fulfillment.rows[0];
    if (!fulfillmentRow)
      throw new DeliveryDomainError('NOT_FOUND', 'Delivery fulfillment was not found.');
    if (fulfillmentRow.status === 'PACKED') {
      try {
        await dispatchFulfillmentInTransaction(transaction, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: fulfillmentRow.id,
        });
      } catch (error) {
        if (error instanceof FulfillmentDomainError)
          throw new DeliveryDomainError('CONFLICT', error.message);
        throw error;
      }
    } else if (fulfillmentRow.status !== 'DISPATCHED') {
      throw new DeliveryDomainError(
        'CONFLICT',
        'Only a packed fulfillment may be handed to a courier.',
      );
    }
    await sql`update delivery.deliveries set operational_status = 'IN_TRANSIT', handed_over_at = now(), last_tracking_event_at=now(), version = version + 1, updated_at = now() where id = ${input.deliveryId}`.execute(
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
    source?: 'MANUAL' | 'SYSTEM' | 'PROVIDER';
    courierBookingId?: string;
    providerStatusRaw?: string;
    providerEventId?: string;
    occurredAt?: Date;
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
    if (!['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(current.status))
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
    const knownAttemptOutcomes: readonly DeliveryAttemptOutcome[] = [
      'CUSTOMER_UNAVAILABLE',
      'CUSTOMER_REFUSED',
      'ADDRESS_NOT_FOUND',
      'RESCHEDULE_REQUESTED',
      'PHONE_UNREACHABLE',
      'PROVIDER_FAILURE',
      'OTHER_FAILED',
    ];
    const outcome: DeliveryAttemptOutcome =
      input.kind === 'DELIVERED'
        ? 'DELIVERED'
        : knownAttemptOutcomes.includes(input.reasonCode as DeliveryAttemptOutcome)
          ? (input.reasonCode as DeliveryAttemptOutcome)
          : 'OTHER_FAILED';
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
          and ol.line_status = 'ACTIVE'
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
      ...(input.source ? { source: input.source } : {}),
      ...(input.courierBookingId ? { courierBookingId: input.courierBookingId } : {}),
      ...(input.providerStatusRaw ? { providerStatusRaw: input.providerStatusRaw } : {}),
      ...(input.providerEventId ? { providerEventId: input.providerEventId } : {}),
      normalizedStatus: input.kind,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
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

export async function recordDeliveryAttempt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    outcome: DeliveryAttemptOutcome;
    reasonCode?: string;
    note?: string;
    nextAttemptAt?: string;
    isFinal?: boolean;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (input.outcome === 'DELIVERED')
    return recordOutcome(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      kind: 'DELIVERED',
      ...(input.note ? { note: input.note } : {}),
    });
  if (input.isFinal)
    return recordOutcome(db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      kind: 'FAILED',
      reasonCode: input.reasonCode ?? input.outcome,
      ...(input.note ? { note: input.note } : {}),
    });
  const nextAttemptAt = input.nextAttemptAt ? new Date(input.nextAttemptAt) : undefined;
  if (nextAttemptAt && Number.isNaN(nextAttemptAt.valueOf()))
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Next attempt time is invalid.');
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.attempt',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await lockDelivery(transaction, input);
    if (!['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(current.status))
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'Only an active in-transit Delivery can receive a delivery attempt.',
      );
    const attempt = await sql<{ next: string }>`
      select (coalesce(max(attempt_number), 0) + 1)::text as next
      from delivery.delivery_attempts
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
    `.execute(transaction);
    await sql`insert into delivery.delivery_attempts (organization_id, delivery_id, courier_booking_id, attempt_number, outcome, reason_code, notes, next_attempt_at)
      select ${input.organizationId}, delivery.id, booking.id, ${Number(attempt.rows[0]!.next)}, ${input.outcome}, ${input.reasonCode ?? null}, ${input.note ?? null}, ${nextAttemptAt ?? null}
      from delivery.deliveries delivery
      left join lateral (
        select id from delivery.courier_bookings where delivery_id=delivery.id and status='BOOKED' order by booking_sequence desc limit 1
      ) booking on true
      where delivery.id=${input.deliveryId}`.execute(transaction);
    await sql`update delivery.deliveries set operational_status='IN_TRANSIT', last_tracking_event_at=now(), version=version+1, updated_at=now() where id=${input.deliveryId}`.execute(
      transaction,
    );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'DELIVERY_ATTEMPT_FAILED',
      normalizedStatus: 'ATTEMPT_FAILED',
      metadata: {
        outcome: input.outcome,
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        ...(input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
      },
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.attempt.recorded',
      eventType: 'delivery.attempt_failed',
      metadata: { outcome: input.outcome },
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export async function cancelCourierBooking(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (!input.reason.trim())
    throw new DeliveryDomainError(
      'VALIDATION_FAILED',
      'A booking cancellation reason is required.',
    );
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.booking.cancel',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await lockDelivery(transaction, input);
    if (!['BOOKED', 'READY'].includes(current.status))
      throw new DeliveryDomainError(
        'INVALID_TRANSITION',
        'A courier booking cannot be cancelled while its outcome is unknown or after handover.',
      );
    const booking = await sql<{
      id: string;
      provider_code: string;
      integration_account_id: string | null;
      external_consignment_id: string | null;
      status: string;
    }>`select id,provider_code,integration_account_id,external_consignment_id,status
      from delivery.courier_bookings
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
        and status='BOOKED' order by booking_sequence desc limit 1 for update`.execute(transaction);
    const row = booking.rows[0];
    if (!row && current.status !== 'READY')
      throw new DeliveryDomainError(
        'CONFLICT',
        'No cancellable courier booking was found; reconcile an unknown outcome first.',
      );
    if (!row) {
      await completeIdempotency(transaction, started.recordId!, input.deliveryId);
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: input.deliveryId,
      });
    }
    if (row?.provider_code !== 'MANUAL') {
      if (!row?.integration_account_id || !row.external_consignment_id)
        throw new DeliveryDomainError(
          'CONFLICT',
          'Provider booking identifiers are incomplete; reconcile the booking before cancellation.',
        );
      const operationKey = `courier-booking-cancel:${row.id}`;
      await sql`insert into integrations.integration_operations
        (organization_id,integration_account_id,operation_type,operation_key,local_entity_type,local_entity_id,request_fingerprint)
        values (${input.organizationId},${row.integration_account_id},'COURIER_BOOKING_CANCEL',${operationKey},'delivery.courier_booking',${row.id},${fingerprint({ bookingId: row.id, providerBookingId: row.external_consignment_id })})
        on conflict (integration_account_id,operation_type,operation_key) do nothing`.execute(
        transaction,
      );
      await sql`update delivery.courier_bookings set status='CANCELLATION_PENDING',last_error_message=${input.reason.trim()},version=version+1,updated_at=now() where id=${row.id}`.execute(
        transaction,
      );
      await appendEvent(transaction, {
        organizationId: input.organizationId,
        deliveryId: input.deliveryId,
        courierBookingId: row.id,
        type: 'COURIER_BOOKING_CANCELLATION_REQUESTED',
        metadata: { reason: input.reason.trim() },
      });
    } else {
      if (row)
        await sql`update delivery.courier_bookings set status='CANCELLED',cancelled_at=now(),last_error_message=${input.reason.trim()},version=version+1,updated_at=now() where id=${row.id}`.execute(
          transaction,
        );
      await sql`update delivery.deliveries set operational_status='READY',manual_carrier_name=null,tracking_reference=null,version=version+1,updated_at=now() where id=${input.deliveryId}`.execute(
        transaction,
      );
      await appendEvent(transaction, {
        organizationId: input.organizationId,
        deliveryId: input.deliveryId,
        ...(row ? { courierBookingId: row.id } : {}),
        type: 'COURIER_BOOKING_CANCELLED',
        metadata: { reason: input.reason.trim() },
      });
    }
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action:
        row?.provider_code === 'MANUAL'
          ? 'delivery.booking.cancelled'
          : 'delivery.booking.cancellation_requested',
      eventType:
        row?.provider_code === 'MANUAL'
          ? 'delivery.booking_cancelled'
          : 'delivery.booking_cancellation_requested',
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export async function cancelDelivery(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (!input.reason.trim())
    throw new DeliveryDomainError(
      'VALIDATION_FAILED',
      'A delivery cancellation reason is required.',
    );
  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.cancel',
      idempotencyKey: input.idempotencyKey,
      request: input,
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
        'Cancel or reconcile any courier booking before cancelling the Delivery.',
      );
    await sql`update delivery.deliveries set operational_status='CANCELLED', outcome_status='CANCELLED_BEFORE_HANDOVER', version=version+1, updated_at=now() where id=${input.deliveryId}`.execute(
      transaction,
    );
    await sql`update delivery.cod_collection_instructions set status='CANCELLED' where organization_id=${input.organizationId} and delivery_id=${input.deliveryId} and status='ACTIVE'`.execute(
      transaction,
    );
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'CANCELLED_BEFORE_HANDOVER',
      normalizedStatus: 'CANCELLED',
      metadata: { reason: input.reason.trim() },
    });
    await completeIdempotency(transaction, started.recordId!, input.deliveryId);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.delivery.cancelled',
      eventType: 'delivery.cancelled',
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
    });
  });
}

export async function resolveDeliveryException(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    exceptionId: string;
    expectedVersion: number;
    resolution: 'RESOLVED' | 'IGNORED_WITH_REASON';
    note: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (!input.note.trim())
    throw new DeliveryDomainError('VALIDATION_FAILED', 'A resolution note is required.');
  return db.transaction().execute(async (tx) => {
    const started = await beginIdempotent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.exception.resolve',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(tx, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    await lockDelivery(tx, input);
    const updated = await sql<{ id: string }>`update delivery.delivery_exceptions
      set status=${input.resolution},resolved_at=now(),resolved_by_actor_id=${input.actorId},
        resolution_note=${input.note.trim()},version=version+1
      where organization_id=${input.organizationId} and id=${input.exceptionId}
        and delivery_id=${input.deliveryId} and status='OPEN' returning id`.execute(tx);
    if (!updated.rows[0])
      throw new DeliveryDomainError('NOT_FOUND', 'Open Delivery exception was not found.');
    await sql`update delivery.deliveries set version=version+1,updated_at=now() where id=${input.deliveryId}`.execute(
      tx,
    );
    await appendEvent(tx, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'DELIVERY_EXCEPTION_RESOLVED',
      metadata: { exceptionId: input.exceptionId, resolution: input.resolution },
    });
    await completeIdempotency(tx, started.recordId!, input.deliveryId);
    await emit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.exception.resolved',
      eventType: 'delivery.exception_resolved',
      metadata: { exceptionId: input.exceptionId, resolution: input.resolution },
    });
    return getDelivery(tx, { organizationId: input.organizationId, deliveryId: input.deliveryId });
  });
}

export async function createDeliveryClaim(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    expectedVersion: number;
    reason: 'LOST' | 'DAMAGED' | 'COD_MISMATCH' | 'OVERCHARGE' | 'OTHER';
    claimedAmount?: string;
    currency: string;
    notes?: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (input.claimedAmount && !/^\d+(?:\.\d{1,4})?$/.test(input.claimedAmount))
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Claimed amount is invalid.');
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Claim currency is invalid.');
  return db.transaction().execute(async (tx) => {
    const started = await beginIdempotent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.claim.create',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(tx, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    await lockDelivery(tx, input);
    const existingClaim = await sql<{ id: string }>`select id from delivery.delivery_claims
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
        and reason=${input.reason} and status in ('OPEN','SUBMITTED','APPROVED')`.execute(tx);
    if (existingClaim.rows[0])
      throw new DeliveryDomainError(
        'CONFLICT',
        'An active courier claim already exists for this reason.',
      );
    const booking = await sql<{ id: string }>`select id from delivery.courier_bookings
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
        and status in ('BOOKED','CANCELLED','UNKNOWN_OUTCOME')
      order by booking_sequence desc limit 1`.execute(tx);
    const claim = await sql<{
      id: string;
      claim_number: string;
    }>`insert into delivery.delivery_claims
      (organization_id,delivery_id,courier_booking_id,claim_number,reason,claimed_amount,currency_code,notes)
      values (${input.organizationId},${input.deliveryId},${booking.rows[0]?.id ?? null},
        ${`DCL-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`},
        ${input.reason},${input.claimedAmount ?? null}::numeric,${input.currency},${input.notes?.trim() || null})
      returning id,claim_number`.execute(tx);
    await sql`update delivery.deliveries set version=version+1,updated_at=now() where id=${input.deliveryId}`.execute(
      tx,
    );
    await appendEvent(tx, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: 'DELIVERY_CLAIM_CREATED',
      metadata: { claimId: claim.rows[0]!.id, reason: input.reason },
    });
    await completeIdempotency(tx, started.recordId!, input.deliveryId);
    await emit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.claim.created',
      eventType: 'delivery.claim_created',
      metadata: { claimId: claim.rows[0]!.id, claimNumber: claim.rows[0]!.claim_number },
    });
    return getDelivery(tx, { organizationId: input.organizationId, deliveryId: input.deliveryId });
  });
}

export async function transitionDeliveryClaim(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    claimId: string;
    expectedClaimVersion: number;
    nextStatus: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CLOSED';
    approvedAmount?: string;
    providerReference?: string;
    notes?: string;
    idempotencyKey: string;
  },
): Promise<DeliveryView> {
  if (input.approvedAmount && !/^\d+(?:\.\d{1,4})?$/.test(input.approvedAmount))
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Approved claim amount is invalid.');
  return db.transaction().execute(async (tx) => {
    const started = await beginIdempotent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'delivery.claim.transition',
      idempotencyKey: input.idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(tx, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const claim = await sql<{
      status: string;
      version: string;
      claimed_amount: string | null;
    }>`select status,version::text,claimed_amount::text from delivery.delivery_claims
      where organization_id=${input.organizationId} and id=${input.claimId}
        and delivery_id=${input.deliveryId} for update`.execute(tx);
    const row = claim.rows[0];
    if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Delivery claim was not found.');
    if (Number(row.version) !== input.expectedClaimVersion)
      throw new DeliveryDomainError('STALE_VERSION', 'Claim changed; reload before updating.');
    const allowed: Record<string, readonly string[]> = {
      OPEN: ['SUBMITTED', 'CLOSED'],
      SUBMITTED: ['APPROVED', 'REJECTED', 'CLOSED'],
      APPROVED: ['PAID', 'CLOSED'],
      REJECTED: ['CLOSED'],
      PAID: ['CLOSED'],
    };
    if (!allowed[row.status]?.includes(input.nextStatus))
      throw new DeliveryDomainError('INVALID_TRANSITION', 'This claim transition is not allowed.');
    if (input.nextStatus === 'APPROVED' && !input.approvedAmount)
      throw new DeliveryDomainError(
        'VALIDATION_FAILED',
        'Approved amount is required when approving a claim.',
      );
    if (input.nextStatus === 'PAID' && !input.providerReference?.trim())
      throw new DeliveryDomainError(
        'VALIDATION_FAILED',
        'Provider payment reference is required when marking a claim paid.',
      );
    await sql`update delivery.delivery_claims set status=${input.nextStatus},
      approved_amount=case when ${input.nextStatus}='APPROVED' then ${input.approvedAmount ?? null}::numeric else approved_amount end,
      provider_reference=coalesce(${input.providerReference?.trim() || null},provider_reference),
      notes=coalesce(${input.notes?.trim() || null},notes),updated_at=now(),version=version+1
      where id=${input.claimId}`.execute(tx);
    await sql`update delivery.deliveries set version=version+1,updated_at=now() where id=${input.deliveryId}`.execute(
      tx,
    );
    await appendEvent(tx, {
      organizationId: input.organizationId,
      deliveryId: input.deliveryId,
      type: `DELIVERY_CLAIM_${input.nextStatus}`,
      metadata: { claimId: input.claimId },
    });
    await completeIdempotency(tx, started.recordId!, input.deliveryId);
    await emit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: input.deliveryId,
      action: 'delivery.claim.transitioned',
      eventType: 'delivery.claim_transitioned',
      metadata: { claimId: input.claimId, status: input.nextStatus },
    });
    return getDelivery(tx, { organizationId: input.organizationId, deliveryId: input.deliveryId });
  });
}

export interface CourierTrackingReconciliation {
  readonly organizationId: string;
  readonly integrationAccountId: string;
  readonly bookingId: string;
  readonly deliveryId: string;
  readonly providerCode: string;
  readonly providerBookingId: string;
}

/** Claims a bounded set for authenticated provider polling. Updating the
 * timestamp before I/O prevents multiple workers from polling the same parcel;
 * a failed poll becomes eligible again after the interval. */
export async function listCourierBookingsForTrackingReconciliation(
  db: Kysely<DatabaseSchema>,
  limit = 20,
  minimumIntervalMinutes = 15,
): Promise<readonly CourierTrackingReconciliation[]> {
  const result = await sql<{
    organization_id: string;
    integration_account_id: string;
    booking_id: string;
    delivery_id: string;
    provider_code: string;
    provider_booking_id: string;
  }>`with candidate as (
      select booking.id
      from delivery.courier_bookings booking
      join delivery.deliveries delivery on delivery.id=booking.delivery_id
        and delivery.organization_id=booking.organization_id
      where booking.status='BOOKED' and booking.integration_account_id is not null
        and booking.external_consignment_id is not null
        and delivery.operational_status not in ('DELIVERED','CANCELLED','RETURNED_TO_ORIGIN','LOST','DAMAGED')
        and (booking.last_reconciled_at is null or booking.last_reconciled_at <=
          now()-(${Math.max(5, minimumIntervalMinutes)} * interval '1 minute'))
      order by coalesce(booking.last_reconciled_at,booking.booked_at,booking.created_at),booking.id
      for update of booking skip locked
      limit ${Math.min(Math.max(limit, 1), 50)}
    ), claimed as (
      update delivery.courier_bookings booking set last_reconciled_at=now(),updated_at=now()
      from candidate where booking.id=candidate.id
      returning booking.*
    ) select claimed.organization_id,claimed.integration_account_id,claimed.id as booking_id,
      claimed.delivery_id,claimed.provider_code,claimed.external_consignment_id as provider_booking_id
    from claimed`.execute(db);
  return result.rows.map((row) => ({
    organizationId: row.organization_id,
    integrationAccountId: row.integration_account_id,
    bookingId: row.booking_id,
    deliveryId: row.delivery_id,
    providerCode: row.provider_code,
    providerBookingId: row.provider_booking_id,
  }));
}

export async function recordCourierReconciliationObservation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    integrationAccountId: string;
    bookingId: string;
    providerStatus?: string;
    recognized: boolean;
    errorCode?: string;
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const booking = await sql<{ delivery_id: string }>`update delivery.courier_bookings set
      provider_status_raw=coalesce(${input.providerStatus ?? null},provider_status_raw),
      last_error_code=${input.errorCode ?? null},last_reconciled_at=now(),updated_at=now()
      where organization_id=${input.organizationId} and id=${input.bookingId}::uuid
        and integration_account_id=${input.integrationAccountId}::uuid
      returning delivery_id`.execute(tx);
    const row = booking.rows[0];
    if (!row) return;
    if (input.providerStatus && !input.recognized)
      await sql`insert into integrations.integration_exceptions
        (organization_id,integration_account_id,exception_type,severity,summary,details)
        select ${input.organizationId},${input.integrationAccountId},'UNKNOWN_COURIER_STATUS','WARNING',
          'Courier returned an unrecognized status; Maevelle state was not changed.',
          ${JSON.stringify({ bookingId: input.bookingId, providerStatus: input.providerStatus })}::jsonb
        where not exists(select 1 from integrations.integration_exceptions
          where organization_id=${input.organizationId} and integration_account_id=${input.integrationAccountId}
            and exception_type='UNKNOWN_COURIER_STATUS' and status='OPEN'
            and details->>'bookingId'=${input.bookingId} and details->>'providerStatus'=${input.providerStatus})`.execute(
        tx,
      );
  });
}

export async function recordProviderTrackingEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    integrationAccountId: string;
    courierBookingId: string;
    providerEventId: string;
    providerStatus: string;
    normalizedStatus: ProviderTrackingStatus;
    occurredAt: Date;
    reasonCode?: string;
    note?: string;
  },
): Promise<DeliveryView> {
  const reference = await sql<{
    delivery_id: string;
    version: string;
    operational_status: DeliveryOperationalStatus;
    outcome_status: DeliveryOutcomeStatus;
    last_tracking_event_at: Date | null;
  }>`
    select booking.delivery_id,delivery.version::text,delivery.operational_status,
      delivery.outcome_status,delivery.last_tracking_event_at
    from delivery.courier_bookings booking
    join delivery.deliveries delivery on delivery.id=booking.delivery_id and delivery.organization_id=booking.organization_id
    where booking.organization_id=${input.organizationId} and booking.id=${input.courierBookingId}
      and booking.integration_account_id=${input.integrationAccountId}
  `.execute(db);
  const delivery = reference.rows[0];
  if (!delivery) throw new DeliveryDomainError('NOT_FOUND', 'Courier booking was not found.');
  const idempotencyKey = `provider-event:${input.courierBookingId}:${input.providerEventId}`;
  const alreadyFinal = delivery.outcome_status !== 'PENDING';
  const staleBeforeLock = Boolean(
    delivery.last_tracking_event_at && input.occurredAt < delivery.last_tracking_event_at,
  );
  const canRecordAttempt =
    !alreadyFinal &&
    !staleBeforeLock &&
    ['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(delivery.operational_status);
  if (
    (input.normalizedStatus === 'DELIVERED' || input.normalizedStatus === 'FAILED') &&
    canRecordAttempt
  )
    return recordOutcome(db, {
      organizationId: input.organizationId,
      actorId: input.integrationAccountId,
      deliveryId: delivery.delivery_id,
      expectedVersion: Number(delivery.version),
      idempotencyKey,
      kind: input.normalizedStatus,
      source: 'PROVIDER',
      courierBookingId: input.courierBookingId,
      providerStatusRaw: input.providerStatus,
      providerEventId: input.providerEventId,
      occurredAt: input.occurredAt,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
  if (input.normalizedStatus === 'ATTEMPT_FAILED' && canRecordAttempt)
    return recordDeliveryAttempt(db, {
      organizationId: input.organizationId,
      actorId: input.integrationAccountId,
      deliveryId: delivery.delivery_id,
      expectedVersion: Number(delivery.version),
      outcome: 'PROVIDER_FAILURE',
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.note ? { note: input.note } : {}),
      idempotencyKey,
    });

  return db.transaction().execute(async (transaction) => {
    const started = await beginIdempotent(transaction, {
      organizationId: input.organizationId,
      actorId: input.integrationAccountId,
      operation: 'delivery.provider-event',
      idempotencyKey,
      request: input,
    });
    if (started.replay)
      return getDelivery(transaction, {
        organizationId: input.organizationId,
        deliveryId: (started.replay as { deliveryId: string }).deliveryId,
      });
    const current = await sql<{
      operational_status: DeliveryOperationalStatus;
      outcome_status: DeliveryOutcomeStatus;
      last_tracking_event_at: Date | null;
    }>`select operational_status, outcome_status, last_tracking_event_at from delivery.deliveries
      where organization_id=${input.organizationId} and id=${delivery.delivery_id} for update`.execute(
      transaction,
    );
    const row = current.rows[0];
    if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Delivery was not found.');
    const terminal = ['DELIVERED', 'CANCELLED', 'RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'].includes(
      row.operational_status,
    );
    const stale = Boolean(
      row.last_tracking_event_at && input.occurredAt < row.last_tracking_event_at,
    );
    const nextStatus = input.normalizedStatus as DeliveryOperationalStatus;
    const finalAttemptAlreadyRecorded =
      ['DELIVERED', 'FAILED', 'ATTEMPT_FAILED'].includes(input.normalizedStatus) &&
      row.outcome_status !== 'PENDING';
    const invalidTransition = !providerTransitionAllowed(
      row.operational_status,
      input.normalizedStatus,
    );
    // Reverse transport is owned by the Returns domain. Courier evidence is
    // retained here, but only the RTO workflow may move those states so a
    // provider status can never masquerade as physical warehouse receipt.
    const returnOwnedStatus = ['RTO_INITIATED', 'RETURNING', 'RETURNED_TO_ORIGIN'].includes(
      input.normalizedStatus,
    );
    const ignoreStateChange =
      stale || terminal || finalAttemptAlreadyRecorded || invalidTransition || returnOwnedStatus;
    let nextOutcome = row.outcome_status;
    if (input.normalizedStatus === 'CANCELLED') nextOutcome = 'CANCELLED_BEFORE_HANDOVER';
    if (input.normalizedStatus === 'RETURNED_TO_ORIGIN') nextOutcome = 'RETURNED_TO_ORIGIN';
    if (input.normalizedStatus === 'LOST') nextOutcome = 'LOST';
    if (input.normalizedStatus === 'DAMAGED') nextOutcome = 'DAMAGED';
    await appendEvent(transaction, {
      organizationId: input.organizationId,
      deliveryId: delivery.delivery_id,
      courierBookingId: input.courierBookingId,
      type: input.normalizedStatus,
      source: 'PROVIDER',
      providerStatusRaw: input.providerStatus,
      providerEventId: input.providerEventId,
      normalizedStatus: input.normalizedStatus,
      occurredAt: input.occurredAt,
      metadata: {
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(ignoreStateChange ? { stateChangeIgnored: true } : {}),
        ...(invalidTransition ? { ignoreReason: 'INVALID_TRANSITION' } : {}),
        ...(returnOwnedStatus ? { ignoreReason: 'RETURN_DOMAIN_OWNED' } : {}),
      },
    });
    if (!ignoreStateChange) {
      await sql`update delivery.deliveries set operational_status=${nextStatus}, outcome_status=${nextOutcome}, last_tracking_event_at=${input.occurredAt}, failed_at=case when ${nextStatus} in ('LOST','DAMAGED') then coalesce(failed_at,${input.occurredAt}) else failed_at end, version=version+1, updated_at=now() where id=${delivery.delivery_id}`.execute(
        transaction,
      );
      await sql`update delivery.courier_bookings set provider_status_raw=${input.providerStatus}, last_reconciled_at=now(), updated_at=now(), version=version+1 where id=${input.courierBookingId}`.execute(
        transaction,
      );
    }
    await completeIdempotency(transaction, started.recordId!, delivery.delivery_id);
    await emit(transaction, {
      organizationId: input.organizationId,
      actorId: input.integrationAccountId,
      deliveryId: delivery.delivery_id,
      action: 'delivery.provider_event.recorded',
      eventType: 'delivery.status_changed',
      metadata: { normalizedStatus: input.normalizedStatus, stateChangeIgnored: ignoreStateChange },
    });
    return getDelivery(transaction, {
      organizationId: input.organizationId,
      deliveryId: delivery.delivery_id,
    });
  });
}

/**
 * Persists the authenticated raw provider event before applying normalized
 * Delivery state. Duplicate provider IDs/payloads are acknowledged without
 * producing duplicate attempts, notifications, or outbox events.
 */
export async function ingestCourierTrackingEvent(
  db: Kysely<DatabaseSchema>,
  input: Parameters<typeof recordProviderTrackingEvent>[1] & {
    authenticationStatus: 'VERIFIED' | 'FAILED' | 'NOT_APPLICABLE';
    rawPayload: Record<string, unknown>;
  },
): Promise<{ created: boolean; delivery?: DeliveryView }> {
  const receipt = await ingestProviderEvent(db, {
    organizationId: input.organizationId,
    integrationAccountId: input.integrationAccountId,
    providerEventId: input.providerEventId,
    eventType: 'COURIER_TRACKING',
    providerStatus: input.providerStatus,
    payload: input.rawPayload,
    authenticationStatus: input.authenticationStatus,
    providerOccurredAt: input.occurredAt,
  });
  let persisted: { id: string; processingStatus: string } | undefined;
  if (receipt.created && receipt.id) persisted = { id: receipt.id, processingStatus: 'PENDING' };
  else {
    const existing = await sql<{
      id: string;
      processing_status: string;
    }>`select id,processing_status
      from integrations.inbound_provider_events
      where organization_id=${input.organizationId} and integration_account_id=${input.integrationAccountId}
        and provider_event_id=${input.providerEventId}`.execute(db);
    if (existing.rows[0])
      persisted = {
        id: existing.rows[0].id,
        processingStatus: existing.rows[0].processing_status,
      };
  }
  if (!persisted || ['PROCESSED', 'IGNORED'].includes(persisted.processingStatus))
    return { created: false };
  if (input.authenticationStatus !== 'VERIFIED') {
    await sql`update integrations.inbound_provider_events set processing_status='IGNORED',processed_at=now()
      where organization_id=${input.organizationId} and id=${persisted.id}`.execute(db);
    return { created: true };
  }
  try {
    const delivery = await recordProviderTrackingEvent(db, input);
    await sql`update integrations.inbound_provider_events set processing_status='PROCESSED',processed_at=now()
      where organization_id=${input.organizationId} and id=${persisted.id}`.execute(db);
    return { created: true, delivery };
  } catch (error) {
    await sql`update integrations.inbound_provider_events set processing_status='FAILED',processed_at=now()
      where organization_id=${input.organizationId} and id=${persisted.id}`.execute(db);
    throw error;
  }
}
