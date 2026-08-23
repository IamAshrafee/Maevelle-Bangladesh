import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { addGuestCartLine, createGuestCart } from './cart.js';
import {
  addLandedCostComponent,
  allocateDeterministically,
  CostingDomainError,
  createLandedCostRevision,
  createLandedCostWorksheet,
  finalizeLandedCostWorksheet,
} from './costing.js';
import { createDatabase } from './index.js';
import {
  createDelivery,
  dispatchDelivery,
  markDelivered,
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
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 8,
});
afterAll(async () => database.close());

async function receivedShipment() {
  const organization = await createOrganization(database.db, {
    code: `costing-${crypto.randomUUID().slice(0, 10)}`,
    displayName: 'Costing test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'CNY',
  });
  const actorId = crypto.randomUUID();
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, ${`cost-${crypto.randomUUID().slice(0, 8)}`}, 'Cost product') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at) values (${organization.id}, ${type.rows[0]!.id}, ${`cost-${crypto.randomUUID().slice(0, 8)}`}, 'Cost product', 'ACTIVE', 'PUBLISHED', now()) returning id`.execute(
    database.db,
  );
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${`COST-${crypto.randomUUID().slice(0, 8)}`}, ${`COST-${crypto.randomUUID().slice(0, 8)}`}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `COST-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Cost warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING', 'PURCHASE_RECEIVING'],
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
    code: `COST-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Cost supplier',
  });
  const purchase = await createPurchase(database.db, {
    organizationId: organization.id,
    actorId,
    supplierId: supplier.id,
    currencyCode: 'CNY',
  });
  const lined = await addPurchaseLine(database.db, {
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
    expectedVersion: lined.version,
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
  const allocationId = arrived.allocations[0]!.id;
  await postInboundReceipt(database.db, {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    lines: [{ shipmentAllocationId: allocationId, condition: 'SELLABLE', quantity: '6' }],
    idempotencyKey: crypto.randomUUID(),
  });
  await postInboundReceipt(database.db, {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    lines: [{ shipmentAllocationId: allocationId, condition: 'SELLABLE', quantity: '4' }],
    idempotencyKey: crypto.randomUUID(),
  });
  return {
    organizationId: organization.id,
    actorId,
    shipmentId: shipment.id,
    locationId: location.id,
    variantId: variant.rows[0]!.id,
  };
}

async function createDispatchedDelivery(
  input: Awaited<ReturnType<typeof receivedShipment>>,
  quantity: string,
) {
  const cart = await createGuestCart(database.db, {
    organizationId: input.organizationId,
    currency: 'CNY',
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
    contact: { name: 'Cost Buyer', phone: '01700000000' },
  });
  const addressed = await updateCheckoutAddress(database.db, {
    checkoutToken: checkout.token,
    cartToken: cart.token,
    expectedVersion: contact.version,
    address: {
      recipientName: 'Cost Buyer',
      phone: '01700000000',
      addressLine1: '1 Cost Road',
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
  const orderLine = await sql<{
    id: string;
  }>`select id from orders.order_lines where order_id = ${placed.order.id}`.execute(database.db);
  const created = await createFulfillment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    orderId: placed.order.id,
    locationId: input.locationId,
    lines: [{ orderLineId: orderLine.rows[0]!.id, quantity }],
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
  return {
    dispatched,
    inTransit: await dispatchDelivery(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: booked.id,
      expectedVersion: booked.version,
      idempotencyKey: crypto.randomUUID(),
    }),
  };
}

describe('landed-cost deterministic allocation', () => {
  const targets = [
    { id: 'a', shipmentAllocationId: 'shipment-a', basis: '1' },
    { id: 'b', shipmentAllocationId: 'shipment-b', basis: '1' },
    { id: 'c', shipmentAllocationId: 'shipment-c', basis: '1' },
  ];

  it('uses stable largest-remainder rounding and preserves the committed component total', () => {
    const first = allocateDeterministically('100.0000', targets);
    const second = allocateDeterministically('100.0000', targets);
    expect(first).toEqual(second);
    expect(first.map((item) => item.amount)).toEqual(['33.3334', '33.3333', '33.3333']);
    expect(first.reduce((total, item) => total + Number(item.amount), 0)).toBeCloseTo(100, 10);
  });

  it('allocates quantity and purchase-value bases exactly without JavaScript float arithmetic', () => {
    expect(
      allocateDeterministically('100.0000', [
        { id: 'a', shipmentAllocationId: 'a', basis: '6.000000' },
        { id: 'b', shipmentAllocationId: 'b', basis: '4.000000' },
      ]),
    ).toMatchObject([{ amount: '60.0000' }, { amount: '40.0000' }]);
    expect(
      allocateDeterministically('100.0000', [
        { id: 'a', shipmentAllocationId: 'a', basis: '300.000000' },
        { id: 'b', shipmentAllocationId: 'b', basis: '100.000000' },
      ]),
    ).toMatchObject([{ amount: '75.0000' }, { amount: '25.0000' }]);
  });

  it('rejects unavailable or zero allocation metadata rather than silently falling back', () => {
    expect(() =>
      allocateDeterministically('10.0000', [{ id: 'a', shipmentAllocationId: 'a', basis: '0' }]),
    ).toThrow(CostingDomainError);
  });

  it('preserves finalized evidence through an append-only credit revision and adjusts both receipt layers', async () => {
    const input = await receivedShipment();
    const worksheet = await createLandedCostWorksheet(database.db, {
      ...input,
      baseCurrencyCode: 'CNY',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: worksheet.revisionId,
      costType: 'INTERNATIONAL_FREIGHT',
      scope: 'GLOBAL',
      originalAmount: '100.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'ACTUAL',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: worksheet.revisionId,
    });
    const initial = await sql<{
      total: string;
      unit: string;
    }>`select total_acquisition_cost::text as total, unit_acquisition_cost::text as unit from landed_cost.acquisition_cost_results where worksheet_revision_id = ${worksheet.revisionId}`.execute(
      database.db,
    );
    expect(initial.rows[0]).toMatchObject({ total: '500.00000000', unit: '50.00000000' });
    const credit = await createLandedCostRevision(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      worksheetId: worksheet.id,
      kind: 'CREDIT',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: credit.revisionId,
      costType: 'INTERNATIONAL_FREIGHT',
      scope: 'GLOBAL',
      originalAmount: '-100.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'CREDIT',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: credit.revisionId,
    });
    const revisions = await sql<{
      revision_number: string;
      status: string;
    }>`select revision_number::text, status from landed_cost.worksheet_revisions where worksheet_id = ${worksheet.id} order by revision_number`.execute(
      database.db,
    );
    expect(revisions.rows).toEqual([
      { revision_number: '1', status: 'SUPERSEDED' },
      { revision_number: '2', status: 'FINALIZED' },
    ]);
    const effects = await sql<{
      delta: string;
      remaining: string;
    }>`select (select coalesce(sum(adjustment.delta_total_cost), 0)::text from costing.cost_layer_adjustments adjustment where adjustment.organization_id = ${input.organizationId}) as delta, (select coalesce(sum(position.remaining_quantity), 0)::text from costing.cost_layer_positions position where position.organization_id = ${input.organizationId}) as remaining`.execute(
      database.db,
    );
    expect(effects.rows[0]).toMatchObject({ delta: '0.00000000', remaining: '10.000000' });
  });

  it('consumes receipt-backed FIFO cost at dispatch and recognizes immutable COGS only at successful delivery', async () => {
    const input = await receivedShipment();
    const worksheet = await createLandedCostWorksheet(database.db, {
      ...input,
      baseCurrencyCode: 'CNY',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: worksheet.revisionId,
      costType: 'INTERNATIONAL_FREIGHT',
      scope: 'GLOBAL',
      originalAmount: '100.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'ACTUAL',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: worksheet.revisionId,
    });
    const flow = await createDispatchedDelivery(input, '3');
    const before = await sql<{
      remaining: string;
      assigned: string;
      cogs: string;
    }>`select (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining, (select total_cost::text from costing.outbound_cost_assignments where fulfillment_id = ${flow.dispatched.id}) as assigned, (select count(*)::text from costing.cogs_recognitions where organization_id = ${input.organizationId}) as cogs`.execute(
      database.db,
    );
    expect(before.rows[0]).toEqual({ remaining: '7.000000', assigned: '150.00000000', cogs: '0' });
    const deliveryKey = crypto.randomUUID();
    await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: flow.inTransit.id,
      expectedVersion: flow.inTransit.version,
      idempotencyKey: deliveryKey,
    });
    await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: flow.inTransit.id,
      expectedVersion: flow.inTransit.version,
      idempotencyKey: deliveryKey,
    });
    const after = await sql<{
      total: string;
      count: string;
    }>`select coalesce(sum(total_cost), 0)::text as total, count(*)::text as count from costing.cogs_recognitions where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(after.rows[0]).toEqual({ total: '150.00000000', count: '1' });
  });
});
