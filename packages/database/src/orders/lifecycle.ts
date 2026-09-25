import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import {
  cancelOpenFulfillmentsForOrderInTransaction,
  FulfillmentDomainError,
} from '../fulfillment.js';
import {
  releaseInventoryReservationInTransaction,
} from '../inventory.js';
import {
  cancelPendingPaymentIntentsForOrder,
  createCancellationRefundObligationsInTransaction,
  PaymentDomainError,
  reviseOpenPaymentIntentForOrder,
} from '../payments.js';
import {
  appendAuditEvent,
  claimIdempotencyRecord,
  IdempotencyKeyReuseError,
} from '../platform.js';
import { ensureAddress } from './checkout.js';
import { orderView } from './queries.js';
import {
  OrderDomainError,
  type CheckoutAddressInput,
  type OrderView,
} from './types.js';

export async function updateOrderStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    nextStatus: 'CONFIRMED' | 'ON_HOLD';
    reason?: string;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{
      order_status: string;
      version: string;
    }>`select order_status, version::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before updating.');
    const valid =
      (input.nextStatus === 'CONFIRMED' && row.order_status === 'PENDING') ||
      (input.nextStatus === 'ON_HOLD' && ['PENDING', 'CONFIRMED'].includes(row.order_status));
    if (!valid)
      throw new OrderDomainError('INVALID_TRANSITION', 'This Order transition is not allowed.');
    await sql`update orders.orders set order_status = ${input.nextStatus}, confirmed_at = case when ${input.nextStatus} = 'CONFIRMED' then now() else confirmed_at end, version = version + 1, updated_at = now() where id = ${input.orderId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `orders.order.${input.nextStatus.toLocaleLowerCase()}`,
      targetType: 'orders.order',
      targetId: input.orderId,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId},
        ${input.nextStatus === 'CONFIRMED' ? 'orders.order.confirmed' : 'orders.order.placed_on_hold'},
        1, 'orders.order', ${input.orderId}, ${Number(row.version) + 1},
        ${JSON.stringify({ orderId: input.orderId, nextStatus: input.nextStatus, reason: input.reason ?? null })}::jsonb,
        now()
      )
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

/**
 * Cancels one complete line before fulfillment/payment activity begins. The
 * original line remains immutable evidence; active totals and obligations are
 * reduced atomically and the line's reservation is released through Inventory.
 */
