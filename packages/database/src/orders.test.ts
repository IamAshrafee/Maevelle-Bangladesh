import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import { createDatabase } from './index.js';
import { adjustInventory } from './inventory.js';
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

describe('atomic guest checkout and COD Orders', () => {
  it('commits immutable snapshots and one reservation without physically deducting stock, then releases once on cancellation', async () => {
    const input = await fixture();
    const flow = await checkoutFor(input);
    const placed = await placeOrder(database.db, {
      checkoutToken: flow.checkout.token,
      cartToken: flow.cart.token,
      acceptedCalculationVersion: flow.addressed.calculationVersion,
      acceptedCalculationFingerprint: flow.addressed.calculationFingerprint,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(placed.kind).toBe('PLACED');
    if (placed.kind !== 'PLACED') return;
    expect(placed.order).toMatchObject({
      status: 'PENDING',
      paymentMethod: 'COD',
      merchandiseNet: '1290.0000',
      customer: { displayName: 'Guest Buyer' },
    });
    const balance = await sql<{
      sellable: string;
      reserved: string;
    }>`select sum(sellable_quantity)::text as sellable, sum(reserved_quantity)::text as reserved from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}`.execute(
      database.db,
    );
    expect(balance.rows[0]).toEqual({ sellable: '2.000000', reserved: '1.000000' });
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
    const version = await sql<{
      version: string;
    }>`select version::text from orders.orders where id = ${placed.order.id}`.execute(database.db);
    const cancelled = await cancelOrder(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: placed.order.id,
      expectedVersion: Number(version.rows[0]!.version),
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(cancelled).toMatchObject({ releasedReservations: 1, order: { status: 'CANCELLED' } });
    const after = await sql<{
      sellable: string;
      reserved: string;
    }>`select sum(sellable_quantity)::text as sellable, sum(reserved_quantity)::text as reserved from inventory.inventory_levels level join inventory.inventory_items item on item.id = level.inventory_item_id where item.organization_id = ${input.organizationId} and item.variant_id = ${input.variantId}`.execute(
      database.db,
    );
    expect(after.rows[0]).toEqual({ sellable: '2.000000', reserved: '0.000000' });
  });
});
