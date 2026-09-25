import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { DeliveryDomainError } from './delivery.js';
import { appendAuditEvent } from './platform.js';

function assertMoney(amount: string, currency: string): void {
  if (!/^\d+(?:\.\d{1,4})?$/.test(amount) || Number(amount) < 0)
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Amount must be a non-negative decimal.');
  if (!/^[A-Z]{3}$/.test(currency))
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Currency must be a three-letter code.');
}

async function deliveryReference(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deliveryId: string,
) {
  const result = await sql<{
    id: string;
    order_id: string;
    version: string;
    currency_code: string;
    cod_required: boolean;
  }>`select id,order_id,version::text,currency_code,cod_required
    from delivery.deliveries
    where organization_id=${organizationId} and id=${deliveryId}`.execute(db);
  const row = result.rows[0];
  if (!row) throw new DeliveryDomainError('NOT_FOUND', 'Delivery was not found.');
  return row;
}

async function emitFinancialObservation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    action: string;
    eventType: string;
    entityId: string;
    orderId: string;
    deliveryVersion: string;
  },
) {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'delivery.delivery',
    targetId: input.deliveryId,
    metadata: { observationId: input.entityId },
  });
  await sql`insert into platform.outbox_events
    (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${input.organizationId},${input.eventType},1,'delivery.delivery',${input.deliveryId}::uuid,${input.deliveryVersion}::bigint,
      ${JSON.stringify({ deliveryId: input.deliveryId, orderId: input.orderId, observationId: input.entityId })}::jsonb,now())`.execute(
    db,
  );
}

/**
 * Provider collection is evidence, not Payment truth. Finance records the COD
 * Payment only after the amount/reference is deliberately confirmed.
 */
export async function recordProviderCollectionObservation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    courierBookingId: string;
    providerEventId: string;
    collectedAmount: string;
    currency: string;
    collectedAt: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string; replayed: boolean }> {
  assertMoney(input.collectedAmount, input.currency);
  if (!input.providerEventId.trim())
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Provider event ID is required.');
  return db.transaction().execute(async (tx) => {
    const delivery = await deliveryReference(tx, input.organizationId, input.deliveryId);
    if (!delivery.cod_required)
      throw new DeliveryDomainError('CONFLICT', 'This Delivery has no COD collection obligation.');
    if (delivery.currency_code !== input.currency)
      throw new DeliveryDomainError(
        'VALIDATION_FAILED',
        'Collection currency does not match Delivery.',
      );
    const booking = await sql<{ id: string }>`select id from delivery.courier_bookings
      where organization_id=${input.organizationId} and id=${input.courierBookingId}
        and delivery_id=${input.deliveryId}`.execute(tx);
    if (!booking.rows[0])
      throw new DeliveryDomainError(
        'NOT_FOUND',
        'Courier booking was not found for this Delivery.',
      );
    const inserted = await sql<{ id: string }>`insert into delivery.provider_collection_observations
      (organization_id,delivery_id,courier_booking_id,provider_event_id,currency_code,collected_amount,collected_at,metadata)
      values (${input.organizationId},${input.deliveryId},${input.courierBookingId},${input.providerEventId.trim()},${input.currency},${input.collectedAmount}::numeric,${input.collectedAt}::timestamptz,${JSON.stringify(input.metadata ?? {})}::jsonb)
      on conflict (courier_booking_id,provider_event_id) where courier_booking_id is not null and provider_event_id is not null do nothing
      returning id`.execute(tx);
    const existing = inserted.rows[0]
      ? undefined
      : (
          await sql<{ id: string }>`select id from delivery.provider_collection_observations
            where organization_id=${input.organizationId} and courier_booking_id=${input.courierBookingId}
              and provider_event_id=${input.providerEventId.trim()}`.execute(tx)
        ).rows[0];
    const id = inserted.rows[0]?.id ?? existing?.id;
    if (!id)
      throw new DeliveryDomainError('CONFLICT', 'Collection observation could not be recorded.');
    if (inserted.rows[0])
      await emitFinancialObservation(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: input.deliveryId,
        action: 'delivery.cod_collection.observed',
        eventType: 'delivery.cod_collection_observed',
        entityId: id,
        orderId: delivery.order_id,
        deliveryVersion: delivery.version,
      });
    return { id, replayed: !inserted.rows[0] };
  });
}