export async function cancelOrderLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    orderLineId: string;
    expectedVersion: number;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
): Promise<OrderView> {
  const reasonCode = input.reasonCode.trim();
  const reasonText = input.reasonText?.trim() || null;
  if (!reasonCode)
    throw new OrderDomainError('VALIDATION_FAILED', 'A line cancellation reason is required.');

  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'orders.cancel-line',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          orderLineId: input.orderLineId,
          expectedVersion: input.expectedVersion,
          reasonCode,
          reasonText,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') return orderView(transaction, input.orderId);
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This line cancellation is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const orderResult = await sql<{
      order_status: OrderView['status'];
      version: string;
      total_amount: string;
    }>`
      select order_status, version::text, total_amount::text
      from orders.orders
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      for update
    `.execute(transaction);
    const order = orderResult.rows[0];
    if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(order.version) !== input.expectedVersion)
      throw new OrderDomainError(
        'STALE_VERSION',
        'Order has changed; reload before cancelling an item.',
      );
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.order_status))
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Items can only be cancelled before an Order is completed or cancelled.',
      );

    const lineResult = await sql<{
      id: string;
      sku_snapshot: string;
      line_status: 'ACTIVE' | 'CANCELLED';
      gross_amount: string;
      discount_amount: string;
      net_amount: string;
      reservation_id: string | null;
    }>`
      select line.id, line.sku_snapshot, line.line_status,
        line.gross_amount::text, line.discount_amount::text, line.net_amount::text,
        bridge.reservation_id
      from orders.order_lines line
      left join orders.order_inventory_reservations bridge
        on bridge.organization_id = line.organization_id and bridge.order_line_id = line.id
      where line.organization_id = ${input.organizationId}
        and line.order_id = ${input.orderId}
        and line.id = ${input.orderLineId}
      for update of line
    `.execute(transaction);
    const line = lineResult.rows[0];
    if (!line) throw new OrderDomainError('NOT_FOUND', 'Order line was not found.');
    if (line.line_status === 'CANCELLED') {
      await sql`
        update platform.idempotency_records
        set status = 'SUCCEEDED', result_entity_type = 'orders.order_line',
            result_entity_id = ${input.orderLineId}::uuid,
            safe_response = ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId })}::jsonb,
            completed_at = now()
        where id = ${idempotencyRecordId}
      `.execute(transaction);
      return orderView(transaction, input.orderId);
    }

    const eligibility = await sql<{
      active_line_count: number;
      fulfillment_count: number;
    }>`
      select
        (select count(*)::int from orders.order_lines candidate
          where candidate.organization_id = ${input.organizationId}
            and candidate.order_id = ${input.orderId}
            and candidate.line_status = 'ACTIVE') as active_line_count,
        (select count(*)::int from fulfillment.fulfillment_lines fulfillment_line
          join fulfillment.fulfillments fulfillment
            on fulfillment.organization_id = fulfillment_line.organization_id
            and fulfillment.id = fulfillment_line.fulfillment_id
          where fulfillment.organization_id = ${input.organizationId}
            and fulfillment.order_id = ${input.orderId}) as fulfillment_count
    `.execute(transaction);
    const policy = eligibility.rows[0]!;
    if (policy.active_line_count <= 1)
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'Cancel the entire Order instead of cancelling its final active item.',
      );
    if (policy.fulfillment_count > 0)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Order items cannot be cancelled after fulfillment allocation has started.',
      );

    const nextTotal = await sql<{ amount: string }>`
      select (${order.total_amount}::numeric - ${line.net_amount}::numeric)::numeric(20,4)::text as amount
    `.execute(transaction);
    try {
      await reviseOpenPaymentIntentForOrder(transaction, {
        organizationId: input.organizationId,
        orderId: input.orderId,
        expectedAmount: nextTotal.rows[0]!.amount,
      });
    } catch (error) {
      if (error instanceof PaymentDomainError)
        throw new OrderDomainError('INVALID_TRANSITION', error.message);
      throw error;
    }

    if (line.reservation_id)
      await releaseInventoryReservationInTransaction(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        reservationId: line.reservation_id,
        idempotencyKey: `order-line-cancel:${input.orderLineId}:${line.reservation_id}`,
        authority: { type: 'ORDER_AMENDMENT', orderId: input.orderId },
      });

    await sql`
      update orders.order_lines
      set line_status = 'CANCELLED', cancelled_at = now(),
          cancelled_by_actor_id = ${input.actorId},
          cancellation_reason_code = ${reasonCode},
          cancellation_reason_text = ${reasonText}
      where organization_id = ${input.organizationId} and id = ${input.orderLineId}
    `.execute(transaction);
    const updated = await sql<{ version: string }>`
      update orders.orders
      set subtotal_amount = subtotal_amount - ${line.gross_amount}::numeric,
          discount_amount = discount_amount - ${line.discount_amount}::numeric,
          total_amount = total_amount - ${line.net_amount}::numeric,
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      returning version::text
    `.execute(transaction);
    await sql`
      insert into orders.order_line_cancellations (
        organization_id, order_id, order_line_id, reason_code, reason_text,
        amount_removed, reservation_id, created_by_actor_id
      ) values (
        ${input.organizationId}, ${input.orderId}, ${input.orderLineId}, ${reasonCode},
        ${reasonText}, ${line.net_amount}::numeric, ${line.reservation_id}, ${input.actorId}
      )
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.line_cancelled',
      targetType: 'orders.order_line',
      targetId: input.orderLineId,
      ...(reasonText ? { reason: reasonText } : {}),
      metadata: {
        orderId: input.orderId,
        sku: line.sku_snapshot,
        reasonCode,
        amountRemoved: line.net_amount,
        reservationId: line.reservation_id,
      },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.line_cancelled', 1, 'orders.order',
        ${input.orderId}, ${Number(updated.rows[0]!.version)},
        ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId, reasonCode, amountRemoved: line.net_amount })}::jsonb,
        now()
      )
    `.execute(transaction);
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order_line',
          result_entity_id = ${input.orderLineId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

/** Corrects the immutable delivery snapshot before fulfillment starts and keeps both versions as evidence. */
export async function updateOrderDeliveryAddress(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    address: CheckoutAddressInput;
    reason: string;
    idempotencyKey: string;
  },
): Promise<OrderView> {
  ensureAddress(input.address);
  const reason = input.reason.trim();
  if (!reason)
    throw new OrderDomainError('VALIDATION_FAILED', 'An address correction reason is required.');
  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'orders.correct-delivery-address',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          expectedVersion: input.expectedVersion,
          address: input.address,
          reason,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') return orderView(transaction, input.orderId);
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This address correction is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const orderResult = await sql<{ order_status: OrderView['status']; version: string }>`
      select order_status, version::text from orders.orders
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      for update
    `.execute(transaction);
    const order = orderResult.rows[0];
    if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(order.version) !== input.expectedVersion)
      throw new OrderDomainError(
        'STALE_VERSION',
        'Order has changed; reload before correcting its address.',
      );
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.order_status))
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'The delivery address can only be corrected before the Order is completed or cancelled.',
      );
    const allocated = await sql<{ exists: boolean }>`
      select exists (
        select 1 from fulfillment.fulfillments fulfillment
        join fulfillment.fulfillment_lines line
          on line.organization_id = fulfillment.organization_id
          and line.fulfillment_id = fulfillment.id
        where fulfillment.organization_id = ${input.organizationId}
          and fulfillment.order_id = ${input.orderId}
      ) as exists
    `.execute(transaction);
    if (allocated.rows[0]?.exists)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'The delivery address cannot be changed after fulfillment allocation has started.',
      );

    const currentResult = await sql<{
      id: string;
      source_customer_address_id: string | null;
      geography_node_id: string | null;
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
      select id, source_customer_address_id, geography_node_id, recipient_name, phone,
        address_line_1, address_line_2, area, city, district, postal_code, country_code
      from orders.order_addresses
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
        and address_type = 'DELIVERY'
      for update
    `.execute(transaction);
    const current = currentResult.rows[0];
    if (!current) throw new OrderDomainError('NOT_FOUND', 'Delivery address was not found.');
    const beforeSnapshot = {
      recipientName: current.recipient_name,
      phone: current.phone,
      addressLine1: current.address_line_1,
      addressLine2: current.address_line_2,
      geographyNodeId: current.geography_node_id,
      area: current.area,
      city: current.city,
      district: current.district,
      postalCode: current.postal_code,
      countryCode: current.country_code,
    };
    const afterSnapshot = {
      recipientName: input.address.recipientName.trim(),
      phone: input.address.phone.trim(),
      addressLine1: input.address.addressLine1.trim(),
      addressLine2: input.address.addressLine2?.trim() || null,
      geographyNodeId: input.address.geographyNodeId ?? null,
      area: input.address.area?.trim() || null,
      city: input.address.city?.trim() || null,
      district: input.address.district?.trim() || null,
      postalCode: input.address.postalCode?.trim() || null,
      countryCode: input.address.countryCode.trim().toLocaleUpperCase(),
    };
    await sql`
      update orders.order_addresses
      set source_customer_address_id = null,
          geography_node_id = ${afterSnapshot.geographyNodeId},
          recipient_name = ${afterSnapshot.recipientName}, phone = ${afterSnapshot.phone},
          address_line_1 = ${afterSnapshot.addressLine1}, address_line_2 = ${afterSnapshot.addressLine2},
          area = ${afterSnapshot.area}, city = ${afterSnapshot.city}, district = ${afterSnapshot.district},
          postal_code = ${afterSnapshot.postalCode}, country_code = ${afterSnapshot.countryCode}
      where organization_id = ${input.organizationId} and id = ${current.id}
    `.execute(transaction);
    const updated = await sql<{ version: string }>`
      update orders.orders set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      returning version::text
    `.execute(transaction);
    await sql`
      insert into orders.order_address_corrections (
        organization_id, order_id, order_address_id, before_snapshot, after_snapshot,
        reason, created_by_actor_id
      ) values (
        ${input.organizationId}, ${input.orderId}, ${current.id},
        ${JSON.stringify(beforeSnapshot)}::jsonb, ${JSON.stringify(afterSnapshot)}::jsonb,
        ${reason}, ${input.actorId}
      )
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.delivery_address_corrected',
      targetType: 'orders.order',
      targetId: input.orderId,
      reason,
      metadata: { before: beforeSnapshot, after: afterSnapshot },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.delivery_address_corrected', 1,
        'orders.order', ${input.orderId}, ${Number(updated.rows[0]!.version)},
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now()
      )
    `.execute(transaction);
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order',
          result_entity_id = ${input.orderId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

export async function cancelOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
    actorType?: 'USER' | 'SYSTEM';
    /** Worker-only proof that this cancellation is driven by an eligible timed-out intent. */
    paymentTimeoutIntentId?: string;
  },
): Promise<{ order: OrderView; releasedReservations: number; cancelledFulfillments: number }> {
  if (!input.reasonCode.trim())
    throw new OrderDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: input.actorType ?? 'USER',
        principalId: input.actorId,
        operationType: 'orders.cancel',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          expectedVersion: input.expectedVersion,
          reasonCode: input.reasonCode.trim(),
          reasonText: input.reasonText?.trim() ?? null,
          paymentTimeoutIntentId: input.paymentTimeoutIntentId ?? null,
        }),
      });
      if (!record.created) {
        if (record.status !== 'SUCCEEDED')
          throw new OrderDomainError(
            'IDEMPOTENCY_CONFLICT',
            'This Order cancellation is already in progress.',
          );
        const replay = await sql<{
          safe_response: { releasedReservations?: number; cancelledFulfillments?: number } | null;
        }>`select safe_response from platform.idempotency_records where id = ${record.id}`.execute(
          transaction,
        );
        return {
          order: await orderView(transaction, input.orderId),
          releasedReservations: replay.rows[0]?.safe_response?.releasedReservations ?? 0,
          cancelledFulfillments: replay.rows[0]?.safe_response?.cancelledFulfillments ?? 0,
        };
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different cancellation details.',
        );
      throw error;
    }
    const order = await sql<{
      order_status: string;
      version: string;
    }>`select order_status, version::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (row.order_status === 'CANCELLED') {
      const response = { releasedReservations: 0, cancelledFulfillments: 0 };
      await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${idempotencyRecordId}`.execute(
        transaction,
      );
      return { order: await orderView(transaction, input.orderId), ...response };
    }
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(row.order_status))
      throw new OrderDomainError('INVALID_TRANSITION', 'This Order cannot be cancelled.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before cancelling.');
    if (input.paymentTimeoutIntentId) {
      if (row.order_status !== 'PENDING')
        throw new OrderDomainError(
          'INVALID_TRANSITION',
          'Only a pending unpaid Order can expire automatically.',
        );
      const eligibleIntent = await sql<{ id: string }>`
        select intent.id
        from payments.payment_intents intent
        join payments.payment_methods method
          on method.organization_id = intent.organization_id
          and method.id = intent.payment_method_id
        where intent.organization_id = ${input.organizationId}
          and intent.order_id = ${input.orderId}
          and intent.id = ${input.paymentTimeoutIntentId}
          and intent.status = 'READY'
          and intent.expires_at is not null
          and intent.expires_at <= now()
          and method.method_type = 'MOBILE_WALLET'
          and not exists (
            select 1 from payments.payment_attempts attempt
            where attempt.organization_id = intent.organization_id
              and attempt.payment_intent_id = intent.id
              and attempt.status = 'PENDING_VERIFICATION'
          )
          and not exists (
            select 1
            from payments.payment_allocations allocation
            join payments.payments payment
              on payment.organization_id = allocation.organization_id
              and payment.id = allocation.payment_id
            where allocation.organization_id = intent.organization_id
              and allocation.order_id = intent.order_id
              and payment.status = 'CONFIRMED'
          )
        for update of intent
      `.execute(transaction);
      if (!eligibleIntent.rows[0])
        throw new OrderDomainError(
          'INVALID_TRANSITION',
          'The payment obligation is no longer eligible for automatic expiry.',
        );
    }
    let cancelledFulfillments: number;
    try {
      cancelledFulfillments = await cancelOpenFulfillmentsForOrderInTransaction(transaction, {
        organizationId: input.organizationId,
        ...(input.actorType === 'SYSTEM' ? {} : { actorId: input.actorId }),
        ...(input.actorType ? { actorType: input.actorType } : {}),
        orderId: input.orderId,
      });
    } catch (error) {
      if (error instanceof FulfillmentDomainError)
        throw new OrderDomainError('INVALID_TRANSITION', error.message);
      throw error;
    }
    const reservations = await sql<{
      reservation_id: string;
    }>`select reservation_id from orders.order_inventory_reservations where order_id = ${input.orderId} order by reservation_id`.execute(
      transaction,
    );
    let releasedReservations = 0;
    for (const reservation of reservations.rows) {
      const release = await releaseInventoryReservationInTransaction(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        reservationId: reservation.reservation_id,
        idempotencyKey: `order-cancel:${input.orderId}:${reservation.reservation_id}`,
        authority: { type: 'ORDER_CANCELLATION', orderId: input.orderId },
        ...(input.actorType ? { actorType: input.actorType } : {}),
      });
      if (release.released) releasedReservations += 1;
    }
    await cancelPendingPaymentIntentsForOrder(transaction, {
      organizationId: input.organizationId,
      orderId: input.orderId,
    });
    await sql`update orders.orders set order_status = 'CANCELLED', cancelled_at = now(), version = version + 1, updated_at = now() where id = ${input.orderId}`.execute(
      transaction,
    );
    const cancellation = await sql<{ id: string }>`insert into orders.order_cancellations (organization_id, order_id, reason_code, reason_text, created_by_actor_id) values (${input.organizationId}, ${input.orderId}, ${input.reasonCode.trim()}, ${input.reasonText?.trim() ?? null}, ${input.actorType === 'SYSTEM' ? null : input.actorId}) returning id`.execute(
      transaction,
    );
    const cancellationRefunds = await createCancellationRefundObligationsInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: input.orderId,
      cancellationId: cancellation.rows[0]!.id,
      ...(input.reasonText ? { reasonText: input.reasonText } : {}),
    });
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: input.actorType ?? 'USER',
      ...(input.actorType === 'SYSTEM' ? {} : { actorId: input.actorId }),
      action: 'orders.order.cancelled',
      targetType: 'orders.order',
      targetId: input.orderId,
      ...(input.reasonText ? { reason: input.reasonText } : {}),
      metadata: {
        reasonCode: input.reasonCode,
        releasedReservations,
        cancelledFulfillments,
        refundObligationCount: cancellationRefunds.length,
      },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'orders.order.cancelled', 1, 'orders.order', ${input.orderId}, 1, ${JSON.stringify({ orderId: input.orderId, releasedReservations, cancelledFulfillments, refundObligationCount: cancellationRefunds.length })}::jsonb, now())`.execute(
      transaction,
    );
    const response = { releasedReservations, cancelledFulfillments };
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${idempotencyRecordId}`.execute(
      transaction,
    );
    return { order: await orderView(transaction, input.orderId), ...response };
  });
}

/**
 * Cancels only expired, unpaid manual-payment Orders. Candidate discovery is
 * intentionally optimistic; cancelOrder re-locks and revalidates the Order and
 * Payment Intent so verification, fulfillment, or operator activity wins safely.
 */
export async function processExpiredPaymentOrders(
  db: Kysely<DatabaseSchema>,
  limit = 100,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
    throw new OrderDomainError('VALIDATION_FAILED', 'Payment expiry batch limit is invalid.');
  const candidates = await sql<{
    organization_id: string;
    order_id: string;
    intent_id: string;
    version: string;
  }>`
    select intent.organization_id, intent.order_id, intent.id as intent_id, order_row.version::text
    from payments.payment_intents intent
    join payments.payment_methods method
      on method.organization_id = intent.organization_id and method.id = intent.payment_method_id
    join orders.orders order_row
      on order_row.organization_id = intent.organization_id and order_row.id = intent.order_id
    where intent.status = 'READY'
      and intent.expires_at is not null
      and intent.expires_at <= now()
      and method.method_type = 'MOBILE_WALLET'
      and order_row.order_status = 'PENDING'
      and not exists (
        select 1 from payments.payment_attempts attempt
        where attempt.organization_id = intent.organization_id
          and attempt.payment_intent_id = intent.id
          and attempt.status = 'PENDING_VERIFICATION'
      )
      and not exists (
        select 1
        from payments.payment_allocations allocation
        join payments.payments payment
          on payment.organization_id = allocation.organization_id
          and payment.id = allocation.payment_id
        where allocation.organization_id = intent.organization_id
          and allocation.order_id = intent.order_id
          and payment.status = 'CONFIRMED'
      )
    order by intent.expires_at, intent.id
    limit ${limit}
  `.execute(db);
  let expired = 0;
  for (const candidate of candidates.rows) {
    try {
      await cancelOrder(db, {
        organizationId: candidate.organization_id,
        actorId: candidate.organization_id,
        actorType: 'SYSTEM',
        orderId: candidate.order_id,
        expectedVersion: Number(candidate.version),
        reasonCode: 'PAYMENT_TIMEOUT',
        reasonText: 'Manual payment window expired without a verified payment.',
        idempotencyKey: `payment-timeout:${candidate.intent_id}`,
        paymentTimeoutIntentId: candidate.intent_id,
      });
      expired += 1;
    } catch (error) {
      if (
        error instanceof OrderDomainError &&
        ['STALE_VERSION', 'INVALID_TRANSITION'].includes(error.code)
      )
        continue;
      throw error;
    }
  }
  return expired;
}

/**
 * Adds an operator note to an order. Notes are append-only — there is no edit/delete.
 * INTERNAL notes are visible only to admin staff; CUSTOMER_VISIBLE may be surfaced
 * to the customer in future notification workflows.
 */
export async function addOrderNote(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE';
    body: string;
  },
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new OrderDomainError('VALIDATION_FAILED', 'Note body cannot be empty.');
  // Verify the order exists and belongs to this organization.
  const exists = await sql<{ id: string }>`
    select id from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId}
  `.execute(db);
  if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  const created = await sql<{ id: string }>`
    insert into orders.order_notes (organization_id, order_id, author_actor_id, note_type, body)
    values (${input.organizationId}, ${input.orderId}, ${input.actorId}, ${input.noteType}, ${body})
    returning id
  `.execute(db);
  const id = created.rows[0]?.id;
  if (!id) throw new Error('Note creation did not return an id.');
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'orders.order.note_added',
    targetType: 'orders.order',
    targetId: input.orderId,
    metadata: { noteType: input.noteType },
  });
  return { id };
}

/**
 * Transitions an ON_HOLD order back to CONFIRMED, resuming normal processing.
 * Version-checked to prevent lost-update races.
 */
export async function resumeOrderFromHold(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{ order_status: string; version: string }>`
      select order_status, version::text from orders.orders
      where id = ${input.orderId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before updating.');
    if (row.order_status !== 'ON_HOLD')
      throw new OrderDomainError('INVALID_TRANSITION', 'Only ON_HOLD orders can be resumed.');
    await sql`
      update orders.orders
      set order_status = 'CONFIRMED', version = version + 1, updated_at = now()
      where id = ${input.orderId}
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.confirmed',
      targetType: 'orders.order',
      targetId: input.orderId,
      metadata: { resumedFromHold: true },
    });
    await sql`
      insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'orders.order.resumed', 1, 'orders.order', ${input.orderId}, 1,
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now())
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

