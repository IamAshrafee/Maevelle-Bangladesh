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
  getInventoryValuation,
  listCostLayers,
  listOutboundCostAssignments,
  previewLandedCostWorksheet,
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
  const skuString = `COST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${skuString}, ${skuString}, ${crypto.randomUUID()}) returning id`.execute(
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

async function createPackedFulfillment(
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
  return packed;
}

async function createDispatchedDelivery(
  input: Awaited<ReturnType<typeof receivedShipment>>,
  quantity: string,
) {
  const packed = await createPackedFulfillment(input, quantity);
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

async function finalizeFreight(
  input: Awaited<ReturnType<typeof receivedShipment>>,
  amount: string,
) {
  const worksheet = await createLandedCostWorksheet(database.db, {
    ...input,
    baseCurrencyCode: 'CNY',
  });
  await addLandedCostComponent(database.db, {
    organizationId: input.organizationId,
    revisionId: worksheet.revisionId,
    costType: 'INTERNATIONAL_FREIGHT',
    scope: 'GLOBAL',
    originalAmount: amount,
    originalCurrencyCode: 'CNY',
    valueStatus: amount.startsWith('-') ? 'CREDIT' : 'ACTUAL',
    allocationMethod: 'QUANTITY',
  });
  await finalizeLandedCostWorksheet(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    revisionId: worksheet.revisionId,
  });
  return worksheet;
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

  it('rolls back delivery and COGS together, then permits only one concurrent recognition', async () => {
    const input = await receivedShipment();
    const flow = await createDispatchedDelivery(input, '1');
    await expect(
      markDelivered(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: flow.inTransit.id,
        expectedVersion: flow.inTransit.version,
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('delivery fault');
        },
      }),
    ).rejects.toThrow('delivery fault');
    const rolledBack = await sql<{
      status: string;
      cogs: string;
    }>`select (select operational_status from delivery.deliveries where id = ${flow.inTransit.id}) as status, (select count(*)::text from costing.cogs_recognitions where organization_id = ${input.organizationId}) as cogs`.execute(
      database.db,
    );
    expect(rolledBack.rows[0]).toEqual({ status: 'IN_TRANSIT', cogs: '0' });
    const results = await Promise.allSettled([
      markDelivered(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: flow.inTransit.id,
        expectedVersion: flow.inTransit.version,
        idempotencyKey: crypto.randomUUID(),
      }),
      markDelivered(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        deliveryId: flow.inTransit.id,
        expectedVersion: flow.inTransit.version,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const cogs = await sql<{
      count: string;
    }>`select count(*)::text as count from costing.cogs_recognitions where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(cogs.rows[0]!.count).toBe('1');
  });

  it('keeps failed-delivery stock and its outbound assignment consumed without fabricated COGS', async () => {
    const input = await receivedShipment();
    const flow = await createDispatchedDelivery(input, '2');
    await markDeliveryFailed(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: flow.inTransit.id,
      expectedVersion: flow.inTransit.version,
      reasonCode: 'UNREACHABLE',
      idempotencyKey: crypto.randomUUID(),
    });
    const facts = await sql<{
      remaining: string;
      assignments: string;
      cogs: string;
      refunds: string;
    }>`select (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining, (select count(*)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignments, (select count(*)::text from costing.cogs_recognitions where organization_id = ${input.organizationId}) as cogs, (select count(*)::text from payments.refunds where organization_id = ${input.organizationId}) as refunds`.execute(
      database.db,
    );
    expect(facts.rows[0]).toEqual({
      remaining: '8.000000',
      assignments: '1',
      cogs: '0',
      refunds: '0',
    });
  });

  it('allows exactly one independent PostgreSQL FIFO consumer to claim the final costed unit', async () => {
    const input = await receivedShipment();
    const positions = await sql<{ id: string }>`
      select position.id
      from costing.cost_layer_positions position
      join costing.cost_layers layer on layer.id = position.cost_layer_id
      where position.organization_id = ${input.organizationId}
      order by layer.received_at, layer.id
    `.execute(database.db);
    await sql`update costing.cost_layer_positions set remaining_quantity = case when id = ${positions.rows[0]!.id}::uuid then 1 else 0 end where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    const [first, second] = await Promise.all([
      createPackedFulfillment(input, '1'),
      createPackedFulfillment(input, '1'),
    ]);
    const firstPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    const secondPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    try {
      const attempts = await Promise.allSettled([
        dispatchFulfillment(firstPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: first.id,
          expectedVersion: first.version,
          idempotencyKey: crypto.randomUUID(),
        }),
        dispatchFulfillment(secondPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: second.id,
          expectedVersion: second.version,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    } finally {
      await Promise.all([firstPool.close(), secondPool.close()]);
    }
    const facts = await sql<{ remaining: string; assignments: string; lines: string }>`
      select
        (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining,
        (select count(*)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignments,
        (select count(*)::text from costing.outbound_cost_assignment_lines where organization_id = ${input.organizationId}) as lines
    `.execute(database.db);
    expect(facts.rows[0]).toEqual({ remaining: '0.000000', assignments: '1', lines: '1' });
  });

  it('uses independent PostgreSQL locks to consume two FIFO layers once each', async () => {
    const input = await receivedShipment();
    const positions = await sql<{ id: string }>`
      select position.id
      from costing.cost_layer_positions position
      join costing.cost_layers layer on layer.id = position.cost_layer_id
      where position.organization_id = ${input.organizationId}
      order by layer.received_at, layer.id
    `.execute(database.db);
    expect(positions.rows).toHaveLength(2);
    await sql`update costing.cost_layer_positions set remaining_quantity = 1 where id in (${positions.rows[0]!.id}::uuid, ${positions.rows[1]!.id}::uuid)`.execute(
      database.db,
    );
    const [first, second] = await Promise.all([
      createPackedFulfillment(input, '1'),
      createPackedFulfillment(input, '1'),
    ]);
    const firstPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    const secondPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    try {
      await Promise.all([
        dispatchFulfillment(firstPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: first.id,
          expectedVersion: first.version,
          idempotencyKey: crypto.randomUUID(),
        }),
        dispatchFulfillment(secondPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: second.id,
          expectedVersion: second.version,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);
    } finally {
      await Promise.all([firstPool.close(), secondPool.close()]);
    }
    const facts = await sql<{ remaining: string; assignments: string; distinct_layers: string }>`
      select
        (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining,
        (select count(*)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignments,
        (select count(distinct cost_layer_id)::text from costing.outbound_cost_assignment_lines where organization_id = ${input.organizationId}) as distinct_layers
    `.execute(database.db);
    expect(facts.rows[0]).toEqual({
      remaining: '0.000000',
      assignments: '2',
      distinct_layers: '2',
    });
  });

  it('makes duplicate cost-layer-backed dispatch and injected failure atomic', async () => {
    const input = await receivedShipment();
    const packed = await createPackedFulfillment(input, '1');
    await expect(
      dispatchFulfillment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        fulfillmentId: packed.id,
        expectedVersion: packed.version,
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('dispatch fault');
        },
      }),
    ).rejects.toThrow('dispatch fault');
    const rollback = await sql<{
      status: string;
      on_hand: string;
      reserved: string;
      remaining: string;
      assignments: string;
      audit: string;
      outbox: string;
    }>`
      select
        (select status from fulfillment.fulfillments where id = ${packed.id}) as status,
        (select sellable_quantity::text from inventory.inventory_levels where organization_id = ${input.organizationId}) as on_hand,
        (select reserved_quantity::text from inventory.inventory_levels where organization_id = ${input.organizationId}) as reserved,
        (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining,
        (select count(*)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignments,
        (select count(*)::text from audit.audit_events where target_id = ${packed.id} and action = 'fulfillment.fulfillment.dispatched') as audit,
        (select count(*)::text from platform.outbox_events where aggregate_id = ${packed.id} and event_type = 'fulfillment.dispatched') as outbox
    `.execute(database.db);
    expect(rollback.rows[0]).toEqual({
      status: 'PACKED',
      on_hand: '10.000000',
      reserved: '1.000000',
      remaining: '10.000000',
      assignments: '0',
      audit: '0',
      outbox: '0',
    });
    const firstPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    const secondPool = createDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
      maxConnections: 1,
    });
    try {
      const attempts = await Promise.allSettled([
        dispatchFulfillment(firstPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: packed.id,
          expectedVersion: packed.version,
          idempotencyKey: crypto.randomUUID(),
        }),
        dispatchFulfillment(secondPool.db, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          fulfillmentId: packed.id,
          expectedVersion: packed.version,
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    } finally {
      await Promise.all([firstPool.close(), secondPool.close()]);
    }
    const committed = await sql<{
      status: string;
      on_hand: string;
      reserved: string;
      remaining: string;
      assignments: string;
      lines: string;
      audit: string;
      outbox: string;
    }>`
      select
        (select status from fulfillment.fulfillments where id = ${packed.id}) as status,
        (select sellable_quantity::text from inventory.inventory_levels where organization_id = ${input.organizationId}) as on_hand,
        (select reserved_quantity::text from inventory.inventory_levels where organization_id = ${input.organizationId}) as reserved,
        (select sum(remaining_quantity)::text from costing.cost_layer_positions where organization_id = ${input.organizationId}) as remaining,
        (select count(*)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignments,
        (select count(*)::text from costing.outbound_cost_assignment_lines where organization_id = ${input.organizationId}) as lines,
        (select count(*)::text from audit.audit_events where target_id = ${packed.id} and action = 'fulfillment.fulfillment.dispatched') as audit,
        (select count(*)::text from platform.outbox_events where aggregate_id = ${packed.id} and event_type = 'fulfillment.dispatched') as outbox
    `.execute(database.db);
    expect(committed.rows[0]).toEqual({
      status: 'DISPATCHED',
      on_hand: '9.000000',
      reserved: '0.000000',
      remaining: '9.000000',
      assignments: '1',
      lines: '1',
      audit: '1',
      outbox: '1',
    });
  });

  it('distributes a positive late acquisition adjustment exactly across on-hand, pending outbound, and recognized COGS', async () => {
    const input = await receivedShipment();
    const worksheet = await finalizeFreight(input, '600.0000');
    const delivered = await createDispatchedDelivery(input, '3');
    await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivered.inTransit.id,
      expectedVersion: delivered.inTransit.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await createDispatchedDelivery(input, '3');
    const original = await sql<{ layers: string; assignment: string; cogs: string }>`
      select
        (select sum(base_purchase_cost)::text from costing.cost_layers where organization_id = ${input.organizationId}) as layers,
        (select sum(total_cost)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignment,
        (select sum(total_cost)::text from costing.cogs_recognitions where organization_id = ${input.organizationId}) as cogs
    `.execute(database.db);
    const adjustment = await createLandedCostRevision(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      worksheetId: worksheet.id,
      kind: 'ADJUSTMENT',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: adjustment.revisionId,
      costType: 'CUSTOMS_DUTY',
      scope: 'GLOBAL',
      originalAmount: '100.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'ACTUAL',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: adjustment.revisionId,
    });
    const effects = await sql<{ source: string; pending: string; cogs: string }>`
      select
        (select sum(delta_total_cost)::text from costing.cost_layer_adjustments where worksheet_revision_id = ${adjustment.revisionId}) as source,
        (select sum(effect.amount)::text from costing.outbound_cost_assignment_adjustments effect join costing.cost_layer_adjustments source on source.id = effect.cost_layer_adjustment_id where source.worksheet_revision_id = ${adjustment.revisionId}) as pending,
        (select sum(effect.amount)::text from costing.cogs_adjustments effect join costing.cost_layer_adjustments source on source.id = effect.cost_layer_adjustment_id where source.worksheet_revision_id = ${adjustment.revisionId}) as cogs
    `.execute(database.db);
    expect(effects.rows[0]).toEqual({
      source: '100.00000000',
      pending: '30.00000000',
      cogs: '30.00000000',
    });
    expect(
      Number(effects.rows[0]!.source) -
        Number(effects.rows[0]!.pending) -
        Number(effects.rows[0]!.cogs),
    ).toBeCloseTo(40, 10);
    const after = await sql<{ layers: string; assignment: string; cogs: string }>`
      select
        (select sum(base_purchase_cost)::text from costing.cost_layers where organization_id = ${input.organizationId}) as layers,
        (select sum(total_cost)::text from costing.outbound_cost_assignments where organization_id = ${input.organizationId}) as assignment,
        (select sum(total_cost)::text from costing.cogs_recognitions where organization_id = ${input.organizationId}) as cogs
    `.execute(database.db);
    expect(after.rows[0]).toEqual(original.rows[0]);
  });

  it('records a negative credit through the same three append-only buckets without rewriting history', async () => {
    const input = await receivedShipment();
    const worksheet = await finalizeFreight(input, '600.0000');
    const delivered = await createDispatchedDelivery(input, '3');
    await markDelivered(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      deliveryId: delivered.inTransit.id,
      expectedVersion: delivered.inTransit.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await createDispatchedDelivery(input, '3');
    const credit = await createLandedCostRevision(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      worksheetId: worksheet.id,
      kind: 'CREDIT',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: credit.revisionId,
      costType: 'OTHER_ACQUISITION_COST',
      scope: 'GLOBAL',
      originalAmount: '-50.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'CREDIT',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: credit.revisionId,
    });
    const effects = await sql<{ source: string; pending: string; cogs: string; originals: string }>`
      select
        (select sum(delta_total_cost)::text from costing.cost_layer_adjustments where worksheet_revision_id = ${credit.revisionId}) as source,
        (select sum(effect.amount)::text from costing.outbound_cost_assignment_adjustments effect join costing.cost_layer_adjustments source on source.id = effect.cost_layer_adjustment_id where source.worksheet_revision_id = ${credit.revisionId}) as pending,
        (select sum(effect.amount)::text from costing.cogs_adjustments effect join costing.cost_layer_adjustments source on source.id = effect.cost_layer_adjustment_id where source.worksheet_revision_id = ${credit.revisionId}) as cogs,
        (select count(*)::text from costing.cogs_recognitions where organization_id = ${input.organizationId} and recognition_kind = 'ORIGINAL') as originals
    `.execute(database.db);
    expect(effects.rows[0]).toEqual({
      source: '-50.00000000',
      pending: '-15.00000000',
      cogs: '-15.00000000',
      originals: '1',
    });
    expect(
      Number(effects.rows[0]!.source) -
        Number(effects.rows[0]!.pending) -
        Number(effects.rows[0]!.cogs),
    ).toBeCloseTo(-20, 10);
  });

  it('detects controlled integrity corruption while a healthy finalized fixture remains clean', async () => {
    const input = await receivedShipment();
    const worksheet = await finalizeFreight(input, '100.0000');
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
    const allocation = await sql<{ id: string }>`
      select allocation.id
      from landed_cost.component_allocations allocation
      join landed_cost.cost_components component on component.id = allocation.cost_component_id
      where component.worksheet_revision_id = ${worksheet.revisionId}
      order by allocation.id
      limit 1
    `.execute(database.db);
    await sql`update landed_cost.component_allocations set allocated_amount = allocated_amount + 1 where id = ${allocation.rows[0]!.id}`.execute(
      database.db,
    );
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ALLOCATION_MISMATCH' })]),
    );
  });

  it('detects missing outbound provenance and adjustment-effect corruption without repairing either', async () => {
    const input = await receivedShipment();
    const worksheet = await finalizeFreight(input, '600.0000');
    const flow = await createDispatchedDelivery(input, '3');
    const revision = await createLandedCostRevision(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      worksheetId: worksheet.id,
      kind: 'ADJUSTMENT',
    });
    await addLandedCostComponent(database.db, {
      organizationId: input.organizationId,
      revisionId: revision.revisionId,
      costType: 'CUSTOMS_DUTY',
      scope: 'GLOBAL',
      originalAmount: '100.0000',
      originalCurrencyCode: 'CNY',
      valueStatus: 'ACTUAL',
      allocationMethod: 'QUANTITY',
    });
    await finalizeLandedCostWorksheet(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      revisionId: revision.revisionId,
    });
    const adjustment = await sql<{ id: string }>`
      select id from costing.cost_layer_adjustments where worksheet_revision_id = ${revision.revisionId} order by id limit 1
    `.execute(database.db);
    await sql`update costing.cost_layer_adjustments set delta_total_cost = 1 where id = ${adjustment.rows[0]!.id}`.execute(
      database.db,
    );
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ADJUSTMENT_EFFECT_MISMATCH' })]),
    );
    const assignment = await sql<{ id: string }>`
      select id from costing.outbound_cost_assignments where fulfillment_id = ${flow.dispatched.id}
    `.execute(database.db);
    await sql`delete from costing.outbound_cost_assignment_adjustments where outbound_cost_assignment_line_id in (select id from costing.outbound_cost_assignment_lines where outbound_cost_assignment_id = ${assignment.rows[0]!.id})`.execute(
      database.db,
    );
    await sql`delete from costing.outbound_cost_assignment_lines where outbound_cost_assignment_id = ${assignment.rows[0]!.id}`.execute(
      database.db,
    );
    await sql`delete from costing.outbound_cost_assignments where id = ${assignment.rows[0]!.id}`.execute(
      database.db,
    );
    const issues = await verifyCostingIntegrity(database.db, input.organizationId);
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'OUTBOUND_ASSIGNMENT_MISSING' })]),
    );
  });

  it('keeps every costing and landed-cost service query organization-scoped', async () => {
    const organizationA = await receivedShipment();
    const organizationB = await receivedShipment();
    const worksheet = await createLandedCostWorksheet(database.db, {
      ...organizationA,
      baseCurrencyCode: 'CNY',
    });
    await expect(
      previewLandedCostWorksheet(database.db, {
        organizationId: organizationB.organizationId,
        revisionId: worksheet.revisionId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      addLandedCostComponent(database.db, {
        organizationId: organizationB.organizationId,
        revisionId: worksheet.revisionId,
        costType: 'INTERNATIONAL_FREIGHT',
        scope: 'GLOBAL',
        originalAmount: '100.0000',
        originalCurrencyCode: 'CNY',
        valueStatus: 'ACTUAL',
        allocationMethod: 'QUANTITY',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      finalizeLandedCostWorksheet(database.db, {
        organizationId: organizationB.organizationId,
        actorId: organizationB.actorId,
        revisionId: worksheet.revisionId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      createLandedCostRevision(database.db, {
        organizationId: organizationB.organizationId,
        actorId: organizationB.actorId,
        worksheetId: worksheet.id,
        kind: 'ADJUSTMENT',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await listCostLayers(database.db, organizationB.organizationId)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ location_id: organizationA.locationId })]),
    );
    expect(
      await getInventoryValuation(database.db, { organizationId: organizationB.organizationId }),
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ location_id: organizationA.locationId })]),
    );
    expect(await listOutboundCostAssignments(database.db, organizationB.organizationId)).toEqual(
      [],
    );
  });

  it('surfaces legacy physical inventory without inventing a zero-cost layer', async () => {
    const input = await receivedShipment();
    const issues = await verifyCostingIntegrity(database.db, input.organizationId);
    expect(issues).toEqual([]);
    await sql`delete from costing.cost_layer_positions where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    await sql`delete from costing.cost_layers where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'UNCOSTED_INVENTORY' })]),
    );
  });
});
