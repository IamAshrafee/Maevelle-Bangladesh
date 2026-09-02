import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { listInventoryBalances } from './inventory.js';
import {
  addPurchaseLine,
  cancelPurchase,
  cancelShipment,
  createPurchase,
  createShipment,
  createSupplier,
  getShipment,
  markShipmentArrived,
  markShipmentInTransit,
  placePurchase,
  postInboundReceipt,
  removePurchaseLine,
  updatePurchaseLine,
  updateSupplier,
} from './procurement.js';
import { createOrganization } from './platform.js';
import { createLocation } from './warehouse.js';

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
    capabilities: ['STOCK_HOLDING', 'PURCHASE_RECEIVING'],
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
    const withLine = await addPurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      variantId: input.variantId,
      quantity: '3',
      unitPrice: '12.5000',
    });
    const corrected = await updatePurchaseLine(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      purchaseId: draft.id,
      lineId: withLine.lines[0]!.id,
      quantity: '4',
      unitPrice: '11.7500',
    });
    expect(corrected).toMatchObject({ supplierReference: 'SUP-ORDER-42', totalAmount: '47.0000' });
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
    const cancelled = await cancelShipment(database.db, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      shipmentId: planned.id,
      expectedVersion: planned.version,
      reason: 'Shipment booking was duplicated',
    });
    expect(cancelled.status).toBe('CANCELLED');
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

  it('allows one shipment to consolidate allocated lines from separate suppliers', async () => {
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
      currencyCode: 'USD',
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
      }).then(res => res.items),
    ).toEqual([]);
  });

  it('does not allow cross-organization receipt access or a receiving-ineligible location', async () => {
    const input = await fixture();
    const other = await fixture();
    const shipment = await shipmentFor(input);
    await expect(
      getShipment(database.db, { organizationId: other.organizationId, shipmentId: shipment.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
});
