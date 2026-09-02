import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import {
  addLandedCostComponent,
  createLandedCostWorksheet,
  finalizeLandedCostWorksheet,
  verifyCostingIntegrity,
} from './costing.js';
import { createDatabase } from './index.js';
import {
  createDelivery,
  dispatchDelivery,
  markDelivered,
  markDeliveryFailed,
  recordManualCourierBooking,
} from './delivery.js';
import { createFulfillment, dispatchFulfillment, transitionFulfillment } from './fulfillment.js';
import {
  createCheckout,
  placeOrder,
  updateCheckoutAddress,
  updateCheckoutContact,
} from './orders.js';
import { createOrganization } from './platform.js';
import { createPriceDefinition } from './pricing.js';
import {
  addPurchaseLine,
  createPurchase,
  createShipment,
  createSupplier,
  markShipmentArrived,
  placePurchase,
  postInboundReceipt,
} from './procurement.js';
import {
  authorizeReturnCase,
  createReturnCase,
  initiateRto,
  postReturnReceipt,
  verifyReturnIntegrity,
} from './returns.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 8,
});
afterAll(async () => database.close());

async function returnFixture() {
  const organization = await createOrganization(database.db, {
    code: `return-${crypto.randomUUID().slice(0, 10)}`,
    displayName: 'Returns test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'CNY',
  });
  const actorId = crypto.randomUUID();
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, ${`return-${crypto.randomUUID().slice(0, 8)}`}, 'Return product') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at) values (${organization.id}, ${type.rows[0]!.id}, ${`return-${crypto.randomUUID().slice(0, 8)}`}, 'Return product', 'ACTIVE', 'PUBLISHED', now()) returning id`.execute(
    database.db,
  );
  const sku = `RET-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${sku}, ${sku}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `RET-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Returns warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING', 'PURCHASE_RECEIVING', 'RETURN_RECEIVING'],
  });
  await createPriceDefinition(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    currency: 'CNY',
    amount: '129.0000',
  });
  const supplier = await createSupplier(database.db, {
    organizationId: organization.id,
    actorId,
    code: `SUP-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Return supplier',
  });
  const purchase = await createPurchase(database.db, {
    organizationId: organization.id,
    actorId,
    supplierId: supplier.id,
    currencyCode: 'CNY',
  });
  const purchaseLine = await addPurchaseLine(database.db, {
    organizationId: organization.id,
    actorId,
    purchaseId: purchase.id,
    variantId: variant.rows[0]!.id,
    quantity: '10',
    unitPrice: '40.0000',
  });
  const placed = await placePurchase(database.db, {
    organizationId: organization.id,
    actorId,
    purchaseId: purchase.id,
    expectedVersion: purchaseLine.version,
  });
  const shipment = await createShipment(database.db, {
    organizationId: organization.id,
    actorId,
    receivingLocationId: location.id,
    transportMode: 'SEA',
    allocations: [{ purchaseLineId: placed.lines[0]!.id, quantity: '10' }],
  });
  const arrived = await markShipmentArrived(database.db, {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    expectedVersion: shipment.version,
    idempotencyKey: crypto.randomUUID(),
  });
  await postInboundReceipt(database.db, {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    lines: [
      { shipmentAllocationId: arrived.allocations[0]!.id, condition: 'SELLABLE', quantity: '10' },
    ],
    idempotencyKey: crypto.randomUUID(),
  });
  const worksheet = await createLandedCostWorksheet(database.db, {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    baseCurrencyCode: 'CNY',
  });
  await addLandedCostComponent(database.db, {
    organizationId: organization.id,
    revisionId: worksheet.revisionId,
    costType: 'INTERNATIONAL_FREIGHT',
    scope: 'GLOBAL',
    originalAmount: '100.0000',
    originalCurrencyCode: 'CNY',
    valueStatus: 'ACTUAL',
    allocationMethod: 'QUANTITY',
  });
  await finalizeLandedCostWorksheet(database.db, {
    organizationId: organization.id,
    actorId,
    revisionId: worksheet.revisionId,
  });
  return {
    organizationId: organization.id,
    actorId,
    locationId: location.id,
    variantId: variant.rows[0]!.id,
  };
}

