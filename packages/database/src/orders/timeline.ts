import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { OrderDomainError } from './types.js';

export type TimelineEventCategory =
  | 'ORDER'
  | 'PAYMENT'
  | 'FULFILLMENT'
  | 'DELIVERY'
  | 'RETURN'
  | 'VERIFICATION'
  | 'NOTE';

export type TimelineActorType = 'CUSTOMER' | 'ADMIN' | 'SYSTEM' | 'COURIER';

export interface UnifiedTimelineEvent {
  readonly id: string;
  readonly category: TimelineEventCategory;
  readonly eventType: string;
  readonly title: string;
  readonly description: string | null;
  readonly actorType: TimelineActorType;
  readonly actorName?: string | null;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown>;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly payload?: Record<string, unknown>;
}

/**
 * Produces an authoritative, normalized, multi-domain business timeline for an Order.
 * Assembles events from core domain tables rather than relying solely on ephemeral outbox logs.
 */
export async function getOrderTimeline(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly orderId: string;
  },
): Promise<readonly UnifiedTimelineEvent[]> {
  const events: UnifiedTimelineEvent[] = [];

  // 1. Order Core Record
  const orderRow = await sql<{
    id: string;
    order_number: string;
    order_status: string;
    source: string;
    sales_channel: string;
    currency_code: string;
    total_amount: string;
    subtotal_amount: string;
    delivery_amount: string;
    payment_method: string;
    created_at: Date;
    confirmed_at: Date | null;
    completed_at: Date | null;
    cancelled_at: Date | null;
  }>`
    select id, order_number, order_status, source, sales_channel, currency_code,
           total_amount::text, subtotal_amount::text, delivery_amount::text,
           payment_method, created_at, confirmed_at, completed_at, cancelled_at
    from orders.orders
    where organization_id = ${input.organizationId} and id = ${input.orderId}
  `.execute(db);

  const order = orderRow.rows[0];
  if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  // Event: Order Placed
  events.push({
    id: `order-created-${order.id}`,
    category: 'ORDER',
    eventType: 'ORDER_PLACED',
    title: `Order placed via ${order.sales_channel}`,
    description: `Total ৳${Number(order.total_amount).toLocaleString()} (${order.payment_method})`,
    actorType: order.source === 'STOREFRONT' ? 'CUSTOMER' : 'ADMIN',
    occurredAt: order.created_at.toISOString(),
    metadata: {
      orderNumber: order.order_number,
      source: order.source,
      salesChannel: order.sales_channel,
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount,
    },
  });

  // Event: Order Confirmed
  if (order.confirmed_at) {
    events.push({
      id: `order-confirmed-${order.id}`,
      category: 'ORDER',
      eventType: 'ORDER_CONFIRMED',
      title: 'Order confirmed for fulfillment',
      description: 'Commercial terms verified and released for warehouse preparation.',
      actorType: 'ADMIN',
      occurredAt: order.confirmed_at.toISOString(),
      metadata: { orderNumber: order.order_number },
    });
  }

  // 2. Order Verifications & Contact Attempts
  const verifications = await sql<{
    id: string;
    verification_type: string;
    outcome: string;
    notes: string | null;
    actor_id: string;
    actor_name: string | null;
    created_at: Date;
  }>`
    select v.id, v.verification_type, v.outcome, v.notes, v.actor_id,
           coalesce(profile.display_name, u.email) as actor_name, v.created_at
    from orders.order_verifications v
    left join iam.users u on u.id = v.actor_id
    left join iam.user_profiles profile on profile.user_id = u.id
    where v.organization_id = ${input.organizationId} and v.order_id = ${input.orderId}
  `.execute(db);

  for (const v of verifications.rows) {
    const typeLabel = v.verification_type.replace(/_/g, ' ').toLowerCase();
    const outcomeLabel = v.outcome.replace(/_/g, ' ').toLowerCase();
    events.push({
      id: `verification-${v.id}`,
      category: 'VERIFICATION',
      eventType: `VERIFICATION_${v.outcome}`,
      title: `Verification (${typeLabel}): ${outcomeLabel}`,
      description: v.notes,
      actorType: 'ADMIN',
      actorName: v.actor_name,
      occurredAt: v.created_at.toISOString(),
      metadata: {
        verificationType: v.verification_type,
        outcome: v.outcome,
        notes: v.notes,
      },
    });
  }

  // 3. Address Corrections
  const addressCorrections = await sql<{
    id: string;
    reason: string;
    before_snapshot: unknown;
    after_snapshot: unknown;
    created_at: Date;
  }>`
    select id, reason, before_snapshot, after_snapshot, created_at
    from orders.order_address_corrections
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  for (const ac of addressCorrections.rows) {
    events.push({
      id: `address-correction-${ac.id}`,
      category: 'ORDER',
      eventType: 'DELIVERY_ADDRESS_UPDATED',
      title: 'Delivery address corrected',
      description: ac.reason,
      actorType: 'ADMIN',
      occurredAt: ac.created_at.toISOString(),
      metadata: { reason: ac.reason },
    });
  }

  // 4. Line Cancellations
  const lineCancellations = await sql<{
    id: string;
    reason_code: string;
    reason_text: string | null;
    amount_removed: string;
    sku_snapshot: string;
    created_at: Date;
  }>`
    select c.id, c.reason_code, c.reason_text, c.amount_removed::text, ol.sku_snapshot, c.created_at
    from orders.order_line_cancellations c
    join orders.order_lines ol on ol.id = c.order_line_id
    where c.organization_id = ${input.organizationId} and c.order_id = ${input.orderId}
  `.execute(db);

  for (const lc of lineCancellations.rows) {
    events.push({
      id: `line-cancelled-${lc.id}`,
      category: 'ORDER',
      eventType: 'ORDER_LINE_CANCELLED',
      title: `Item cancelled: ${lc.sku_snapshot}`,
      description: `Reduced by ৳${Number(lc.amount_removed).toLocaleString()} (${lc.reason_code}${lc.reason_text ? `: ${lc.reason_text}` : ''})`,
      actorType: 'ADMIN',
      occurredAt: lc.created_at.toISOString(),
      metadata: {
        sku: lc.sku_snapshot,
        amountRemoved: lc.amount_removed,
        reasonCode: lc.reason_code,
        reasonText: lc.reason_text,
      },
    });
  }

  // 5. Order Cancellation
  const cancellationRow = await sql<{
    id: string;
    reason_code: string;
    reason_text: string | null;
    initiated_by: string | null;
    created_at: Date;
  }>`
    select id, reason_code, reason_text, initiated_by, created_at
    from orders.order_cancellations
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  if (cancellationRow.rows[0]) {
    const c = cancellationRow.rows[0];
    const actorType: TimelineActorType =
      c.initiated_by === 'CUSTOMER' ? 'CUSTOMER' : c.initiated_by === 'SYSTEM' ? 'SYSTEM' : 'ADMIN';
    events.push({
      id: `order-cancellation-${c.id}`,
      category: 'ORDER',
      eventType: 'ORDER_CANCELLED',
      title: `Order cancelled (${c.initiated_by ?? 'MERCHANT'})`,
      description: `Reason: ${c.reason_code}${c.reason_text ? ` - ${c.reason_text}` : ''}`,
      actorType,
      occurredAt: c.created_at.toISOString(),
      metadata: {
        reasonCode: c.reason_code,
        reasonText: c.reason_text,
        initiatedBy: c.initiated_by ?? 'MERCHANT',
      },
    });
  }

  // 6. Order Completion
  const completionRow = await sql<{
    completion_reason: string | null;
    created_at: Date;
  }>`
    select completion_reason, created_at
    from orders.order_completion_events
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  if (completionRow.rows[0]) {
    const comp = completionRow.rows[0];
    events.push({
      id: `order-completed-${order.id}`,
      category: 'ORDER',
      eventType: 'ORDER_COMPLETED',
      title: 'Order completed',
      description: comp.completion_reason ?? 'All items delivered and processed.',
      actorType: 'SYSTEM',
      occurredAt: comp.created_at.toISOString(),
      metadata: { reason: comp.completion_reason },
    });
  }

  // 7. Payments & Inbound Attempts
  const payments = await sql<{
    id: string;
    amount: string;
    status: string;
    payment_method: string;
    created_at: Date;
  }>`
    select p.id, alloc.amount::text, p.status, p.payment_method, p.created_at
    from payments.payment_allocations alloc
    join payments.payments p on p.id = alloc.payment_id and p.organization_id = alloc.organization_id
    where alloc.organization_id = ${input.organizationId} and alloc.order_id = ${input.orderId}
  `.execute(db);

  for (const pay of payments.rows) {
    if (pay.status === 'CONFIRMED') {
      events.push({
        id: `payment-confirmed-${pay.id}`,
        category: 'PAYMENT',
        eventType: 'PAYMENT_RECEIVED',
        title: `Payment received: ৳${Number(pay.amount).toLocaleString()}`,
        description: `Method: ${pay.payment_method}`,
        actorType: 'CUSTOMER',
        occurredAt: pay.created_at.toISOString(),
        metadata: {
          paymentId: pay.id,
          amount: pay.amount,
          method: pay.payment_method,
        },
      });
    }
  }

  // Refunds
  const refunds = await sql<{
    id: string;
    amount: string;
    status: string;
    reason_text: string | null;
    created_at: Date;
  }>`
    select id, amount::text, status, reason_text, created_at
    from payments.refunds
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  for (const ref of refunds.rows) {
    events.push({
      id: `refund-${ref.id}`,
      category: 'PAYMENT',
      eventType: `REFUND_${ref.status}`,
      title: `Refund ${ref.status.toLowerCase()}: ৳${Number(ref.amount).toLocaleString()}`,
      description: ref.reason_text,
      actorType: 'ADMIN',
      occurredAt: ref.created_at.toISOString(),
      metadata: {
        refundId: ref.id,
        amount: ref.amount,
        status: ref.status,
      },
    });
  }

  // 8. Fulfillments
  const fulfillments = await sql<{
    id: string;
    fulfillment_number: string;
    status: string;
    dispatched_at: Date | null;
    created_at: Date;
  }>`
    select id, fulfillment_number, status, dispatched_at, created_at
    from fulfillment.fulfillments
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  for (const f of fulfillments.rows) {
    events.push({
      id: `fulfillment-created-${f.id}`,
      category: 'FULFILLMENT',
      eventType: 'FULFILLMENT_PREPARED',
      title: `Fulfillment package #${f.fulfillment_number} prepared`,
      description: `Status: ${f.status}`,
      actorType: 'ADMIN',
      occurredAt: f.created_at.toISOString(),
      metadata: {
        fulfillmentId: f.id,
        fulfillmentNumber: f.fulfillment_number,
        status: f.status,
      },
    });
    if (f.dispatched_at) {
      events.push({
        id: `fulfillment-dispatched-${f.id}`,
        category: 'FULFILLMENT',
        eventType: 'FULFILLMENT_DISPATCHED',
        title: `Fulfillment #${f.fulfillment_number} dispatched from warehouse`,
        description: 'Handed over for delivery processing.',
        actorType: 'ADMIN',
        occurredAt: f.dispatched_at.toISOString(),
        metadata: {
          fulfillmentId: f.id,
          fulfillmentNumber: f.fulfillment_number,
        },
      });
    }
  }

  // 9. Deliveries & Courier Bookings
  const deliveries = await sql<{
    id: string;
    delivery_number: string;
    operational_status: string;
    outcome_status: string | null;
    tracking_reference: string | null;
    handed_over_at: Date | null;
    delivered_at: Date | null;
    failed_at: Date | null;
    created_at: Date;
  }>`
    select id, delivery_number, operational_status, outcome_status, tracking_reference,
           handed_over_at, delivered_at, failed_at, created_at
    from delivery.deliveries
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  for (const d of deliveries.rows) {
    // Courier bookings for this delivery
    const bookings = await sql<{
      id: string;
      provider_code: string;
      tracking_number: string | null;
      status: string;
      created_at: Date;
    }>`
      select id, provider_code, tracking_number, status, created_at
      from delivery.courier_bookings
      where organization_id = ${input.organizationId} and delivery_id = ${d.id}
    `.execute(db);

    for (const b of bookings.rows) {
      events.push({
        id: `courier-booking-${b.id}`,
        category: 'DELIVERY',
        eventType: 'COURIER_BOOKED',
        title: `Consignment booked with ${b.provider_code}`,
        description: b.tracking_number ? `Tracking / Consignment ID: ${b.tracking_number}` : `Status: ${b.status}`,
        actorType: 'ADMIN',
        occurredAt: b.created_at.toISOString(),
        metadata: {
          deliveryNumber: d.delivery_number,
          providerCode: b.provider_code,
          trackingNumber: b.tracking_number,
        },
      });
    }

    if (d.delivered_at) {
      events.push({
        id: `delivery-completed-${d.id}`,
        category: 'DELIVERY',
        eventType: 'PARCEL_DELIVERED',
        title: `Delivery #${d.delivery_number} successfully delivered`,
        description: d.tracking_reference ? `Tracking: ${d.tracking_reference}` : 'Handed to customer.',
        actorType: 'COURIER',
        occurredAt: d.delivered_at.toISOString(),
        metadata: {
          deliveryNumber: d.delivery_number,
          trackingReference: d.tracking_reference,
        },
      });
    } else if (d.failed_at) {
      events.push({
        id: `delivery-failed-${d.id}`,
        category: 'DELIVERY',
        eventType: 'DELIVERY_FAILED',
        title: `Delivery attempt failed (#${d.delivery_number})`,
        description: `Outcome: ${d.outcome_status ?? 'FAILED'}`,
        actorType: 'COURIER',
        occurredAt: d.failed_at.toISOString(),
        metadata: {
          deliveryNumber: d.delivery_number,
          outcomeStatus: d.outcome_status,
        },
      });
    }
  }

  // 10. Return Cases (RTO & Customer Returns)
  const returnCases = await sql<{
    id: string;
    return_number: string;
    case_type: string;
    case_status: string;
    created_at: Date;
  }>`
    select id, return_number, case_type, case_status, created_at
    from returns.return_cases
    where organization_id = ${input.organizationId} and order_id = ${input.orderId}
  `.execute(db);

  for (const rc of returnCases.rows) {
    const isRto = rc.case_type === 'RTO';
    events.push({
      id: `return-case-${rc.id}`,
      category: 'RETURN',
      eventType: isRto ? 'RTO_REVERSE_LOGISTICS_OPENED' : 'CUSTOMER_RETURN_REQUESTED',
      title: isRto
        ? `RTO initiated: Parcel returning to merchant (#${rc.return_number})`
        : `Customer return opened (#${rc.return_number})`,
      description: `Case status: ${rc.case_status}`,
      actorType: isRto ? 'COURIER' : 'CUSTOMER',
      occurredAt: rc.created_at.toISOString(),
      metadata: {
        returnNumber: rc.return_number,
        caseType: rc.case_type,
        caseStatus: rc.case_status,
      },
    });
  }

  // 11. Notes
  const notes = await sql<{
    id: string;
    note_type: string;
    body: string;
    actor_id: string;
    author_name: string | null;
    created_at: Date;
  }>`
    select n.id, n.note_type, n.body, n.author_actor_id as actor_id,
           coalesce(profile.display_name, u.email) as author_name, n.created_at
    from orders.order_notes n
    left join iam.users u on u.id = n.author_actor_id
    left join iam.user_profiles profile on profile.user_id = u.id
    where n.organization_id = ${input.organizationId} and n.order_id = ${input.orderId}
  `.execute(db);

  for (const note of notes.rows) {
    events.push({
      id: `note-${note.id}`,
      category: 'NOTE',
      eventType: 'ORDER_NOTE_ADDED',
      title: note.note_type === 'CUSTOMER_VISIBLE' ? 'Customer note added' : 'Internal operator note',
      description: note.body,
      actorType: 'ADMIN',
      actorName: note.author_name,
      occurredAt: note.created_at.toISOString(),
      metadata: {
        noteType: note.note_type,
      },
    });
  }

  // Sort chronologically ascending
  events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  return events.map((e) => ({
    ...e,
    aggregateType: e.aggregateType ?? 'orders.order',
    aggregateId: e.aggregateId ?? input.orderId,
    payload: e.payload ?? e.metadata,
  }));
}
