import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import { createDatabase } from './index.js';
import { adjustInventory } from './inventory.js';
import {
  cancelFulfillment,
  createFulfillment,
  dispatchFulfillment,
  getFulfillment,
  transitionFulfillment,
} from './fulfillment.js';
import type { FulfillmentDomainError } from './fulfillment.js';
import {
  createDelivery,
  dispatchDelivery,
  markDelivered,
  markDeliveryFailed,
  recordManualCourierBooking,
} from './delivery.js';
import {
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
