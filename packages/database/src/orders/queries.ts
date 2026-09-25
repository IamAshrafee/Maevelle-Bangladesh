import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { getOrderPaymentSummary, type PaymentMethodCode } from '../payments.js';
import { normalizeCustomerPhone } from '../customer-identities.js';
import { checkoutRow } from './checkout.js';
import {
  OrderDomainError,
  type AdminOrderDetailView,
  type OrderDeliveryStatus,
  type OrderFulfillmentStatus,
  type OrderListFilters,
  type OrderListItem,
  type OrderPaymentStatus,
  type OrderView,
  type PaginationMeta,
  type PublicOrderTrackingView,
} from './types.js';

export async function orderView(db: Kysely<DatabaseSchema>, orderId: string): Promise<OrderView> {
  const order = await sql<{
    id: string;
    organization_id: string;
    order_number: string;
    order_status: OrderView['status'];
    source: OrderView['source'];
    sales_channel: OrderView['salesChannel'];
    currency_code: string;
    payment_method: PaymentMethodCode;
    subtotal_amount: string;
    discount_amount: string;
    merchandise_net: string;
    total_amount: string;
    delivery_amount: string;
    tax_amount: string;
    version: string;
    created_at: Date;
    display_name: string;
    customer_id: string | null;
    phone: string;
    email: string | null;
    recipient_name: string;
    delivery_phone: string;
    address_line_1: string;
    address_line_2: string | null;
    geography_node_id: string | null;
    area: string | null;
    city: string | null;
    district: string | null;
    postal_code: string | null;
    country_code: string;
  }>`
    select order_row.id, order_row.organization_id, order_row.order_number, order_row.order_status,
      order_row.source, order_row.sales_channel, order_row.currency_code, order_row.payment_method, order_row.version::text,
      order_row.subtotal_amount::text, order_row.discount_amount::text, order_row.delivery_amount::text,
      (order_row.subtotal_amount - order_row.discount_amount)::text as merchandise_net,
      order_row.tax_amount::text, order_row.total_amount::text, order_row.created_at,
      customer.customer_id::text as customer_id, customer.display_name, customer.phone, customer.email, address.recipient_name, address.phone as delivery_phone, address.address_line_1, address.address_line_2,
      address.geography_node_id, address.area, address.city, address.district, address.postal_code, address.country_code
    from orders.orders order_row
    join orders.order_customer_snapshots customer on customer.order_id = order_row.id
    join orders.order_addresses address on address.order_id = order_row.id and address.address_type = 'DELIVERY'
    where order_row.id = ${orderId}
  `.execute(db);
  const row = order.rows[0];
  if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
  const lines = await sql<{
    id: string;
    variant_id: string | null;
    sku_snapshot: string;
    product_title_snapshot: string;
    variant_title_snapshot: string | null;
    image_url_snapshot: string | null;
    quantity: string;
    unit_price: string;
    gross_amount: string;
    discount_amount: string;
    net_amount: string;
    line_status: 'ACTIVE' | 'CANCELLED';
    cancellation_reason_code: string | null;
    cancellation_reason_text: string | null;
    cancelled_at: Date | null;
    option_snapshot: readonly { name: string; value: string }[];
  }>`
    select id, variant_id, sku_snapshot, product_title_snapshot, variant_title_snapshot, image_url_snapshot,
      quantity::text, unit_price::text, gross_amount::text, discount_amount::text, net_amount::text,
      line_status, cancellation_reason_code, cancellation_reason_text, cancelled_at, option_snapshot
    from orders.order_lines where order_id = ${orderId} order by id
  `.execute(db);
  const payment = await getOrderPaymentSummary(db, {
    organizationId: row.organization_id,
    orderId,
    paymentMethod: row.payment_method,
    expectedAmount: row.total_amount,
  });
  return {
    id: row.id,
    version: Number(row.version),
    orderNumber: row.order_number,
    status: row.order_status,
    source: row.source,
    salesChannel: row.sales_channel,
    currency: row.currency_code,
    total: row.total_amount,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    customerName: row.display_name,
    customerPhone: row.phone,
    customerEmail: row.email,
    customerId: row.customer_id ?? null,
    paymentMethod: row.payment_method,
    paymentStatus: payment.status,
    payment,
    merchandiseGross: row.subtotal_amount,
    discountTotal: row.discount_amount,
    merchandiseNet: row.merchandise_net,
    deliveryAmount: row.delivery_amount,
    taxAmount: row.tax_amount,
    customer: { displayName: row.display_name, phone: row.phone, email: row.email },
    address: {
      recipientName: row.recipient_name,
      phone: row.delivery_phone,
      addressLine1: row.address_line_1,
      ...(row.address_line_2 ? { addressLine2: row.address_line_2 } : {}),
      ...(row.geography_node_id ? { geographyNodeId: row.geography_node_id } : {}),
      ...(row.area ? { area: row.area } : {}),
      ...(row.city ? { city: row.city } : {}),
      ...(row.district ? { district: row.district } : {}),
      ...(row.postal_code ? { postalCode: row.postal_code } : {}),
      countryCode: row.country_code,
    },
    lines: lines.rows.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      variantTitle: line.variant_title_snapshot,
      imageUrl: line.image_url_snapshot ?? null,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      gross: line.gross_amount,
      discount: line.discount_amount,
      net: line.net_amount,
      status: line.line_status,
      cancellationReasonCode: line.cancellation_reason_code,
      cancellationReasonText: line.cancellation_reason_text,
      cancelledAt: line.cancelled_at?.toISOString() ?? null,
      options: line.option_snapshot,
    })),
  };
}

