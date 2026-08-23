import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, applyGuestCartCoupon, createGuestCart } from './cart.js';
import { createDatabase } from './index.js';
import { adjustInventory } from './inventory.js';
import {
  cancelOrder,
  createCheckout,
  getOrderForCheckout,
  placeOrder,
  updateCheckoutAddress,
  updateCheckoutContact,
  updateOrderStatus,
} from './orders.js';
import type { OrderDomainError } from './orders.js';
import { createOrganization } from './platform.js';
import { createPriceDefinition } from './pricing.js';
import { createCouponCode, createPromotion } from './promotions.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function fixture(quantity = '2') {
  const organization = await createOrganization(database.db, {
    code: `order-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Order test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  const productType = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, ${`hat-${crypto.randomUUID().slice(0, 4)}`}, 'Hat') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at) values (${organization.id}, ${productType.rows[0]!.id}, ${`order-hat-${crypto.randomUUID().slice(0, 8)}`}, 'Order Hat', 'ACTIVE', 'PUBLISHED', now()) returning id`.execute(
    database.db,
  );
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${`ORDER-${crypto.randomUUID().slice(0, 8)}`}, ${`ORDERSKU-${crypto.randomUUID().slice(0, 8)}`}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `ORD-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Order warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  await adjustInventory(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    locationId: location.id,
    condition: 'SELLABLE',
    quantityDelta: quantity,
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
  return { organizationId: organization.id, actorId, variantId: variant.rows[0]!.id };
}

async function checkoutFor(input: Awaited<ReturnType<typeof fixture>>) {
  const cart = await createGuestCart(database.db, {
    organizationId: input.organizationId,
    currency: 'BDT',
  });
  const withLine = await addGuestCartLine(database.db, {
    token: cart.token,
    variantId: input.variantId,
    quantity: '1',
    expectedVersion: cart.cart.version,
    idempotencyKey: crypto.randomUUID(),
  });
  const checkout = await createCheckout(database.db, { cartToken: cart.token });
  const contact = await updateCheckoutContact(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: checkout.checkout.version,
    contact: { name: 'Guest Buyer', phone: '01700000000' },
  });
  const addressed = await updateCheckoutAddress(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: contact.version,
    address: {
      recipientName: 'Guest Buyer',
      phone: '01700000000',
      addressLine1: '1 Checkout Lane',
      countryCode: 'BD',
    },
  });
  return { cart, checkout, addressed, withLine };
}

async function submit(
  flow: {
    cart: { token: string };
    checkout: { token: string };
    addressed: { calculationVersion: number; calculationFingerprint: string };
  },
  idempotencyKey = crypto.randomUUID(),
) {
  return placeOrder(database.db, {
    checkoutToken: flow.checkout.token,
    cartToken: flow.cart.token,
    acceptedCalculationVersion: flow.addressed.calculationVersion,
    acceptedCalculationFingerprint: flow.addressed.calculationFingerprint,
    idempotencyKey,
  });
}

async function balances(input: Awaited<ReturnType<typeof fixture>>) {
  const result = await sql<{ sellable: string; reserved: string }>`
    select sum(sellable_quantity)::text as sellable, sum(reserved_quantity)::text as reserved
    from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id
    where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}
  `.execute(database.db);
  return result.rows[0];
}

describe('atomic guest checkout and COD Orders', () => {
  it('commits immutable snapshots and one reservation without physically deducting stock, then releases once on cancellation', async () => {
    const input = await fixture();
    const flow = await checkoutFor(input);
    const placed = await submit(flow);
    expect(placed.kind).toBe('PLACED');
    if (placed.kind !== 'PLACED') return;
    expect(placed.order).toMatchObject({
      status: 'PENDING',
      paymentMethod: 'COD',
      merchandiseNet: '1290.0000',
      customer: { displayName: 'Guest Buyer' },
    });
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '1.000000' });
    const orderCustomer = await sql<{ customer_id: string }>`
      select customer_id from orders.orders where id = ${placed.order.id}
    `.execute(database.db);
    await sql`update customers.customers set display_name = 'Changed after order' where id = ${orderCustomer.rows[0]!.customer_id}`.execute(
      database.db,
    );
    const snapshot = await sql<{
      display_name: string;
    }>`select display_name from orders.order_customer_snapshots where order_id = ${placed.order.id}`.execute(
      database.db,
    );
    expect(snapshot.rows[0]?.display_name).toBe('Guest Buyer');
    await sql`update catalog.products set title = 'Changed after order' where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    await sql`update catalog.product_variants set sku = 'CHANGED-SKU' where id = ${input.variantId}`.execute(
      database.db,
    );
    expect((await getOrderForCheckout(database.db, flow.checkout.token)).lines[0]).toMatchObject({
      productTitle: 'Order Hat',
    });
    const version = await sql<{
      version: string;
    }>`select version::text from orders.orders where id = ${placed.order.id}`.execute(database.db);
    await updateOrderStatus(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: placed.order.id,
      expectedVersion: Number(version.rows[0]!.version),
      nextStatus: 'CONFIRMED',
    });
    await expect(
      cancelOrder(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        orderId: placed.order.id,
        expectedVersion: Number(version.rows[0]!.version),
        reasonCode: 'CUSTOMER_REQUEST',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' } satisfies Partial<OrderDomainError>);
    const freshVersion = await sql<{
      version: string;
    }>`select version::text from orders.orders where id = ${placed.order.id}`.execute(database.db);
    const cancelled = await cancelOrder(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: placed.order.id,
      expectedVersion: Number(freshVersion.rows[0]!.version),
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(cancelled).toMatchObject({ releasedReservations: 1, order: { status: 'CANCELLED' } });
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '0.000000' });
    const retry = await cancelOrder(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: placed.order.id,
      expectedVersion: 1,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(retry.releasedReservations).toBe(0);
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '0.000000' });
  });

  it('allows only one real PostgreSQL last-unit winner with no residual failed Order', async () => {
    const input = await fixture('1');
    const [first, second] = await Promise.all([checkoutFor(input), checkoutFor(input)]);
    const attempts = await Promise.allSettled([submit(first), submit(second)]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const failed = attempts.find((attempt) => attempt.status === 'rejected');
    expect(failed?.status).toBe('rejected');
    if (failed?.status === 'rejected')
      expect(failed.reason).toMatchObject({ code: 'OUT_OF_STOCK' });
    const orders = await sql<{
      count: string;
    }>`select count(*)::text as count from orders.orders where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(orders.rows[0]?.count).toBe('1');
    expect(await balances(input)).toEqual({ sellable: '1.000000', reserved: '1.000000' });
  });

  it('makes duplicate same-key submission canonical, rejects fingerprint reuse, and completes a checkout only once', async () => {
    const input = await fixture();
    const flow = await checkoutFor(input);
    const key = crypto.randomUUID();
    const [first, duplicate] = await Promise.all([submit(flow, key), submit(flow, key)]);
    expect(first.kind).toBe('PLACED');
    expect(duplicate.kind).toBe('PLACED');
    if (first.kind === 'PLACED' && duplicate.kind === 'PLACED')
      expect(duplicate.order.id).toBe(first.order.id);
    await expect(
      placeOrder(database.db, {
        checkoutToken: flow.checkout.token,
        cartToken: flow.cart.token,
        acceptedCalculationVersion: flow.addressed.calculationVersion + 1,
        acceptedCalculationFingerprint: `${flow.addressed.calculationFingerprint}-changed`,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' } satisfies Partial<OrderDomainError>);
    await expect(submit(flow, crypto.randomUUID())).rejects.toMatchObject({
      code: 'CHECKOUT_COMPLETED',
    } satisfies Partial<OrderDomainError>);
    const orders = await sql<{
      count: string;
    }>`select count(*)::text as count from orders.orders where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(orders.rows[0]?.count).toBe('1');
  });

  it('rolls back every Order side effect after a test-only failure following reservation', async () => {
    const input = await fixture();
    const flow = await checkoutFor(input);
    await expect(
      placeOrder(database.db, {
        checkoutToken: flow.checkout.token,
        cartToken: flow.cart.token,
        acceptedCalculationVersion: flow.addressed.calculationVersion,
        acceptedCalculationFingerprint: flow.addressed.calculationFingerprint,
        idempotencyKey: crypto.randomUUID(),
        fault(stage) {
          if (stage === 'after-reservation') throw new Error('intentional test fault');
        },
      }),
    ).rejects.toThrow('intentional test fault');
    const effects = await sql<{ orders: string; reservations: string; outbox: string }>`
      select
        (select count(*)::text from orders.orders where organization_id = ${input.organizationId}) as orders,
        (select count(*)::text from orders.order_inventory_reservations where organization_id = ${input.organizationId}) as reservations,
        (select count(*)::text from platform.outbox_events where organization_id = ${input.organizationId} and event_type = 'orders.order.placed') as outbox
    `.execute(database.db);
    expect(effects.rows[0]).toEqual({ orders: '0', reservations: '0', outbox: '0' });
    expect(await balances(input)).toEqual({ sellable: '2.000000', reserved: '0.000000' });
  });

  it('blocks stale price, catalog, and inventory state without creating partial Orders', async () => {
    const priceInput = await fixture();
    const priceFlow = await checkoutFor(priceInput);
    await sql`update pricing.price_definitions set status = 'ARCHIVED' where organization_id = ${priceInput.organizationId}`.execute(
      database.db,
    );
    await createPriceDefinition(database.db, {
      organizationId: priceInput.organizationId,
      actorId: priceInput.actorId,
      variantId: priceInput.variantId,
      currency: 'BDT',
      amount: '1390.0000',
    });
    const stalePrice = await submit(priceFlow);
    expect(stalePrice.kind).toBe('CHANGED');
    if (stalePrice.kind === 'CHANGED')
      expect(stalePrice.checkout.cart.lines[0]?.unitPrice).toBe('1390.0000');

    const catalogInput = await fixture();
    const catalogFlow = await checkoutFor(catalogInput);
    await sql`update catalog.products set status = 'DRAFT', publication_status = 'UNPUBLISHED' where organization_id = ${catalogInput.organizationId}`.execute(
      database.db,
    );
    await expect(submit(catalogFlow)).rejects.toMatchObject({
      code: 'CHECKOUT_CHANGED',
    } satisfies Partial<OrderDomainError>);

    const inventoryInput = await fixture('1');
    const inventoryFlow = await checkoutFor(inventoryInput);
    const location = await sql<{ location_id: string }>`
      select level.location_id from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id
      where item.organization_id = ${inventoryInput.organizationId} and item.variant_id = ${inventoryInput.variantId}
    `.execute(database.db);
    await adjustInventory(database.db, {
      organizationId: inventoryInput.organizationId,
      actorId: inventoryInput.actorId,
      variantId: inventoryInput.variantId,
      locationId: location.rows[0]!.location_id,
      condition: 'SELLABLE',
      quantityDelta: '-1',
      reasonCode: 'CORRECTION',
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(submit(inventoryFlow)).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
    } satisfies Partial<OrderDomainError>);
    const counts = await sql<{
      count: string;
    }>`select count(*)::text as count from orders.orders where organization_id in (${priceInput.organizationId}, ${catalogInput.organizationId}, ${inventoryInput.organizationId})`.execute(
      database.db,
    );
    expect(counts.rows[0]?.count).toBe('0');
  });

  it('serializes final coupon redemption so the losing real transaction leaves no Order', async () => {
    const input = await fixture('3');
    const promotion = await createPromotion(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      name: 'One use checkout coupon',
      promotionType: 'COUPON',
      benefitType: 'PERCENTAGE_DISCOUNT',
      benefitValue: '10.0000',
      combinability: 'EXCLUSIVE',
    });
    const coupon = await createCouponCode(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      promotionId: promotion.id,
      code: `ONE-${crypto.randomUUID().slice(0, 8)}`,
    });
    await sql`update promotions.coupon_codes set usage_limit_total = 1 where id = ${coupon.id}`.execute(
      database.db,
    );
    const [firstCart, secondCart] = await Promise.all([
      createGuestCart(database.db, { organizationId: input.organizationId, currency: 'BDT' }),
      createGuestCart(database.db, { organizationId: input.organizationId, currency: 'BDT' }),
    ]);
    for (const cart of [firstCart, secondCart]) {
      const line = await addGuestCartLine(database.db, {
        token: cart.token,
        variantId: input.variantId,
        quantity: '1',
        expectedVersion: cart.cart.version,
        idempotencyKey: crypto.randomUUID(),
      });
      await applyGuestCartCoupon(database.db, {
        token: cart.token,
        couponCode: coupon.normalizedCode,
        expectedVersion: line.version,
      });
    }
    const makeCheckout = async (cartToken: string) => {
      const checkout = await createCheckout(database.db, { cartToken });
      const contact = await updateCheckoutContact(database.db, {
        checkoutToken: checkout.token,
        cartToken,
        expectedVersion: checkout.checkout.version,
        contact: { name: 'Coupon Buyer', phone: '01700000000' },
      });
      const addressed = await updateCheckoutAddress(database.db, {
        checkoutToken: checkout.token,
        cartToken,
        expectedVersion: contact.version,
        address: {
          recipientName: 'Coupon Buyer',
          phone: '01700000000',
          addressLine1: 'Coupon Lane',
          countryCode: 'BD',
        },
      });
      return { cart: { token: cartToken }, checkout, addressed };
    };
    const [first, second] = await Promise.all([
      makeCheckout(firstCart.token),
      makeCheckout(secondCart.token),
    ]);
    const attempts = await Promise.allSettled([submit(first), submit(second)]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const usage = await sql<{
      count: string;
    }>`select count(*)::text as count from promotions.promotion_usage where coupon_code_id = ${coupon.id} and status = 'COMMITTED'`.execute(
      database.db,
    );
    expect(usage.rows[0]?.count).toBe('1');
  });

  it('allocates unique, monotonic Order numbers under concurrent checkout completion', async () => {
    const input = await fixture('4');
    const flows = await Promise.all([checkoutFor(input), checkoutFor(input), checkoutFor(input)]);
    const results = await Promise.all(flows.map((flow) => submit(flow)));
    const numbers = results.flatMap((result) =>
      result.kind === 'PLACED' ? [result.order.orderNumber] : [],
    );
    expect(numbers).toHaveLength(3);
    expect(new Set(numbers).size).toBe(3);
    expect(numbers.every((number) => /^ORD-\d{4}-\d{6}$/.test(number))).toBe(true);
    const counters = numbers
      .map((number) => Number(number.slice(-6)))
      .toSorted((left, right) => left - right);
    expect(counters[2]! - counters[0]!).toBe(2);
  });
});
