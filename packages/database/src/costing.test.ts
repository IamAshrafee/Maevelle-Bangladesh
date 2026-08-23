import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  addLandedCostComponent,
  allocateDeterministically,
  CostingDomainError,
  createLandedCostRevision,
  createLandedCostWorksheet,
  finalizeLandedCostWorksheet,
} from './costing.js';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
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
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status) values (${organization.id}, ${type.rows[0]!.id}, ${`cost-${crypto.randomUUID().slice(0, 8)}`}, 'Cost product', 'ACTIVE', 'UNPUBLISHED') returning id`.execute(
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
  return { organizationId: organization.id, actorId, shipmentId: shipment.id };
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
});