export async function getOrderForCheckout(
  db: Kysely<DatabaseSchema>,
  checkoutToken: string,
): Promise<OrderView> {
  const checkout = await checkoutRow(db, checkoutToken);
  if (!checkout.resulting_order_id || checkout.status !== 'ORDER_PLACED')
    throw new OrderDomainError('NOT_FOUND', 'Order confirmation was not found.');
  return orderView(db, checkout.resulting_order_id);
}

export async function getOrderForCheckoutContext(
  db: Kysely<DatabaseSchema>,
  checkoutToken: string,
): Promise<{ order: OrderView; organizationId: string }> {
  const checkout = await checkoutRow(db, checkoutToken);
  if (!checkout.resulting_order_id || checkout.status !== 'ORDER_PLACED')
    throw new OrderDomainError('NOT_FOUND', 'Order confirmation was not found.');
  return {
    order: await orderView(db, checkout.resulting_order_id),
    organizationId: checkout.organization_id,
  };
}

export async function getOrderForAdmin(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string },
): Promise<AdminOrderDetailView> {
  const exists = await sql<{
    id: string;
    delivery_amount: string;
  }>`select id, delivery_amount::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId}`.execute(
    db,
  );
  if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  const baseOrderPromise = orderView(db, input.orderId);

  const [
    baseOrder,
    notesQuery,
    timelineQuery,
    fulfillmentsQuery,
    deliveriesQuery,
    returnsQuery,
    refundsQuery,
    discountsQuery,
    cancellationQuery,
    cancellationRefundsQuery,
  ] = await Promise.all([
    baseOrderPromise,
    sql<{ id: string; author_actor_id: string; note_type: string; body: string; created_at: Date }>`
      select id, author_actor_id, note_type, body, created_at
      from orders.order_notes
      where order_id = ${input.orderId}
      order by created_at desc limit 20
    `.execute(db),
    sql<{
      id: string;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
      occurred_at: Date;
      payload: Record<string, unknown>;
    }>`
      select id, event_type, aggregate_type, aggregate_id, occurred_at, payload
      from platform.outbox_events
      where aggregate_type in ('orders.order', 'fulfillment.fulfillment', 'delivery.delivery', 'returns.return_case')
        and (payload->>'orderId' = ${input.orderId} or aggregate_id = ${input.orderId})
      order by occurred_at desc limit 30
    `.execute(db),
    sql<{
      id: string;
      fulfillment_number: string;
      status: string;
      location_id: string;
      dispatched_at: Date | null;
      allocated_quantity: string;
    }>`
      select record.id, record.fulfillment_number, record.status, record.location_id,
        record.dispatched_at, coalesce(sum(line.quantity), 0)::text as allocated_quantity
      from fulfillment.fulfillments record
      left join fulfillment.fulfillment_lines line
        on line.organization_id = record.organization_id and line.fulfillment_id = record.id
      where record.organization_id = ${input.organizationId} and record.order_id = ${input.orderId}
      group by record.id
      order by record.created_at desc
    `.execute(db),
    sql<{
      id: string;
      delivery_number: string;
      operational_status: string;
      outcome_status: string | null;
      tracking_reference: string | null;
      handed_over_at: Date | null;
      delivered_at: Date | null;
    }>`
      select id, delivery_number, operational_status, outcome_status, tracking_reference, handed_over_at, delivered_at
      from delivery.deliveries
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{
      id: string;
      return_number: string;
      case_status: string;
      case_type: string;
      created_at: Date;
    }>`
      select id, return_number, case_status, case_type, created_at
      from returns.return_cases
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{
      id: string;
      amount: string;
      status: string;
      created_at: Date;
    }>`
      select id, amount::text, status, created_at
      from payments.refunds
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{
      promotion_name_snapshot: string;
      coupon_code_snapshot: string | null;
      benefit_type_snapshot: string;
      benefit_value_snapshot: string;
      discount_amount: string;
    }>`
      select promotion_name_snapshot, coupon_code_snapshot, benefit_type_snapshot,
        benefit_value_snapshot::text, discount_amount::text
      from orders.order_discount_applications
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
      order by id
    `.execute(db),
    sql<{
      reason_code: string;
      reason_text: string | null;
      created_at: Date;
    }>`
      select reason_code, reason_text, created_at
      from orders.order_cancellations
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
    `.execute(db),
    sql<{
      id: string;
      amount: string;
      status: string;
    }>`
      select refund.id, refund.amount::text, refund.status
      from orders.order_cancellation_refunds bridge
      join payments.refunds refund
        on refund.organization_id = bridge.organization_id and refund.id = bridge.refund_id
      where bridge.organization_id = ${input.organizationId}
        and bridge.order_id = ${input.orderId}
      order by refund.id
    `.execute(db),
  ]);

  const orderedQuantity = baseOrder.lines
    .filter((l) => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + Number(l.quantity), 0);
  const allocatedQuantity = fulfillmentsQuery.rows
    .filter((f) => f.status !== 'CANCELLED')
    .reduce((sum, f) => sum + Number(f.allocated_quantity), 0);
  const openFulfillmentCount = fulfillmentsQuery.rows.filter(
    (f) => !['DISPATCHED', 'CANCELLED'].includes(f.status),
  ).length;

  let fulfillmentStatus: OrderFulfillmentStatus = 'UNFULFILLED';
  if (baseOrder.status === 'CANCELLED') fulfillmentStatus = 'CANCELLED';
  else if (allocatedQuantity === 0) fulfillmentStatus = 'UNFULFILLED';
  else if (allocatedQuantity < orderedQuantity) fulfillmentStatus = 'PARTIALLY_FULFILLED';
  else if (openFulfillmentCount > 0) fulfillmentStatus = 'IN_PROGRESS';
  else fulfillmentStatus = 'FULFILLED';

  const deliveries = deliveriesQuery.rows;
  let deliveryStatus: OrderDeliveryStatus = 'NOT_STARTED';
  if (baseOrder.status === 'CANCELLED') deliveryStatus = 'CANCELLED';
  else if (deliveries.length === 0) deliveryStatus = 'NOT_STARTED';
  else if (deliveries.some((d) => ['FAILED', 'LOST', 'DAMAGED'].includes(d.outcome_status ?? '')))
    deliveryStatus = 'FAILED';
  else if (deliveries.every((d) => d.outcome_status === 'DELIVERED')) deliveryStatus = 'DELIVERED';
  else if (deliveries.some((d) => d.outcome_status === 'DELIVERED'))
    deliveryStatus = 'PARTIALLY_DELIVERED';
  else if (deliveries.some((d) => ['BOOKED', 'HANDED_OVER', 'IN_TRANSIT'].includes(d.operational_status)))
    deliveryStatus = 'IN_TRANSIT';
  else if (deliveries.every((d) => d.outcome_status === 'CANCELLED_BEFORE_HANDOVER'))
    deliveryStatus = 'CANCELLED';
  else deliveryStatus = 'PENDING';

  return {
    ...baseOrder,
    fulfillmentStatus,
    deliveryStatus,
    deliveryAmount: exists.rows[0]!.delivery_amount,
    notes: notesQuery.rows.map((n) => ({
      id: n.id,
      authorActorId: n.author_actor_id,
      noteType: n.note_type,
      body: n.body,
      createdAt: n.created_at.toISOString(),
    })),
    timeline: timelineQuery.rows.map((t) => ({
      id: t.id,
      eventType: t.event_type,
      aggregateType: t.aggregate_type,
      aggregateId: t.aggregate_id,
      occurredAt: t.occurred_at.toISOString(),
      payload: t.payload,
    })),
    fulfillments: fulfillmentsQuery.rows.map((f) => ({
      id: f.id,
      fulfillmentNumber: f.fulfillment_number,
      status: f.status,
      locationId: f.location_id,
      dispatchedAt: f.dispatched_at ? f.dispatched_at.toISOString() : null,
    })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      deliveryNumber: d.delivery_number,
      status: d.operational_status,
      outcomeStatus: d.outcome_status,
      trackingNumber: d.tracking_reference,
      dispatchedAt: d.handed_over_at ? d.handed_over_at.toISOString() : null,
      deliveredAt: d.delivered_at ? d.delivered_at.toISOString() : null,
    })),
    returnCases: returnsQuery.rows.map((r) => ({
      id: r.id,
      caseNumber: r.return_number,
      status: r.case_status,
      returnType: r.case_type,
      createdAt: r.created_at.toISOString(),
    })),
    refunds: refundsQuery.rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    })),
    discountApplications: discountsQuery.rows.map((d) => ({
      promotionName: d.promotion_name_snapshot,
      couponCode: d.coupon_code_snapshot,
      benefitType: d.benefit_type_snapshot,
      benefitValue: d.benefit_value_snapshot,
      discountAmount: d.discount_amount,
    })),
    cancellation: cancellationQuery.rows[0]
      ? {
          reasonCode: cancellationQuery.rows[0].reason_code,
          reasonText: cancellationQuery.rows[0].reason_text,
          createdAt: cancellationQuery.rows[0].created_at.toISOString(),
          refundSettlement:
            cancellationRefundsQuery.rows.length === 0
              ? 'NOT_REQUIRED'
              : cancellationRefundsQuery.rows.every((r) => r.status === 'COMPLETED')
                ? 'REFUNDED'
                : cancellationRefundsQuery.rows.some((r) => r.status === 'COMPLETED')
                  ? 'PARTIALLY_REFUNDED'
                  : 'REFUND_PENDING',
          refundObligations: cancellationRefundsQuery.rows.map((r) => ({
            id: r.id,
            amount: r.amount,
            status: r.status,
          })),
        }
      : null,
  };
}

export async function listOrders(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters?: OrderListFilters,
): Promise<{ data: readonly OrderListItem[]; pagination: PaginationMeta }> {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  let customerIds: string[] | null = null;
  if (filters?.customerId) {
    const aliasResult = await sql<{ customer_id: string }>`
      select ${filters.customerId}::uuid as customer_id
      union all
      select alias_customer_id as customer_id
      from customers.customer_aliases
      where organization_id = ${organizationId}
        and (canonical_customer_id = ${filters.customerId}
          or alias_customer_id = ${filters.customerId})
    `.execute(db);
    customerIds = aliasResult.rows.map((r) => r.customer_id);
  }

  const searchTerm = filters?.q?.trim() ?? null;
  let normalizedSearchPhone: string | null = null;
  if (searchTerm) {
    try {
      normalizedSearchPhone = normalizeCustomerPhone(searchTerm);
    } catch {
      normalizedSearchPhone = null;
    }
  }

  const result = await sql<{
    id: string;
    order_number: string;
    source: string;
    sales_channel: OrderView['salesChannel'];
    order_status: string;
    payment_method: PaymentMethodCode;
    total_amount: string;
    delivery_amount: string;
    currency_code: string;
    display_name: string;
    customer_id: string | null;
    phone: string;
    normalized_phone: string;
    email: string | null;
    created_at: Date;
    payment_status: OrderPaymentStatus;
    fulfillment_status: OrderFulfillmentStatus;
    delivery_status: OrderDeliveryStatus;
    total_count: string;
  }>`
    with projected as (
      select
        o.id, o.order_number, o.source, o.sales_channel, o.order_status, o.payment_method,
        o.total_amount::text, o.delivery_amount::text, o.currency_code,
        snap.display_name, snap.customer_id, snap.phone, snap.normalized_phone, snap.email,
        o.created_at,
        case
          when pay.refunded > 0 and pay.collected - pay.refunded <= 0 then 'REFUNDED'
          when pay.refunded > 0 then 'PARTIALLY_REFUNDED'
          when pay.collected >= o.total_amount and o.total_amount > 0 then 'PAID'
          when pay.collected > 0 then 'PARTIALLY_PAID'
          when pay.pending_attempt_count > 0 then 'PAYMENT_PENDING'
          when pay.intent_status = 'EXPIRED' then 'EXPIRED'
          when pay.intent_status = 'CANCELLED' then 'CANCELLED'
          else 'UNPAID'
        end as payment_status,
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when fulfillment.allocated_quantity = 0 then 'UNFULFILLED'
          when fulfillment.allocated_quantity < lines.ordered_quantity then 'PARTIALLY_FULFILLED'
          when fulfillment.open_count > 0 then 'IN_PROGRESS'
          else 'FULFILLED'
        end as fulfillment_status,
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when shipment.delivery_count = 0 then 'NOT_STARTED'
          when shipment.failed_count > 0 then 'FAILED'
          when shipment.delivered_count = shipment.delivery_count then 'DELIVERED'
          when shipment.delivered_count > 0 then 'PARTIALLY_DELIVERED'
          when shipment.in_transit_count > 0 then 'IN_TRANSIT'
          when shipment.cancelled_count = shipment.delivery_count then 'CANCELLED'
          else 'PENDING'
        end as delivery_status
      from orders.orders o
      join orders.order_customer_snapshots snap
        on snap.organization_id = o.organization_id and snap.order_id = o.id
      left join lateral (
        select
          (select intent.status from payments.payment_intents intent
            where intent.organization_id = o.organization_id and intent.order_id = o.id
            order by intent.created_at desc, intent.id desc limit 1) as intent_status,
          coalesce((select sum(allocation.amount)
            from payments.payment_allocations allocation
            join payments.payments payment
              on payment.organization_id = allocation.organization_id
              and payment.id = allocation.payment_id
            where allocation.organization_id = o.organization_id
              and allocation.order_id = o.id and payment.status = 'CONFIRMED'), 0) as collected,
          coalesce((select sum(refund.amount)
            from payments.refunds refund
            where refund.organization_id = o.organization_id
              and refund.order_id = o.id and refund.status = 'COMPLETED'), 0) as refunded,
          (select count(*) from payments.payment_attempts attempt
            join payments.payment_intents intent
              on intent.organization_id = attempt.organization_id
              and intent.id = attempt.payment_intent_id
            where intent.organization_id = o.organization_id and intent.order_id = o.id
              and attempt.status = 'PENDING_VERIFICATION') as pending_attempt_count
      ) pay on true
      left join lateral (
        select coalesce(sum(line.quantity), 0) as ordered_quantity
        from orders.order_lines line
        where line.organization_id = o.organization_id and line.order_id = o.id
          and line.line_status = 'ACTIVE'
      ) lines on true
      left join lateral (
        select
          coalesce(sum(line.quantity) filter (where record.status <> 'CANCELLED'), 0) as allocated_quantity,
          count(*) filter (where record.status not in ('DISPATCHED', 'CANCELLED')) as open_count
        from fulfillment.fulfillments record
        join fulfillment.fulfillment_lines line
          on line.organization_id = record.organization_id and line.fulfillment_id = record.id
        where record.organization_id = o.organization_id and record.order_id = o.id
      ) fulfillment on true
      left join lateral (
        select count(*) as delivery_count,
          count(*) filter (where delivery.outcome_status = 'DELIVERED') as delivered_count,
          count(*) filter (where delivery.outcome_status in ('FAILED', 'LOST', 'DAMAGED')) as failed_count,
          count(*) filter (where delivery.outcome_status = 'CANCELLED_BEFORE_HANDOVER') as cancelled_count,
          count(*) filter (where delivery.operational_status in ('BOOKED', 'HANDED_OVER', 'IN_TRANSIT')) as in_transit_count
        from delivery.deliveries delivery
        where delivery.organization_id = o.organization_id and delivery.order_id = o.id
      ) shipment on true
      where o.organization_id = ${organizationId}
    )
    select projected.*,
      count(*) over ()::text as total_count
    from projected
    where (${filters?.status ?? null}::text is null or order_status = ${filters?.status ?? null})
      and (${filters?.paymentStatus ?? null}::text is null or payment_status = ${filters?.paymentStatus ?? null})
      and (${filters?.fulfillmentStatus ?? null}::text is null or fulfillment_status = ${filters?.fulfillmentStatus ?? null})
      and (${filters?.deliveryStatus ?? null}::text is null or delivery_status = ${filters?.deliveryStatus ?? null})
      and (${filters?.paymentMethod ?? null}::text is null or payment_method = ${filters?.paymentMethod ?? null})
      and (${filters?.salesChannel ?? null}::text is null or sales_channel = ${filters?.salesChannel ?? null})
      and (${filters?.source ?? null}::text is null or source = ${filters?.source ?? null})
      and (${filters?.from ?? null}::text is null or created_at >= (${filters?.from ?? null})::timestamptz)
      and (${filters?.to ?? null}::text is null or created_at <= (${filters?.to ?? null})::timestamptz)
      and (
        ${customerIds ?? null}::uuid[] is null
        or customer_id = any(${customerIds ?? null}::uuid[])
      )
      and (
        ${searchTerm ?? null}::text is null
        or order_number ilike ${searchTerm ? `${searchTerm}%` : ''}
        or lower(display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or lower(coalesce(email, '')) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or normalized_phone = ${normalizedSearchPhone ?? ''}
      )
    order by created_at desc, id desc
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const totalItems = Number(result.rows[0]?.total_count ?? 0);

  const data: OrderListItem[] = result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    salesChannel: row.sales_channel,
    status: row.order_status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    deliveryStatus: row.delivery_status,
    total: row.total_amount,
    deliveryAmount: row.delivery_amount,
    currency: row.currency_code,
    customerName: row.display_name,
    customerId: row.customer_id ?? null,
    customerPhone: row.phone,
    customerEmail: row.email,
    createdAt: row.created_at.toISOString(),
  }));

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize),
    },
  };
}

