import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { getInventoryValuation, verifyCostingIntegrity } from './costing.js';
import {
  adjustInventory,
  approveWarehouseTransfer,
  closeWarehouseTransferDiscrepancy,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  listInventoryBalances,
  listInventoryPositions,
  moveInventoryCondition,
  postStocktake,
  recordStocktakeCount,
  receiveWarehouseTransfer,
  startStocktake,
  submitStocktakeForReview,
  verifyInventoryIntegrity,
} from './inventory.js';
import {
  addPurchaseLine,
  cancelPurchase,
  cancelShipment,
  closePurchase,
  createPurchase,
  createShipment,
  createSupplier,
  getInboundReceipt,
  getPurchase,
  getShipment,
  listInboundReceipts,
  listPurchases,
  listShipments,
  listSuppliers,
  markShipmentArrived,
  markShipmentInTransit,
  placePurchase,
  postInboundReceipt,
  removePurchaseLine,
  resolveReceiptLineCondition,
  reverseInboundReceipt,
  updatePurchase,
  updatePurchaseLine,
  updateShipment,
  updateShipmentAllocations,
  updateSupplier,
} from './procurement.js';
import { createOrganization } from './platform.js';
import { createLocation, getTransferDetail } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 16,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `procurement-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Procurement test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  const productType = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, ${`type-${crypto.randomUUID().slice(0, 8)}`}, 'Inbound product') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status) values (${organization.id}, ${productType.rows[0]!.id}, ${`inbound-${crypto.randomUUID().slice(0, 8)}`}, 'Inbound Product', 'ACTIVE', 'UNPUBLISHED') returning id`.execute(
    database.db,
  );
  const skuString = `IN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${skuString}, ${skuString}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `RCV-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Receiving warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING', 'PURCHASE_RECEIVING', 'TRANSFER_SEND'],
  });
  const supplier = await createSupplier(database.db, {
    organizationId: organization.id,
    actorId,
    code: `SUP-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Inbound supplier',
  });
  const purchase = await createPurchase(database.db, {
    organizationId: organization.id,
    actorId,
    supplierId: supplier.id,
    currencyCode: 'CNY',
  });
  const withLine = await addPurchaseLine(database.db, {
    organizationId: organization.id,
    actorId,
    purchaseId: purchase.id,
    variantId: variant.rows[0]!.id,
    quantity: '5',
    unitPrice: '21.5000',
  });
  const placed = await placePurchase(database.db, {
    organizationId: organization.id,
    actorId,
    purchaseId: purchase.id,
    expectedVersion: withLine.version,
  });
  return {
    organizationId: organization.id,
    actorId,
    locationId: location.id,
    variantId: variant.rows[0]!.id,
    purchaseLineId: placed.lines[0]!.id,
    purchaseId: placed.id,
    supplier,
  };
}

async function shipmentFor(input: Awaited<ReturnType<typeof fixture>>, quantity = '5') {
  return createShipment(database.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    receivingLocationId: input.locationId,
    transportMode: 'SEA',
    allocations: [{ purchaseLineId: input.purchaseLineId, quantity }],
  });
}

describe('procurement, shipment allocation, and canonical inbound receiving', () => {
  it('supports supplier setup, draft correction, and controlled cancellation workflows', async () => {
    const input = await fixture();
    const supplier = await updateSupplier(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      expectedVersion: input.supplier.version,
      supplierType: 'MANUFACTURER',
      countryCode: 'CN',
      preferredCurrencyCode: 'CNY',
      leadTimeDays: 18,
      paymentTerms: '30% deposit, 70% before shipment',
    });
    expect(supplier).toMatchObject({
      supplierType: 'MANUFACTURER',
      countryCode: 'CN',
      preferredCurrencyCode: 'CNY',
      leadTimeDays: 18,
    });

    const draft = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: supplier.id,
      currencyCode: 'CNY',
      supplierReference: 'SUP-ORDER-42',
      expectedDate: '2026-09-30',
    });
    const editedDraft = await updatePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      expectedVersion: draft.version,
      supplierId: supplier.id,
      currencyCode: 'CNY',
      supplierReference: 'SUP-ORDER-43',
      orderDate: draft.orderDate,
      expectedDate: '2026-10-02',
      destinationLocationId: input.locationId,
      notes: 'Use reinforced cartons',
    });
    expect(editedDraft).toMatchObject({
      supplierReference: 'SUP-ORDER-43',
      expectedDate: '2026-10-02',
      destinationLocationId: input.locationId,
      notes: 'Use reinforced cartons',
    });
    const withLine = await addPurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      variantId: input.variantId,
      quantity: '3',
      unitPrice: '12.5000',
    });
    await expect(
      updatePurchase(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        purchaseId: draft.id,
        expectedVersion: withLine.version,
        supplierId: supplier.id,
        currencyCode: 'USD',
        orderDate: draft.orderDate,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const corrected = await updatePurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      lineId: withLine.lines[0]!.id,
      quantity: '4',
      unitPrice: '11.7500',
    });
    expect(corrected).toMatchObject({ supplierReference: 'SUP-ORDER-43', totalAmount: '47.0000' });
    const emptyDraft = await removePurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      lineId: corrected.lines[0]!.id,
    });
    const cancelled = await cancelPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      expectedVersion: emptyDraft.version,
      reason: 'Supplier could not fulfill the order',
    });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('records shipment departure and only allows planned shipments to cancel', async () => {
    const input = await fixture();
    const departing = await shipmentFor(input, '1');
    const inTransit = await markShipmentInTransit(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: departing.id,
      expectedVersion: departing.version,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(inTransit.status).toBe('IN_TRANSIT');
    await expect(
      cancelShipment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        shipmentId: inTransit.id,
        expectedVersion: inTransit.version,
        reason: 'Do not erase physical transit',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    const planned = await shipmentFor(input, '1');
    expect(planned.allocations[0]?.unitPrice).toBeDefined();

    const updated = await updateShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: planned.id,
      expectedVersion: planned.version,
      trackingReference: 'TRK-998877',
      originText: 'Shenzhen Yantian Port',
      expectedArrivalDate: '2026-11-15',
      transportMode: 'SEA',
    });
    expect(updated).toMatchObject({
      trackingReference: 'TRK-998877',
      originText: 'Shenzhen Yantian Port',
      expectedArrivalDate: '2026-11-15',
      transportMode: 'SEA',
      version: planned.version + 1,
    });

    const cancelled = await cancelShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: updated.id,
      expectedVersion: updated.version,
      reason: 'Shipment booking was duplicated',
    });
    expect(cancelled.status).toBe('CANCELLED');

    await expect(
      updateShipment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        shipmentId: cancelled.id,
        expectedVersion: cancelled.version,
        trackingReference: 'CANNOT-UPDATE-CANCELLED',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('serializes purchase-line allocation and keeps shipment arrival separate from physical inventory', async () => {
    const input = await fixture();
    const results = await Promise.allSettled([shipmentFor(input, '5'), shipmentFor(input, '5')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((result) => result.status === 'fulfilled');
    if (winner?.status !== 'fulfilled') throw new Error('Expected a shipment allocation winner.');
    const before = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    });
    expect(before.items).toEqual([]);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: winner.value.id,
      expectedVersion: winner.value.version,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(arrived.status).toBe('ARRIVED');
    const incoming = await listInventoryPositions(database.db, input.organizationId, {
      locationId: input.locationId,
    });
    expect(incoming.items).toHaveLength(1);
    expect(incoming.items[0]).toMatchObject({
      variantId: input.variantId,
      locationId: input.locationId,
      onHand: '0',
      availableToSell: '0',
      incomingSupply: '5',
    });
    expect(
      await listInventoryBalances(database.db, input.organizationId, {
        locationId: input.locationId,
      }),
    ).toEqual({ items: [], totalCount: 0 });
  });

  it('posts partial condition-aware receipts atomically and prevents over-receipt', async () => {
    const input = await fixture();
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const allocation = arrived.allocations[0]!;
    const receipt = await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: arrived.id,
      lines: [
        { shipmentAllocationId: allocation.id, condition: 'SELLABLE', quantity: '2' },
        { shipmentAllocationId: allocation.id, condition: 'DAMAGED', quantity: '1' },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(receipt.status).toBe('POSTED');
    const { items: balances } = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    });
    expect(balances.map((balance) => [balance.condition, balance.onHand])).toEqual([
      ['DAMAGED', '1'],
      ['SELLABLE', '2'],
    ]);
    const updated = await getShipment(database.db, {
      organizationId: input.organizationId,
      shipmentId: shipment.id,
    });
    expect(updated.receivingStatus).toBe('PARTIALLY_RECEIVED');
    const historicalEvidence = await sql<{ audit: string; outbox: string }>`
      select
        (select count(*)::text from audit.audit_events where organization_id = ${input.organizationId} and action = 'receiving.inbound_receipt.posted') as audit,
        (select count(*)::text from platform.outbox_events where organization_id = ${input.organizationId} and event_type = 'receiving.inbound_receipt.posted') as outbox
    `.execute(database.db);
    expect(historicalEvidence.rows[0]).toEqual({ audit: '1', outbox: '1' });
    await expect(
      postInboundReceipt(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        shipmentId: shipment.id,
        lines: [{ shipmentAllocationId: allocation.id, condition: 'SELLABLE', quantity: '3' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'OVER_RECEIPT' });
  });

  it('keeps acquired cost provenance aligned through condition moves and shrinkage', async () => {
    const input = await fixture();
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '5',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });

    await moveInventoryCondition(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      variantId: input.variantId,
      locationId: input.locationId,
      fromCondition: 'SELLABLE',
      toCondition: 'DAMAGED',
      quantity: '1',
      reason: 'Damaged during inspection',
      idempotencyKey: crypto.randomUUID(),
    });
    await adjustInventory(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      variantId: input.variantId,
      locationId: input.locationId,
      condition: 'SELLABLE',
      quantityDelta: '-1',
      reasonCode: 'CORRECTION',
      note: 'Counted one unit short',
      idempotencyKey: crypto.randomUUID(),
    });
    const item = await sql<{
      id: string;
    }>`select id from inventory.inventory_items where organization_id = ${input.organizationId} and variant_id = ${input.variantId}`.execute(
      database.db,
    );
    const stocktake = await startStocktake(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      locationId: input.locationId,
    });
    await recordStocktakeCount(database.db, {
      organizationId: input.organizationId,
      stocktakeId: stocktake.stocktakeId,
      inventoryItemId: item.rows[0]!.id,
      countedQuantity: '3',
      countedQuantitiesByCondition: { SELLABLE: '2', DAMAGED: '1' },
      expectedVersion: stocktake.version,
    });
    await submitStocktakeForReview(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      stocktakeId: stocktake.stocktakeId,
      expectedVersion: stocktake.version + 1,
    });
    await postStocktake(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      stocktakeId: stocktake.stocktakeId,
      idempotencyKey: crypto.randomUUID(),
    });

    const valuation = await getInventoryValuation(database.db, {
      organizationId: input.organizationId,
      locationId: input.locationId,
    });
    expect(valuation.map((row) => [row.condition_code, row.quantity])).toEqual([
      ['DAMAGED', '1.000000'],
      ['SELLABLE', '2.000000'],
    ]);
    const costMovements = await sql<{
      kind: string;
      quantity: string;
    }>`select movement_kind as kind, sum(quantity)::text as quantity from costing.inventory_cost_position_movements where organization_id = ${input.organizationId} group by movement_kind order by movement_kind`.execute(
      database.db,
    );
    expect(costMovements.rows).toEqual([
      { kind: 'CONDITION_MOVE', quantity: '1.000000' },
      { kind: 'WRITE_OFF', quantity: '2.000000' },
    ]);
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
  });

  it('reclassifies stocktake condition variance without writing off acquired cost', async () => {
    const input = await fixture();
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '5',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });

    const item = await sql<{
      id: string;
    }>`select id from inventory.inventory_items where organization_id = ${input.organizationId} and variant_id = ${input.variantId}`.execute(
      database.db,
    );
    const stocktake = await startStocktake(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      locationId: input.locationId,
    });
    await recordStocktakeCount(database.db, {
      organizationId: input.organizationId,
      stocktakeId: stocktake.stocktakeId,
      inventoryItemId: item.rows[0]!.id,
      countedQuantity: '5',
      countedQuantitiesByCondition: { SELLABLE: '4', DAMAGED: '1' },
      expectedVersion: stocktake.version,
    });
    await submitStocktakeForReview(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      stocktakeId: stocktake.stocktakeId,
      expectedVersion: stocktake.version + 1,
    });
    await postStocktake(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      stocktakeId: stocktake.stocktakeId,
      idempotencyKey: crypto.randomUUID(),
    });

    const valuation = await getInventoryValuation(database.db, {
      organizationId: input.organizationId,
      locationId: input.locationId,
    });
    expect(valuation.map((row) => [row.condition_code, row.quantity])).toEqual([
      ['DAMAGED', '1.000000'],
      ['SELLABLE', '4.000000'],
    ]);
    const costMovements = await sql<{
      kind: string;
      quantity: string;
    }>`select movement_kind as kind, sum(quantity)::text as quantity from costing.inventory_cost_position_movements where organization_id = ${input.organizationId} group by movement_kind order by movement_kind`.execute(
      database.db,
    );
    expect(costMovements.rows).toEqual([{ kind: 'CONDITION_MOVE', quantity: '1.000000' }]);
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
  });

  it('moves acquired cost provenance with a warehouse transfer', async () => {
    const input = await fixture();
    const destination = await createLocation(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `DST-${crypto.randomUUID().slice(0, 5)}`,
      name: 'Destination warehouse',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING', 'TRANSFER_RECEIVE'],
    });
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '5',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    const transfer = await createWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      sourceLocationId: input.locationId,
      destinationLocationId: destination.id,
      lines: [{ variantId: input.variantId, quantity: '2' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await approveWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      expectedVersion: transfer.version,
    });
    await dispatchWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      idempotencyKey: crypto.randomUUID(),
    });
    const transferLine = await sql<{
      id: string;
    }>`select id from warehouse.transfer_lines where transfer_id = ${transfer.transferId}`.execute(
      database.db,
    );
    await receiveWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      lines: [{ transferLineId: transferLine.rows[0]!.id, sellableQuantity: '2' }],
      idempotencyKey: crypto.randomUUID(),
    });

    const valuation = await getInventoryValuation(database.db, {
      organizationId: input.organizationId,
    });
    expect(valuation.map((row) => [row.location_id, row.condition_code, row.quantity])).toEqual([
      [input.locationId, 'SELLABLE', '3.000000'],
      [destination.id, 'SELLABLE', '2.000000'],
    ]);
    const transferEvidence = await sql<{
      dispatched: string;
      received: string;
    }>`select sum(dispatched_quantity)::text as dispatched, sum(received_quantity)::text as received from costing.transfer_cost_allocations where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(transferEvidence.rows[0]).toEqual({ dispatched: '2.000000', received: '2.000000' });
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
  });

  it('closes a confirmed transfer shortage without leaving stock or cost in transit', async () => {
    const input = await fixture();
    const destination = await createLocation(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `DST-${crypto.randomUUID().slice(0, 5)}`,
      name: 'Shortage destination',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING', 'TRANSFER_RECEIVE'],
    });
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '5',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    const transfer = await createWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      sourceLocationId: input.locationId,
      destinationLocationId: destination.id,
      lines: [{ variantId: input.variantId, quantity: '3' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await approveWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      expectedVersion: transfer.version,
    });
    await dispatchWarehouseTransfer(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      idempotencyKey: crypto.randomUUID(),
    });
    const transferLine = await sql<{
      id: string;
    }>`select id from warehouse.transfer_lines where transfer_id = ${transfer.transferId}`.execute(
      database.db,
    );
    const discrepancyInput = {
      organizationId: input.organizationId,
      actorId: input.actorId,
      transferId: transfer.transferId,
      lines: [
        {
          transferLineId: transferLine.rows[0]!.id,
          dispositionCode: 'MISSING' as const,
          quantity: '3',
          reasonCode: 'CARRIER_SHORTAGE',
          notes: 'Confirmed at destination handover.',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    };
    const closed = await closeWarehouseTransferDiscrepancy(database.db, discrepancyInput);
    await expect(closeWarehouseTransferDiscrepancy(database.db, discrepancyInput)).resolves.toEqual(
      closed,
    );
    expect(closed.status).toBe('CLOSED_WITH_DISCREPANCY');
    await expect(
      receiveWarehouseTransfer(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        transferId: transfer.transferId,
        lines: [{ transferLineId: transferLine.rows[0]!.id, sellableQuantity: '1' }],
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      await getTransferDetail(database.db, input.organizationId, transfer.transferId),
    ).toMatchObject({
      status: 'CLOSED_WITH_DISCREPANCY',
      lines: [
        expect.objectContaining({
          discrepancy: expect.objectContaining({
            dispositionCode: 'MISSING',
            quantity: '3.000000',
            reasonCode: 'CARRIER_SHORTAGE',
          }),
        }),
      ],
    });
    const transferEvidence = await sql<{
      dispatched: string;
      received: string;
      written_off: string;
    }>`select sum(dispatched_quantity)::text as dispatched, sum(received_quantity)::text as received, sum(written_off_quantity)::text as written_off from costing.transfer_cost_allocations where organization_id = ${input.organizationId}`.execute(
      database.db,
    );
    expect(transferEvidence.rows[0]).toEqual({
      dispatched: '3.000000',
      received: '0.000000',
      written_off: '3.000000',
    });
    expect(await verifyInventoryIntegrity(database.db, input.organizationId)).toEqual([]);
    expect(await verifyCostingIntegrity(database.db, input.organizationId)).toEqual([]);
  });

  it('allows one shipment to consolidate allocated lines from separate suppliers in one currency', async () => {
    const input = await fixture();
    const secondSupplier = await createSupplier(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `SUP-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Second supplier',
    });
    const secondPurchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: secondSupplier.id,
      currencyCode: 'CNY',
    });
    const withLine = await addPurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: secondPurchase.id,
      variantId: input.variantId,
      quantity: '2',
      unitPrice: '5',
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: secondPurchase.id,
      expectedVersion: withLine.version,
    });
    const shipment = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'SEA',
      allocations: [
        { purchaseLineId: input.purchaseLineId, quantity: '1' },
        { purchaseLineId: placed.lines[0]!.id, quantity: '2' },
      ],
    });
    expect(shipment.allocations.map((allocation) => allocation.supplierName)).toEqual(
      expect.arrayContaining(['Inbound supplier', 'Second supplier']),
    );
  });

  it('rejects a mixed-currency shipment before an uncostable state can be created', async () => {
    const input = await fixture();
    const supplier = await createSupplier(database.db, {
      organizationId: input.organizationId, actorId: input.actorId, code: `SUP-${crypto.randomUUID().slice(0, 6)}`, name: 'USD supplier',
    });
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId, actorId: input.actorId, supplierId: supplier.id, currencyCode: 'USD',
    });
    const line = await addPurchaseLine(database.db, {
      organizationId: input.organizationId, actorId: input.actorId, purchaseId: purchase.id, variantId: input.variantId, quantity: '1', unitPrice: '5',
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId, actorId: input.actorId, purchaseId: purchase.id, expectedVersion: line.version,
    });
    await expect(createShipment(database.db, {
      organizationId: input.organizationId, actorId: input.actorId, receivingLocationId: input.locationId, transportMode: 'SEA',
      allocations: [{ purchaseLineId: input.purchaseLineId, quantity: '1' }, { purchaseLineId: placed.lines[0]!.id, quantity: '1' }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('makes concurrent receipt retry canonical and rolls all receipt effects back on a late fault', async () => {
    const input = await fixture();
    const shipment = await shipmentFor(input);
    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const key = crypto.randomUUID();
    const command = () =>
      postInboundReceipt(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        shipmentId: arrived.id,
        lines: [
          {
            shipmentAllocationId: arrived.allocations[0]!.id,
            condition: 'SELLABLE',
            quantity: '1',
          },
        ],
        idempotencyKey: key,
      });
    const [first, retry] = await Promise.all([command(), command()]);
    expect(first.id).toBe(retry.id);
    const transactions = await sql<{
      count: string;
    }>`select count(*)::text as count from inventory.inventory_transactions where organization_id = ${input.organizationId} and transaction_type = 'INBOUND_RECEIPT'`.execute(
      database.db,
    );
    expect(transactions.rows[0]!.count).toBe('1');

    const second = await fixture();
    const secondShipment = await shipmentFor(second);
    const secondArrived = await markShipmentArrived(database.db, {
      organizationId: second.organizationId,
      actorId: second.actorId,
      shipmentId: secondShipment.id,
      expectedVersion: secondShipment.version,
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      postInboundReceipt(database.db, {
        organizationId: second.organizationId,
        actorId: second.actorId,
        shipmentId: secondArrived.id,
        lines: [
          {
            shipmentAllocationId: secondArrived.allocations[0]!.id,
            condition: 'SELLABLE',
            quantity: '1',
          },
        ],
        idempotencyKey: crypto.randomUUID(),
        fault: () => {
          throw new Error('Injected receipt failure.');
        },
      }),
    ).rejects.toThrow('Injected receipt failure.');
    expect(
      await listInventoryBalances(database.db, second.organizationId, {
        locationId: second.locationId,
      }).then((res) => res.items),
    ).toEqual([]);
  });

  it('does not allow cross-organization receipt access or a receiving-ineligible location', async () => {
    const input = await fixture();
    const other = await fixture();
    const shipment = await shipmentFor(input);
    await expect(
      getShipment(database.db, { organizationId: other.organizationId, shipmentId: shipment.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await listInventoryPositions(database.db, other.organizationId)).toEqual({
      items: [],
      totalCount: 0,
    });
    const plainLocation = await createLocation(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `NO-RCV-${crypto.randomUUID().slice(0, 5)}`,
      name: 'No receiving capability',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING'],
    });
    await expect(
      createShipment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        receivingLocationId: plainLocation.id,
        transportMode: 'SEA',
        allocations: [{ purchaseLineId: input.purchaseLineId, quantity: '1' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('atomically creates a purchase with initial lines and validates dates and locations', async () => {
    const input = await fixture();

    // 1. Rejects expected date earlier than order date
    await expect(
      createPurchase(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        supplierId: input.supplier.id,
        currencyCode: 'CNY',
        orderDate: '2026-09-22',
        expectedDate: '2026-09-20',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    // 2. Rejects inactive or non-existent destination location
    await expect(
      createPurchase(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        supplierId: input.supplier.id,
        currencyCode: 'CNY',
        destinationLocationId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // 3. Atomically creates purchase with lines
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'CNY',
      orderDate: '2026-09-22',
      expectedDate: '2026-10-05',
      destinationLocationId: input.locationId,
      lines: [
        { variantId: input.variantId, quantity: '5', unitPrice: '12.50' },
      ],
    });

    expect(purchase.status).toBe('DRAFT');
    expect(purchase.lines).toHaveLength(1);
    expect(purchase.lines[0]?.quantity).toBe('5.000000');
    expect(purchase.lines[0]?.unitPrice).toBe('12.5000');
    expect(purchase.totalAmount).toBe('62.5000');
    expect(purchase.destinationLocationId).toBe(input.locationId);
  });

  it('closes a placed purchase order and prevents further shipment allocations', async () => {
    const input = await fixture();
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'BDT',
      lines: [{ variantId: input.variantId, quantity: '10', unitPrice: '100' }],
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: purchase.version,
    });

    const closed = await closePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: placed.version,
      reason: 'Operations completed and verified.',
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeTruthy();
    expect(closed.closedByActorId).toBe(input.actorId);

    // Attempting to allocate shipment against closed PO fails
    await expect(
      createShipment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        receivingLocationId: input.locationId,
        transportMode: 'ROAD',
        allocations: [{ purchaseLineId: closed.lines[0]!.id, quantity: '5' }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('releases allocated quantity when a planned shipment is cancelled', async () => {
    const input = await fixture();
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'BDT',
      lines: [{ variantId: input.variantId, quantity: '10', unitPrice: '50' }],
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: purchase.version,
    });

    const lineId = placed.lines[0]!.id;

    // Allocate all 10 units to shipment 1
    const shipment1 = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'ROAD',
      allocations: [{ purchaseLineId: lineId, quantity: '10' }],
    });

    // Verify 10 units are allocated
    const poAfterAlloc = await getPurchase(database.db, {
      organizationId: input.organizationId,
      purchaseId: purchase.id,
    });
    expect(Number(poAfterAlloc.lines[0]!.allocatedQuantity)).toBe(10);

    // Cannot allocate more
    await expect(
      createShipment(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        receivingLocationId: input.locationId,
        transportMode: 'ROAD',
        allocations: [{ purchaseLineId: lineId, quantity: '1' }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Cancel shipment 1
    await cancelShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment1.id,
      expectedVersion: shipment1.version,
      reason: 'Carrier cancelled pickup',
    });

    // Check purchase line has allocatedQuantity back to 0
    const poAfterCancel = await getPurchase(database.db, {
      organizationId: input.organizationId,
      purchaseId: purchase.id,
    });
    expect(Number(poAfterCancel.lines[0]!.allocatedQuantity)).toBe(0);

    // Now we can successfully create shipment 2 with 10 units
    const shipment2 = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'ROAD',
      allocations: [{ purchaseLineId: lineId, quantity: '10' }],
    });
    expect(shipment2.allocations).toHaveLength(1);
    expect(Number(shipment2.allocations[0]!.allocatedQuantity)).toBe(10);
  });

  it('updates shipment allocations and prevents over-allocation', async () => {
    const input = await fixture();
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'BDT',
      lines: [{ variantId: input.variantId, quantity: '10', unitPrice: '50' }],
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: purchase.version,
    });
    const lineId = placed.lines[0]!.id;

    const shipment = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'ROAD',
      allocations: [{ purchaseLineId: lineId, quantity: '4' }],
    });

    // Update allocations from 4 to 7
    const updated = await updateShipmentAllocations(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      allocations: [{ purchaseLineId: lineId, quantity: '7' }],
    });
    expect(Number(updated.allocations[0]!.allocatedQuantity)).toBe(7);

    // Over-allocating beyond 10 throws CONFLICT
    await expect(
      updateShipmentAllocations(database.db, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        shipmentId: shipment.id,
        expectedVersion: updated.version,
        allocations: [{ purchaseLineId: lineId, quantity: '15' }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('posts an inbound receipt and resolves line conditions into sellable stock', async () => {
    const input = await fixture();
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'BDT',
      lines: [{ variantId: input.variantId, quantity: '20', unitPrice: '75' }],
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: purchase.version,
    });
    const lineId = placed.lines[0]!.id;

    const shipment = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'AIR',
      allocations: [{ purchaseLineId: lineId, quantity: '20' }],
    });

    const inTransit = await markShipmentInTransit(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });

    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: inTransit.version,
      idempotencyKey: crypto.randomUUID(),
    });

    // 1. Post receipt with 10 INSPECTION and 10 SELLABLE
    const receipt = await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: arrived.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '10',
        },
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'INSPECTION',
          quantity: '10',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(receipt.status).toBe('POSTED');
    expect(receipt.receiptNumber).toMatch(/^RCV-\d{4}-\d{6}$/);

    // Check inventory balances
    const balances = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    }).then((res) => res.items);
    const sellableBalance = balances.find((b) => b.condition === 'SELLABLE');
    const inspectionBalance = balances.find((b) => b.condition === 'INSPECTION');
    expect(Number(sellableBalance?.onHand)).toBe(10);
    expect(Number(inspectionBalance?.onHand)).toBe(10);

    // 2. Resolve 6 units of INSPECTION to SELLABLE
    const inspectionLine = receipt.lines.find((l) => l.condition === 'INSPECTION')!;
    const afterResolve = await resolveReceiptLineCondition(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId: receipt.id,
      lineId: inspectionLine.id,
      targetCondition: 'SELLABLE',
      quantity: '6',
      reason: 'Passed initial laboratory testing',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(afterResolve.receipt.status).toBe('POSTED');
    expect(afterResolve.receipt.lines).toHaveLength(2);

    const balancesAfterResolve = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    }).then((res) => res.items);
    expect(Number(balancesAfterResolve.find((b) => b.condition === 'SELLABLE')?.onHand)).toBe(16);
    expect(Number(balancesAfterResolve.find((b) => b.condition === 'INSPECTION')?.onHand)).toBe(4);
  });

  it('reverses an inbound receipt with complete inventory and shipment rollback', async () => {
    const input = await fixture();
    const purchase = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: input.supplier.id,
      currencyCode: 'BDT',
      lines: [{ variantId: input.variantId, quantity: '15', unitPrice: '80' }],
    });
    const placed = await placePurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: purchase.id,
      expectedVersion: purchase.version,
    });
    const lineId = placed.lines[0]!.id;

    const shipment = await createShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receivingLocationId: input.locationId,
      transportMode: 'ROAD',
      allocations: [{ purchaseLineId: lineId, quantity: '15' }],
    });

    const inTransit = await markShipmentInTransit(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      idempotencyKey: crypto.randomUUID(),
    });

    const arrived = await markShipmentArrived(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: shipment.id,
      expectedVersion: inTransit.version,
      idempotencyKey: crypto.randomUUID(),
    });

    const receipt = await postInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: arrived.id,
      lines: [
        {
          shipmentAllocationId: arrived.allocations[0]!.id,
          condition: 'SELLABLE',
          quantity: '15',
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(receipt.status).toBe('POSTED');

    const balancesBefore = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    }).then((res) => res.items);
    expect(Number(balancesBefore.find((b) => b.condition === 'SELLABLE')?.onHand)).toBe(15);

    // Reverse receipt
    const reversed = await reverseInboundReceipt(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId: receipt.id,
      reason: 'Physical inspection failed entire batch upon secondary check',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(reversed.status).toBe('REVERSED');
    expect(reversed.reversedAt).toBeTruthy();
    expect(reversed.reversalReason).toBe('Physical inspection failed entire batch upon secondary check');

    // Inventory balances are rolled back to zero
    const balancesAfterReversal = await listInventoryBalances(database.db, input.organizationId, {
      locationId: input.locationId,
    }).then((res) => res.items);
    expect(Number(balancesAfterReversal.find((b) => b.condition === 'SELLABLE')?.onHand ?? 0)).toBe(0);

    // Shipment receivingStatus is recalculated back to NOT_RECEIVED
    const shipmentAfterReversal = await getShipment(database.db, {
      organizationId: input.organizationId,
      shipmentId: arrived.id,
    });
    expect(shipmentAfterReversal.receivingStatus).toBe('NOT_RECEIVED');
    expect(Number(shipmentAfterReversal.allocations[0]!.receivedQuantity)).toBe(0);
  });

  it('performs SQL-level pagination and search for suppliers, purchases, shipments, and receipts', async () => {
    const input = await fixture();

    // 1. Create suppliers with distinct searchable names
    const s1 = await createSupplier(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `SUP-SRC-1`,
      name: 'Alpha Loom Mills',
      countryCode: 'BD',
    });
    const s2 = await createSupplier(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      code: `SUP-SRC-2`,
      name: 'Beta Cotton Works',
      countryCode: 'BD',
    });

    // Search by name
    const searchAlpha = await listSuppliers(database.db, input.organizationId, { search: 'Alpha' });
    expect(searchAlpha.items).toHaveLength(1);
    expect(searchAlpha.items[0]!.name).toBe('Alpha Loom Mills');

    // Pagination
    const page1 = await listSuppliers(database.db, input.organizationId, { page: 1, pageSize: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.pagination.totalItems).toBeGreaterThanOrEqual(2);

    // 2. Purchases pagination & search
    const po1 = await createPurchase(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      supplierId: s1.id,
      currencyCode: 'BDT',
      supplierReference: 'REF-ALPHA-99',
    });

    const searchPo = await listPurchases(database.db, input.organizationId, { search: 'REF-ALPHA-99' });
    expect(searchPo.items).toHaveLength(1);
    expect(searchPo.items[0]!.id).toBe(po1.id);
  });
});