/**
 * Transitions a CONFIRMED order to COMPLETED.
 *
 * Normally triggered automatically by the background consumer when it receives
 * the `delivery.all_lines_delivered` outbox event — in that case, pass the
 * outbox event ID as the `idempotencyKey` and `triggerOutboxEventId`.
 *
 * Can also be called manually by an admin (e.g., for partially-delivered orders
 * where the customer confirmed receipt). In that case, `actorId` is set and
 * `triggerOutboxEventId` is null.
 *
 * Guard: all order lines must have sufficient delivered quantity before completing.
 */
export async function completeOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    actorId: string | null;
    idempotencyKey: string;
    triggerOutboxEventId?: string | null;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{ order_status: string; version: string; organization_id: string }>`
      select order_status, version::text, organization_id
      from orders.orders
      where id = ${input.orderId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

    // Idempotency: if already completed, return current state without error.
    if (row.order_status === 'COMPLETED') return orderView(transaction, input.orderId);

    if (row.order_status !== 'CONFIRMED')
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        `Cannot complete an order in ${row.order_status} status.`,
      );

    // Guard: all ordered lines must be covered by delivered delivery lines.
    // An order line is covered when sum(delivery_line.delivered_quantity) >= order_line.quantity.
    const undelivered = await sql<{ count: string }>`
      select count(*)::text as count
      from orders.order_lines ol
      where ol.order_id = ${input.orderId}
        and ol.line_status = 'ACTIVE'
        and (
          select coalesce(sum(dl.delivered_quantity), 0)
          from delivery.delivery_lines dl
          join delivery.deliveries d on d.id = dl.delivery_id
          where dl.order_line_id = ol.id
            and d.outcome_status = 'DELIVERED'
        ) < ol.quantity
    `.execute(transaction);
    if (Number(undelivered.rows[0]?.count ?? 1) > 0)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Not all order lines have been delivered. Cannot complete.',
      );

    // Idempotency check against explicit key (handles retry of auto-completion event).
    let recordId: string | undefined;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId ?? input.orderId,
        operationType: 'orders.complete',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.orderId,
      });
      if (!record.created && record.status === 'SUCCEEDED')
        return orderView(transaction, input.orderId);
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused.');
      throw error;
    }

    await sql`
      update orders.orders
      set order_status = 'COMPLETED', completed_at = now(), version = version + 1, updated_at = now()
      where id = ${input.orderId}
    `.execute(transaction);

    // Record completion traceability — links to the delivery event that triggered this, if any.
    await sql`
      insert into orders.order_completion_events (order_id, organization_id, trigger_outbox_event_id, completed_by_actor_id)
      values (${input.orderId}, ${input.organizationId}, ${input.triggerOutboxEventId ?? null}, ${input.actorId ?? null})
      on conflict (order_id) do nothing
    `.execute(transaction);

    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId })}::jsonb, completed_at = now()
      where id = ${recordId}
    `.execute(transaction);

    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      actorId: input.actorId ?? 'system',
      action: 'orders.order.completed',
      targetType: 'orders.order',
      targetId: input.orderId,
      metadata: { triggerOutboxEventId: input.triggerOutboxEventId ?? null },
    });

    await sql`
      insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'orders.order.completed', 1, 'orders.order', ${input.orderId}, 1,
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now())
    `.execute(transaction);

    return orderView(transaction, input.orderId);
  });
}