export async function getOrderPublicTracking(
  db: Kysely<DatabaseSchema>,
  input: { orderNumber: string; phone: string },
): Promise<PublicOrderTrackingView> {
  const normalizedPhone = normalizeCustomerPhone(input.phone);
  const orderResult = await sql<{
    id: string;
    organization_id: string;
    order_number: string;
    order_status: OrderView['status'];
    payment_method: PaymentMethodCode;
    currency_code: string;
    subtotal_amount: string;
    discount_amount: string;
    delivery_amount: string;
    total_amount: string;
    created_at: Date;
    recipient_name: string;
    area: string | null;
    city: string | null;
    district: string | null;
    country_code: string;
  }>`
    select o.id, o.organization_id, o.order_number, o.order_status, o.payment_method,
      o.currency_code, o.subtotal_amount::text, o.discount_amount::text, o.delivery_amount::text,
      o.total_amount::text, o.created_at,
      addr.recipient_name, addr.area, addr.city, addr.district, addr.country_code
    from orders.orders o
    join orders.order_customer_snapshots snap
      on snap.organization_id = o.organization_id and snap.order_id = o.id
    join orders.order_addresses addr
      on addr.organization_id = o.organization_id and addr.order_id = o.id and addr.address_type = 'DELIVERY'
    where o.order_number = ${input.orderNumber.trim()}
      and (snap.normalized_phone = ${normalizedPhone} or addr.phone = ${input.phone.trim()} or snap.phone = ${input.phone.trim()})
  `.execute(db);
  const row = orderResult.rows[0];
  if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found with the provided details.');

  const [lines, payment, fulfillmentAndDelivery] = await Promise.all([
    sql<{
      sku_snapshot: string;
      product_title_snapshot: string;
      variant_title_snapshot: string | null;
      image_url_snapshot: string | null;
      quantity: string;
      unit_price: string;
      net_amount: string;
      option_snapshot: readonly { name: string; value: string }[];
    }>`
      select sku_snapshot, product_title_snapshot, variant_title_snapshot, image_url_snapshot,
        quantity::text, unit_price::text, net_amount::text, option_snapshot
      from orders.order_lines
      where order_id = ${row.id} and line_status = 'ACTIVE'
      order by id
    `.execute(db),
    getOrderPaymentSummary(db, {
      organizationId: row.organization_id,
      orderId: row.id,
      paymentMethod: row.payment_method,
      expectedAmount: row.total_amount,
    }),
    sql<{
      fulfillment_status: OrderFulfillmentStatus;
      delivery_status: OrderDeliveryStatus;
      carrier_name: string | null;
      tracking_reference: string | null;
      estimated_delivery_at: Date | null;
      delivered_at: Date | null;
    }>`
      select
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when fulfillment.allocated_quantity = 0 then 'UNFULFILLED'
          when fulfillment.allocated_quantity < lines.ordered_quantity then 'PARTIALLY_FULFILLED'
          when fulfillment.open_count > 0 then 'IN_PROGRESS'
          else 'FULFILLED'
        end as fulfillment_status,
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when shipment.delivery_count = 0 then 'NOT_STARTED'
          when shipment.failed_count > 0 then 'FAILED'
          when shipment.delivered_count = shipment.delivery_count then 'DELIVERED'
          when shipment.delivered_count > 0 then 'PARTIALLY_DELIVERED'
          when shipment.in_transit_count > 0 then 'IN_TRANSIT'
          when shipment.cancelled_count = shipment.delivery_count then 'CANCELLED'
          else 'PENDING'
        end as delivery_status,
        shipment.manual_carrier_name as carrier_name,
        shipment.tracking_reference,
        shipment.estimated_delivery_at,
        shipment.delivered_at
      from orders.orders o
      left join lateral (
        select coalesce(sum(line.quantity), 0) as ordered_quantity
        from orders.order_lines line
        where line.organization_id = o.organization_id and line.order_id = o.id
          and line.line_status = 'ACTIVE'
      ) lines on true
      left join lateral (
        select
          coalesce(sum(line.quantity) filter (where record.status <> 'CANCELLED'), 0) as allocated_quantity,
          count(*) filter (where record.status not in ('DISPATCHED', 'CANCELLED')) as open_count
        from fulfillment.fulfillments record
        join fulfillment.fulfillment_lines line
          on line.organization_id = record.organization_id and line.fulfillment_id = record.id
        where record.organization_id = o.organization_id and record.order_id = o.id
      ) fulfillment on true
      left join lateral (
        select count(*) as delivery_count,
          count(*) filter (where delivery.outcome_status = 'DELIVERED') as delivered_count,
          count(*) filter (where delivery.outcome_status in ('FAILED', 'LOST', 'DAMAGED')) as failed_count,
          count(*) filter (where delivery.outcome_status = 'CANCELLED_BEFORE_HANDOVER') as cancelled_count,
          count(*) filter (where delivery.operational_status in ('BOOKED', 'HANDED_OVER', 'IN_TRANSIT')) as in_transit_count,
          max(delivery.manual_carrier_name) as manual_carrier_name,
          max(delivery.tracking_reference) as tracking_reference,
          max(delivery.estimated_delivery_at) as estimated_delivery_at,
          max(delivery.delivered_at) as delivered_at
        from delivery.deliveries delivery
        where delivery.organization_id = o.organization_id and delivery.order_id = o.id
      ) shipment on true
      where o.id = ${row.id}
    `.execute(db),
  ]);

  const fAndD = fulfillmentAndDelivery.rows[0];

  return {
    orderNumber: row.order_number,
    status: row.order_status,
    paymentStatus: payment.status,
    paymentMethod: row.payment_method,
    fulfillmentStatus: fAndD?.fulfillment_status ?? 'UNFULFILLED',
    deliveryStatus: fAndD?.delivery_status ?? 'NOT_STARTED',
    delivery: fAndD?.tracking_reference || fAndD?.carrier_name || fAndD?.delivered_at
      ? {
          carrierName: fAndD.carrier_name,
          trackingReference: fAndD.tracking_reference,
          estimatedDeliveryAt: fAndD.estimated_delivery_at?.toISOString() ?? null,
          deliveredAt: fAndD.delivered_at?.toISOString() ?? null,
        }
      : null,
    destination: {
      city: row.city,
      area: row.area,
      district: row.district,
      countryCode: row.country_code,
    },
    lines: lines.rows.map((l) => ({
      productTitle: l.product_title_snapshot,
      variantTitle: l.variant_title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      imageUrl: l.image_url_snapshot,
      unitPrice: l.unit_price,
      net: l.net_amount,
      options: l.option_snapshot,
    })),
    merchandiseGross: row.subtotal_amount,
    discountTotal: row.discount_amount,
    deliveryAmount: row.delivery_amount,
    total: row.total_amount,
    currency: row.currency_code,
    createdAt: row.created_at.toISOString(),
  };
}