async function deliveredOrder(
  input: Awaited<ReturnType<typeof returnFixture>>,
  outcome: 'DELIVERED' | 'FAILED' = 'DELIVERED',
) {
  const cart = await createGuestCart(database.db, {
    organizationId: input.organizationId,
    currency: 'CNY',
  });
  await addGuestCartLine(database.db, {
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
    contact: { name: 'Return customer', phone: '01700000000' },
  });
  const addressed = await updateCheckoutAddress(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: contact.version,
    address: {
      recipientName: 'Return customer',
      phone: '01700000000',
      addressLine1: '1 Return Road',
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
  if (placed.kind !== 'PLACED') throw new Error('Expected a placed order.');
  const orderLine = await sql<{
    id: string;
  }>`select id from orders.order_lines where order_id=${placed.order.id}`.execute(database.db);
  const fulfillment = await createFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    orderId: placed.order.id,
    locationId: input.locationId,
    lines: [{ orderLineId: orderLine.rows[0]!.id, quantity: '1' }],
    idempotencyKey: crypto.randomUUID(),
  });
  const ready = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: fulfillment.id,
    expectedVersion: fulfillment.version,
    nextStatus: 'READY',
  });
  const picking = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: ready.id,
    expectedVersion: ready.version,
    nextStatus: 'PICKING',
  });
  const packed = await transitionFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    fulfillmentId: picking.id,
    expectedVersion: picking.version,
    nextStatus: 'PACKED',
  });
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
    carrierName: 'Manual',
    trackingReference: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  });
  const inTransit = await dispatchDelivery(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    deliveryId: booked.id,
    expectedVersion: booked.version,
    idempotencyKey: crypto.randomUUID(),
  });
  if (outcome === 'DELIVERED') {
    await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: inTransit.id,
      expectedVersion: inTransit.version,
      idempotencyKey: crypto.randomUUID(),
    });
  } else {
    await markDeliveryFailed(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: inTransit.id,
      expectedVersion: inTransit.version,
      reasonCode: 'UNREACHABLE',
      idempotencyKey: crypto.randomUUID(),
    });
  }
  const deliveryLine = await sql<{
    id: string;
  }>`select id from delivery.delivery_lines where delivery_id=${delivery.id}`.execute(database.db);
  return {
    orderId: placed.order.id,
    orderLineId: orderLine.rows[0]!.id,
    deliveryLineId: deliveryLine.rows[0]!.id,
    deliveryId: delivery.id,
  };
}