/** Actual courier cost remains separate from the customer-facing shipping fee. */
export async function recordProviderCharge(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    deliveryId: string;
    courierBookingId: string;
    providerReference: string;
    chargeType: 'DELIVERY' | 'COD_COLLECTION' | 'RTO' | 'SURCHARGE' | 'OTHER';
    chargeBasis: 'ESTIMATE' | 'ACTUAL' | 'ADJUSTMENT';
    amount: string;
    currency: string;
    occurredAt?: string;
  },
): Promise<{ id: string; replayed: boolean }> {
  assertMoney(input.amount, input.currency);
  if (!input.providerReference.trim())
    throw new DeliveryDomainError('VALIDATION_FAILED', 'Provider charge reference is required.');
  return db.transaction().execute(async (tx) => {
    const delivery = await deliveryReference(tx, input.organizationId, input.deliveryId);
    if (delivery.currency_code !== input.currency)
      throw new DeliveryDomainError(
        'VALIDATION_FAILED',
        'Charge currency does not match Delivery.',
      );
    const booking = await sql<{ id: string }>`select id from delivery.courier_bookings
      where organization_id=${input.organizationId} and id=${input.courierBookingId}
        and delivery_id=${input.deliveryId}`.execute(tx);
    if (!booking.rows[0])
      throw new DeliveryDomainError(
        'NOT_FOUND',
        'Courier booking was not found for this Delivery.',
      );
    const inserted = await sql<{ id: string }>`insert into delivery.provider_charges
      (organization_id,delivery_id,courier_booking_id,charge_type,charge_basis,currency_code,amount,provider_reference,occurred_at)
      values (${input.organizationId},${input.deliveryId},${input.courierBookingId},${input.chargeType},${input.chargeBasis},${input.currency},${input.amount}::numeric,${input.providerReference.trim()},${input.occurredAt ?? new Date().toISOString()}::timestamptz)
      on conflict (organization_id,courier_booking_id,provider_reference,charge_type) where provider_reference is not null do nothing
      returning id`.execute(tx);
    const existing = inserted.rows[0]
      ? undefined
      : (
          await sql<{ id: string }>`select id from delivery.provider_charges
            where organization_id=${input.organizationId} and courier_booking_id=${input.courierBookingId}
              and provider_reference=${input.providerReference.trim()} and charge_type=${input.chargeType}`.execute(
            tx,
          )
        ).rows[0];
    const id = inserted.rows[0]?.id ?? existing?.id;
    if (!id) throw new DeliveryDomainError('CONFLICT', 'Courier charge could not be recorded.');
    if (inserted.rows[0])
      await emitFinancialObservation(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: input.deliveryId,
        action: 'delivery.courier_charge.recorded',
        eventType: 'delivery.courier_charge_recorded',
        entityId: id,
        orderId: delivery.order_id,
        deliveryVersion: delivery.version,
      });
    return { id, replayed: !inserted.rows[0] };
  });
}

export async function listDeliveryFinancialObservations(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; deliveryId: string },
) {
  await deliveryReference(db, input.organizationId, input.deliveryId);
  const [collections, charges] = await Promise.all([
    sql<{
      id: string;
      collected_amount: string;
      currency_code: string;
      collected_at: string;
    }>`select id,collected_amount::text,currency_code,collected_at::text
      from delivery.provider_collection_observations
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
      order by collected_at desc,id desc`.execute(db),
    sql<{
      id: string;
      charge_type: string;
      charge_basis: string;
      amount: string;
      currency_code: string;
      occurred_at: string;
    }>`select id,charge_type,charge_basis,amount::text,currency_code,occurred_at::text
      from delivery.provider_charges
      where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
      order by occurred_at desc,id desc`.execute(db),
  ]);
  return { collections: collections.rows, charges: charges.rows };
}
