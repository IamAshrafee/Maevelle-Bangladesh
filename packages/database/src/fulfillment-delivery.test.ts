import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import { createDatabase } from './index.js';
import {
  adjustInventory,
  expireInventoryReservations,
  listInventoryReservations,
  releaseInventoryReservation,
} from './inventory.js';
import {
  cancelFulfillment,
  createFulfillment,
  dispatchFulfillment,
  getFulfillment,
  transitionFulfillment,
} from './fulfillment.js';
import type { FulfillmentDomainError } from './fulfillment.js';
import {
  completeCourierBookingOperation,
  createDelivery,
  dispatchDelivery,
  getDelivery,
  ingestCourierTrackingEvent,
  listPendingCourierBookingOperations,
  markDelivered,
  markDeliveryFailed,
  recordManualCourierBooking,
  requestCourierBooking,
} from './delivery.js';
import { getCustomerDeliveryHistory } from './delivery-intelligence.js';
import {
  cancelOrder,
  createCheckout,
  placeOrder,
  updateCheckoutAddress,
  updateCheckoutContact,
} from './orders.js';
import { createOrganization } from './platform.js';
import { createPriceDefinition } from './pricing.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 12,
});
afterAll(async () => database.close());

async function fixture(onHand = '10') {
  const organization = await createOrganization(database.db, {
    code: `fulfillment-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Fulfillment test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  const type = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${organization.id}, ${`fulfillment-${crypto.randomUUID().slice(0, 6)}`}, 'Fulfillment product')
    returning id
  `.execute(database.db);
  const product = await sql<{ id: string }>`
    insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at)
    values (${organization.id}, ${type.rows[0]!.id}, ${`fulfillment-${crypto.randomUUID().slice(0, 10)}`}, 'Fulfillment Product', 'ACTIVE', 'PUBLISHED', now())
    returning id
  `.execute(database.db);
  const skuId = crypto.randomUUID().slice(0, 10);
  const variant = await sql<{ id: string }>`
    insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature)
    values (${organization.id}, ${product.rows[0]!.id}, ${`FUL-${skuId.toUpperCase()}`}, ${`FUL-${skuId.toUpperCase()}`}, ${crypto.randomUUID()})
    returning id
  `.execute(database.db);
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `FUL-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Fulfillment warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  await adjustInventory(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    locationId: location.id,
    condition: 'SELLABLE',
    quantityDelta: onHand,
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    currency: 'BDT',
    amount: '1290.0000',
  });
  return {
    organizationId: organization.id,
    actorId,
    locationId: location.id,
    variantId: variant.rows[0]!.id,
  };
}

async function orderFor(input: Awaited<ReturnType<typeof fixture>>, quantity: string) {
  const cart = await createGuestCart(database.db, {
    organizationId: input.organizationId,
    currency: 'BDT',
  });
  await addGuestCartLine(database.db, {
    token: cart.token,
    variantId: input.variantId,
    quantity,
    expectedVersion: cart.cart.version,
    idempotencyKey: crypto.randomUUID(),
  });
  const checkout = await createCheckout(database.db, { cartToken: cart.token });
  const contact = await updateCheckoutContact(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: checkout.checkout.version,
    contact: { name: 'Fulfillment Buyer', phone: '01700000000' },
  });
  const addressed = await updateCheckoutAddress(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: contact.version,
    address: {
      recipientName: 'Fulfillment Buyer',
      phone: '01700000000',
      addressLine1: '1 Physical Truth Road',
      countryCode: 'BD',
    },
  });
  const placed = await placeOrder(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    acceptedCalculationVersion: addressed.calculationVersion,
    acceptedCalculationFingerprint: addressed.calculationFingerprint,
    idempotencyKey: crypto.randomUUID(),
  });
  if (placed.kind !== 'PLACED') throw new Error('Expected an Order to be placed.');
  const line = await sql<{
    id: string;
  }>`select id from orders.order_lines where order_id = ${placed.order.id}`.execute(database.db);
  return { order: placed.order, orderLineId: line.rows[0]!.id };
}

async function balances(input: Awaited<ReturnType<typeof fixture>>) {
  const result = await sql<{ sellable: string; reserved: string }>`
    select sum(level.sellable_quantity)::text as sellable, sum(level.reserved_quantity)::text as reserved
    from inventory.inventory_levels level
    join inventory.inventory_items item on item.id = level.inventory_item_id
    where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}
  `.execute(database.db);
  return result.rows[0]!;
}

async function preparedFulfillment(
  input: Awaited<ReturnType<typeof fixture>>,
  order: Awaited<ReturnType<typeof orderFor>>,
  quantity: string,
) {
  const created = await createFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    orderId: order.order.id,
    locationId: input.locationId,
    lines: [{ orderLineId: order.orderLineId, quantity }],
    idempotencyKey: crypto.randomUUID(),
  });
  const ready = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: created.id,
    expectedVersion: created.version,
    nextStatus: 'READY',
  });
  const picking = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: ready.id,
    expectedVersion: ready.version,
    nextStatus: 'PICKING',
  });
  return transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: picking.id,
    expectedVersion: picking.version,
    nextStatus: 'PACKED',
  });
}

describe('outbound fulfillment, physical consumption, and delivery operations', () => {
  it('claims one durable courier booking and consumes reserved stock only at physical handover', async () => {
    const input = await fixture('4');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    const integration = await sql<{ id: string }>`insert into integrations.integrations
      (organization_id,provider_code,integration_type,name,status)
      values (${input.organizationId},'TEST_COURIER','COURIER','Test courier','ACTIVE') returning id`.execute(
      database.db,
    );
    const account = await sql<{ id: string }>`insert into integrations.integration_accounts
      (organization_id,integration_id,name,status,non_secret_config)
      values (${input.organizationId},${integration.rows[0]!.id},'Primary account','ACTIVE','{"capabilities":{"cod":true}}'::jsonb)
      returning id`.execute(database.db);
    const delivery = await createDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await balances(input)).toEqual({ sellable: '4.000000', reserved: '1.000000' });

    const bookingRequested = await requestCourierBooking(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivery.id,
      expectedVersion: delivery.version,
      integrationAccountId: account.rows[0]!.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(bookingRequested.operationalStatus).toBe('BOOKING');
    const claimed = (await listPendingCourierBookingOperations(database.db)).find(
      (operation) => operation.organizationId === input.organizationId,
    );
    expect(claimed).toBeDefined();
    expect(
      (await listPendingCourierBookingOperations(database.db)).some(
        (operation) => operation.operationId === claimed!.operationId,
      ),
    ).toBe(false);
    await completeCourierBookingOperation(database.db, {
      organizationId: input.organizationId,
      operationId: claimed!.operationId,
      bookingId: claimed!.bookingId,
      result: {
        kind: 'BOOKED',
        providerBookingId: `provider-${crypto.randomUUID()}`,
        trackingReference: `track-${crypto.randomUUID()}`,
      },
    });
    const booked = await getDelivery(database.db, {
      organizationId: input.organizationId,
      deliveryId: delivery.id,
    });
    expect(booked.operationalStatus).toBe('BOOKED');

    const handedOver = await dispatchDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivery.id,
      expectedVersion: booked.version,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(handedOver.operationalStatus).toBe('IN_TRANSIT');
    expect(await balances(input)).toEqual({ sellable: '3.000000', reserved: '0.000000' });
    expect(
      (
        await sql<{ count: string }>`select count(*)::text as count
          from inventory.inventory_transactions
          where organization_id=${input.organizationId} and transaction_type='FULFILLMENT_DISPATCH'`.execute(
          database.db,
        )
      ).rows[0]!.count,
    ).toBe('1');

    const deliveredAt = new Date();
    const providerDelivered = await ingestCourierTrackingEvent(database.db, {
      organizationId: input.organizationId,
      integrationAccountId: account.rows[0]!.id,
      courierBookingId: claimed!.bookingId,
      providerEventId: `evt-${crypto.randomUUID()}`,
      providerStatus: 'delivered',
      normalizedStatus: 'DELIVERED',
      occurredAt: deliveredAt,
      authenticationStatus: 'VERIFIED',
      rawPayload: { status: 'delivered' },
    });
    expect(providerDelivered.delivery?.outcomeStatus).toBe('DELIVERED');
    const staleEventId = `evt-${crypto.randomUUID()}`;
    const stale = await ingestCourierTrackingEvent(database.db, {
      organizationId: input.organizationId,
      integrationAccountId: account.rows[0]!.id,
      courierBookingId: claimed!.bookingId,
      providerEventId: staleEventId,
      providerStatus: 'failed',
      normalizedStatus: 'FAILED',
      occurredAt: new Date(deliveredAt.getTime() - 60_000),
      authenticationStatus: 'VERIFIED',
      rawPayload: { status: 'failed', eventId: staleEventId },
    });
    expect(stale.delivery?.outcomeStatus).toBe('DELIVERED');
    expect(
      await ingestCourierTrackingEvent(database.db, {
        organizationId: input.organizationId,
        integrationAccountId: account.rows[0]!.id,
        courierBookingId: claimed!.bookingId,
        providerEventId: staleEventId,
        providerStatus: 'failed',
        normalizedStatus: 'FAILED',
        occurredAt: new Date(deliveredAt.getTime() - 60_000),
        authenticationStatus: 'VERIFIED',
        rawPayload: { status: 'failed', eventId: staleEventId },
      }),
    ).toEqual({ created: false });
  });

  it('uses the verified payment-ledger balance as the courier COD amount', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    const method = await sql<{ id: string }>`select id from payments.payment_methods
      where organization_id=${input.organizationId} and code='COD'`.execute(database.db);
    const intent = await sql<{ id: string }>`select id from payments.payment_intents
      where organization_id=${input.organizationId} and order_id=${order.order.id}
      order by created_at desc limit 1`.execute(database.db);
    const attempt = await sql<{ id: string }>`insert into payments.payment_attempts
      (organization_id,payment_intent_id,customer_reference,normalized_reference,claimed_amount,
        status,resolved_at,reviewed_by_actor_id)
      values (${input.organizationId},${intent.rows[0]!.id},${`partial-${crypto.randomUUID()}`},
        ${crypto.randomUUID()},290,'VERIFIED',now(),${input.actorId}) returning id`.execute(
      database.db,
    );
    const payment = await sql<{ id: string }>`insert into payments.payments
      (organization_id,payment_number,payment_method_id,currency_code,amount,external_reference,
        normalized_external_reference,status,source_attempt_id,confirmed_by_actor_id)
      values (${input.organizationId},${`PAY-${crypto.randomUUID()}`},${method.rows[0]!.id},'BDT',290,
        ${`partial-${crypto.randomUUID()}`},${crypto.randomUUID()},'CONFIRMED',${attempt.rows[0]!.id},${input.actorId})
      returning id`.execute(database.db);
    await sql`insert into payments.payment_allocations
      (organization_id,payment_id,order_id,order_number_snapshot,amount)
      values (${input.organizationId},${payment.rows[0]!.id},${order.order.id},${order.order.orderNumber},290)`.execute(
      database.db,
    );

    const delivery = await createDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const cod = await sql<{
      delivery_amount: string;
      instruction_amount: string;
    }>`select delivery.cod_expected_amount::text as delivery_amount,
        instruction.expected_amount::text as instruction_amount
      from delivery.deliveries delivery
      join delivery.cod_collection_instructions instruction on instruction.delivery_id=delivery.id
      where delivery.id=${delivery.id}`.execute(database.db);

    expect(delivery.cod).toMatchObject({ required: true, expectedAmount: '1000.0000' });
    expect(cod.rows[0]).toEqual({
      delivery_amount: '1000.0000',
      instruction_amount: '1000.0000',
    });
  });

  it('keeps order-owned reservations under the Order lifecycle authority', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const reservation = await sql<{ id: string }>`
      select reservation.id
      from inventory.inventory_reservations reservation
      join orders.order_inventory_reservations bridge on bridge.reservation_id = reservation.id
      where bridge.organization_id = ${input.organizationId} and bridge.order_id = ${order.order.id}
    `.execute(database.db);

    const workspace = await listInventoryReservations(database.db, input.organizationId, {
      search: order.order.orderNumber,
    });
    expect(workspace.items).toEqual([
      expect.objectContaining({
        id: reservation.rows[0]!.id,
        remainingQuantity: '1',
        releaseAllowed: false,
        owner: expect.objectContaining({
          type: 'ORDER',
          orderId: order.order.id,
          orderNumber: order.order.orderNumber,
        }),
      }),
    ]);

    await sql`update inventory.inventory_reservations set expires_at = now() - interval '1 minute' where id = ${reservation.rows[0]!.id}`.execute(
      database.db,
    );
    expect(await expireInventoryReservations(database.db)).toBe(0);

    await expect(
      releaseInventoryReservation(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        reservationId: reservation.rows[0]!.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '1.000000' });
  });

  it('cancels open fulfillment work before releasing an order reservation', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');

    const cancelled = await cancelOrder(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.order.id,
      expectedVersion: order.order.version,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(cancelled).toMatchObject({
      order: { status: 'CANCELLED' },
      releasedReservations: 1,
      cancelledFulfillments: 1,
    });
    expect(
      (
        await getFulfillment(database.db, {
          organizationId: input.organizationId,
          fulfillmentId: packed.id,
        })
      ).status,
    ).toBe('CANCELLED');
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '0.000000' });
  });

  it('refuses order cancellation after physical inventory has been dispatched', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    await dispatchFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      expectedVersion: packed.version,
      idempotencyKey: crypto.randomUUID(),
    });

    await expect(
      cancelOrder(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        orderId: order.order.id,
        expectedVersion: order.order.version,
        reasonCode: 'CUSTOMER_REQUEST',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(await balances(input)).toEqual({ sellable: '1.000000', reserved: '0.000000' });
  });

  it('consumes a reservation into exactly one immutable physical movement and supports an independent delivery outcome', async () => {
    const input = await fixture('10');
    const order = await orderFor(input, '2');
    expect(await balances(input)).toEqual({ sellable: '10.000000', reserved: '2.000000' });
    const packed = await preparedFulfillment(input, order, '2');
    const dispatched = await dispatchFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      expectedVersion: packed.version,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(dispatched.status).toBe('DISPATCHED');
    expect(await balances(input)).toEqual({ sellable: '8.000000', reserved: '0.000000' });
    const movement = await sql<{ count: string }>`
      select count(*)::text as count from inventory.inventory_transactions
      where organization_id = ${input.organizationId} and transaction_type = 'FULFILLMENT_DISPATCH'
    `.execute(database.db);
    expect(movement.rows[0]!.count).toBe('1');

    const delivery = await createDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: dispatched.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(delivery.recipient.address).toContain('Physical Truth Road');
    const booked = await recordManualCourierBooking(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivery.id,
      expectedVersion: delivery.version,
      carrierName: 'Manual carrier',
      trackingReference: `TRACK-${crypto.randomUUID().slice(0, 8)}`,
      idempotencyKey: crypto.randomUUID(),
    });
    const inTransit = await dispatchDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: booked.id,
      expectedVersion: booked.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const delivered = await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: inTransit.id,
      expectedVersion: inTransit.version,
      note: 'Handed to customer.',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(delivered).toMatchObject({ operationalStatus: 'DELIVERED', outcomeStatus: 'DELIVERED' });
    expect(delivered.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'CREATED',
        'MANUAL_BOOKED',
        'HANDED_OVER',
        'IN_TRANSIT',
        'DELIVERED',
      ]),
    );
    expect(
      await getCustomerDeliveryHistory(database.db, {
        organizationId: input.organizationId,
        deliveryId: delivered.id,
      }),
    ).toMatchObject({
      totalDeliveries: 1,
      eligibleDeliveries: 1,
      deliveredCount: 1,
      rtoCount: 0,
      successRate: 100,
      risk: { level: 'INSUFFICIENT_HISTORY' },
      externalProviderHistory: {
        pathao: { available: false, reason: 'NO_OFFICIAL_API_DOCUMENTED' },
      },
    });
    expect(await balances(input)).toEqual({ sellable: '8.000000', reserved: '0.000000' });
    const payment = await sql<{
      count: string;
    }>`select count(*)::text as count from payments.payments where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(payment.rows[0]!.count).toBe('0');
  });

  it('serializes partial fulfillment claims, permits a pre-dispatch cancellation, and denies another tenant', async () => {
    const input = await fixture('5');
    const order = await orderFor(input, '3');
    const first = await createFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.order.id,
      locationId: input.locationId,
      lines: [{ orderLineId: order.orderLineId, quantity: '2' }],
      idempotencyKey: crypto.randomUUID(),
    });
    const second = await createFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.order.id,
      locationId: input.locationId,
      lines: [{ orderLineId: order.orderLineId, quantity: '1' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      createFulfillment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        orderId: order.order.id,
        locationId: input.locationId,
        lines: [{ orderLineId: order.orderLineId, quantity: '1' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'OVER_FULFILLMENT' } satisfies Partial<FulfillmentDomainError>);
    const cancelled = await cancelFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: first.id,
      expectedVersion: first.version,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(await balances(input)).toEqual({ sellable: '5.000000', reserved: '3.000000' });
    const replacement = await createFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.order.id,
      locationId: input.locationId,
      lines: [{ orderLineId: order.orderLineId, quantity: '2' }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(replacement.lines[0]!.quantity).toBe('2.000000');
    const other = await fixture('1');
    await expect(
      getFulfillment(database.db, {
        organizationId: other.organizationId,
        fulfillmentId: second.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<FulfillmentDomainError>);
  });

  it('makes duplicate concurrent dispatch canonical and rolls back every physical side effect on a later failure', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    const key = crypto.randomUUID();
    const [first, retry] = await Promise.all([
      dispatchFulfillment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        fulfillmentId: packed.id,
        expectedVersion: packed.version,
        idempotencyKey: key,
      }),
      dispatchFulfillment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        fulfillmentId: packed.id,
        expectedVersion: packed.version,
        idempotencyKey: key,
      }),
    ]);
    expect(first.id).toBe(retry.id);
    expect(await balances(input)).toEqual({ sellable: '1.000000', reserved: '0.000000' });
    const movements = await sql<{
      count: string;
    }>`select count(*)::text as count from inventory.inventory_transactions where organization_id = ${input.organizationId} and transaction_type = 'FULFILLMENT_DISPATCH'`.execute(
      database.db,
    );
    expect(movements.rows[0]!.count).toBe('1');

    const secondOrder = await orderFor(input, '1');
    const secondPacked = await preparedFulfillment(input, secondOrder, '1');
    await expect(
      dispatchFulfillment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        fulfillmentId: secondPacked.id,
        expectedVersion: secondPacked.version,
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('Injected after physical movement.');
        },
      }),
    ).rejects.toThrow('Injected after physical movement.');
    expect(await balances(input)).toEqual({ sellable: '1.000000', reserved: '1.000000' });
    expect(
      await getFulfillment(database.db, {
        organizationId: input.organizationId,
        fulfillmentId: secondPacked.id,
      }),
    ).toMatchObject({ status: 'PACKED' });
  });

  it('records failed delivery without cancelling the order, restoring stock, or inventing a payment/refund', async () => {
    const input = await fixture('2');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    const dispatched = await dispatchFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      expectedVersion: packed.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const delivery = await createDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: dispatched.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const booked = await recordManualCourierBooking(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivery.id,
      expectedVersion: delivery.version,
      carrierName: 'Manual carrier',
      trackingReference: 'FAILED-TRACK',
      idempotencyKey: crypto.randomUUID(),
    });
    const transit = await dispatchDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: booked.id,
      expectedVersion: booked.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const failed = await markDeliveryFailed(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: transit.id,
      expectedVersion: transit.version,
      reasonCode: 'CUSTOMER_UNAVAILABLE',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(failed).toMatchObject({ operationalStatus: 'FAILED', outcomeStatus: 'FAILED' });
    expect(await balances(input)).toEqual({ sellable: '1.000000', reserved: '0.000000' });
    const state = await sql<{ status: string; refunds: string }>`
      select order_row.order_status as status,
        (select count(*)::text from payments.refunds where organization_id = ${input.organizationId}) as refunds
      from orders.orders order_row where order_row.id = ${order.order.id}
    `.execute(database.db);
    expect(state.rows[0]).toEqual({ status: 'PENDING', refunds: '0' });
  });

  it('allows only one concurrent fulfillment claim for the final reserved Order quantity', async () => {
    const input = await fixture('1');
    const order = await orderFor(input, '1');
    const claims = await Promise.allSettled(
      [crypto.randomUUID(), crypto.randomUUID()].map((idempotencyKey) =>
        createFulfillment(database.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          orderId: order.order.id,
          locationId: input.locationId,
          lines: [{ orderLineId: order.orderLineId, quantity: '1' }],
          idempotencyKey,
        }),
      ),
    );
    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
    const rejected = claims.find((claim) => claim.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected')
      expect(rejected.reason).toMatchObject({ code: 'OVER_FULFILLMENT' });
  });

  it('rolls back a Delivery outcome, event, audit, and outbox together when its transaction faults', async () => {
    const input = await fixture('1');
    const order = await orderFor(input, '1');
    const packed = await preparedFulfillment(input, order, '1');
    const fulfillment = await dispatchFulfillment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: packed.id,
      expectedVersion: packed.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const created = await createDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      fulfillmentId: fulfillment.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const booked = await recordManualCourierBooking(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: created.id,
      expectedVersion: created.version,
      carrierName: 'Manual carrier',
      trackingReference: 'ATOMIC-TRACK',
      idempotencyKey: crypto.randomUUID(),
    });
    const transit = await dispatchDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: booked.id,
      expectedVersion: booked.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      markDelivered(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: transit.id,
        expectedVersion: transit.version,
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('Injected delivery outcome fault.');
        },
      }),
    ).rejects.toThrow('Injected delivery outcome fault.');
    const state = await sql<{
      operational_status: string;
      outcome_status: string;
      delivered: string;
    }>`
      select operational_status, outcome_status,
        (select count(*)::text from delivery.delivery_events where delivery_id = ${transit.id} and event_type = 'DELIVERED') as delivered
      from delivery.deliveries where id = ${transit.id}
    `.execute(database.db);
    expect(state.rows[0]).toEqual({
      operational_status: 'IN_TRANSIT',
      outcome_status: 'PENDING',
      delivered: '0',
    });
  });
});