describe('reverse logistics', () => {
  it('keeps return intent commercial, then restores stock and recovers COGS only on the immutable receipt', async () => {
    const input = await returnFixture();
    const order = await deliveredOrder(input);
    const created = await createReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.orderId,
      reasonCode: 'WRONG_SIZE',
      lines: [
        { orderLineId: order.orderLineId, deliveryLineId: order.deliveryLineId, quantity: '1' },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      (
        await sql<{
          quantity: string;
        }>`select sum(sellable_quantity)::text as quantity from inventory.inventory_levels where organization_id=${input.organizationId}`.execute(
          database.db,
        )
      ).rows[0]!.quantity,
    ).toBe('9.000000');
    await authorizeReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      returnCaseId: created.id,
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    const line = await sql<{
      id: string;
    }>`select id from returns.return_lines where return_case_id=${created.id}`.execute(database.db);
    await postReturnReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      returnCaseId: created.id,
      locationId: input.locationId,
      lines: [{ returnLineId: line.rows[0]!.id, condition: 'SELLABLE', quantity: '1' }],
      idempotencyKey: crypto.randomUUID(),
    });
    const facts = await sql<{
      stock: string;
      return_layers: string;
      recoveries: string;
      status: string;
    }>`select (select sum(sellable_quantity)::text from inventory.inventory_levels where organization_id=${input.organizationId}) as stock, (select count(*)::text from costing.return_cost_layers where organization_id=${input.organizationId}) as return_layers, (select count(*)::text from costing.cogs_recoveries where organization_id=${input.organizationId}) as recoveries, (select case_status from returns.return_cases where id=${created.id}) as status`.execute(
      database.db,
    );
    expect(facts.rows[0]).toEqual({
      stock: '10.000000',
      return_layers: '1',
      recoveries: '1',
      status: 'RESOLVED',
    });
    expect(await verifyReturnIntegrity(database.db, input.organizationId)).toEqual([]);
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
  });

  it('rolls back reverse inventory and cost facts together and does not reveal another tenant case', async () => {
    const input = await returnFixture();
    const order = await deliveredOrder(input);
    const created = await createReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.orderId,
      reasonCode: 'OTHER',
      lines: [{ orderLineId: order.orderLineId, quantity: '1' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await authorizeReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      returnCaseId: created.id,
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    const line = await sql<{
      id: string;
    }>`select id from returns.return_lines where return_case_id=${created.id}`.execute(database.db);
    await expect(
      postReturnReceipt(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        returnCaseId: created.id,
        locationId: input.locationId,
        lines: [{ returnLineId: line.rows[0]!.id, condition: 'SELLABLE', quantity: '1' }],
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('return fault');
        },
      }),
    ).rejects.toThrow('return fault');
    const rollback = await sql<{
      receipts: string;
      layers: string;
      stock: string;
    }>`select (select count(*)::text from returns.return_receipts where return_case_id=${created.id}) as receipts, (select count(*)::text from costing.return_cost_layers where organization_id=${input.organizationId}) as layers, (select sum(sellable_quantity)::text from inventory.inventory_levels where organization_id=${input.organizationId}) as stock`.execute(
      database.db,
    );
    expect(rollback.rows[0]).toEqual({ receipts: '0', layers: '0', stock: '9.000000' });
    const other = await createOrganization(database.db, {
      code: `other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'CNY',
    });
    await expect(
      authorizeReturnCase(database.db, {
        organizationId: other.id,
        actorId: input.actorId,
        returnCaseId: created.id,
        expectedVersion: 1,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('treats RTO as a failed-delivery reverse receipt and never fabricates COGS recovery', async () => {
    const input = await returnFixture();
    const order = await deliveredOrder(input, 'FAILED');
    const rto = await initiateRto(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: order.deliveryId,
      idempotencyKey: crypto.randomUUID(),
    });
    const line = await sql<{
      id: string;
    }>`select id from returns.return_lines where return_case_id=${rto.id}`.execute(database.db);
    await postReturnReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      returnCaseId: rto.id,
      locationId: input.locationId,
      lines: [{ returnLineId: line.rows[0]!.id, condition: 'INSPECTION', quantity: '1' }],
      idempotencyKey: crypto.randomUUID(),
    });
    const facts = await sql<{ layers: string; recoveries: string; inspection: string }>`select
      (select count(*)::text from costing.return_cost_layers where organization_id=${input.organizationId}) as layers,
      (select count(*)::text from costing.cogs_recoveries where organization_id=${input.organizationId}) as recoveries,
      (select quantity::text from inventory.inventory_level_conditions where organization_id=${input.organizationId} and condition_code='INSPECTION') as inspection`.execute(
      database.db,
    );
    expect(facts.rows[0]).toEqual({ layers: '1', recoveries: '0', inspection: '1.000000' });
  });

  it('serializes concurrent reverse receipts so physical stock and COGS recovery are posted once', async () => {
    const input = await returnFixture();
    const order = await deliveredOrder(input);
    const created = await createReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: order.orderId,
      reasonCode: 'OTHER',
      lines: [{ orderLineId: order.orderLineId, quantity: '1' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await authorizeReturnCase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      returnCaseId: created.id,
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    const line = await sql<{
      id: string;
    }>`select id from returns.return_lines where return_case_id=${created.id}`.execute(database.db);
    const first = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    const second = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    try {
      const attempts = await Promise.allSettled(
        [first, second].map((client) =>
          postReturnReceipt(client.db, {
            organizationId: input.organizationId,
            actorId: input.actorId,
            returnCaseId: created.id,
            locationId: input.locationId,
            lines: [{ returnLineId: line.rows[0]!.id, condition: 'SELLABLE', quantity: '1' }],
            idempotencyKey: crypto.randomUUID(),
          }),
        ),
      );
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
    const facts = await sql<{
      stock: string;
      receipts: string;
      layers: string;
      recoveries: string;
    }>`select
      (select sum(sellable_quantity)::text from inventory.inventory_levels where organization_id=${input.organizationId}) as stock,
      (select count(*)::text from returns.return_receipts where return_case_id=${created.id}) as receipts,
      (select count(*)::text from costing.return_cost_layers where organization_id=${input.organizationId}) as layers,
      (select count(*)::text from costing.cogs_recoveries where organization_id=${input.organizationId}) as recoveries`.execute(
      database.db,
    );
    expect(facts.rows[0]).toEqual({
      stock: '10.000000',
      receipts: '1',
      layers: '1',
      recoveries: '1',
    });
  });
});
