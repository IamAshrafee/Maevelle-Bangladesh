import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  adjustInventory,
  approveWarehouseTransfer,
  cancelWarehouseTransfer,
  createInventoryReservation,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  listInventoryBalances,
  moveInventoryCondition,
  postStocktake,
  recordStocktakeCount,
  reconcileInventoryItem,
  releaseInventoryReservation,
  startStocktake,
} from './inventory.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `inventory-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Inventory test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  const productType = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, 'hat', 'Hat') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title) values (${organization.id}, ${productType.rows[0]!.id}, ${`hat-${crypto.randomUUID().slice(0, 10)}`}, 'Test Hat') returning id`.execute(
    database.db,
  );
  const axis = await sql<{
    id: string;
  }>`insert into catalog.product_option_axes (organization_id, product_id, code, name) values (${organization.id}, ${product.rows[0]!.id}, 'size', 'Size') returning id`.execute(
    database.db,
  );
  const value = await sql<{
    id: string;
  }>`insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value) values (${organization.id}, ${axis.rows[0]!.id}, 'm', 'M') returning id`.execute(
    database.db,
  );
  const skuString = `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${skuString}, ${skuString}, ${value.rows[0]!.id}) returning id`.execute(
    database.db,
  );
  const actorId = crypto.randomUUID();
  const main = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `MAIN-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Main',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
  });
  const secondary = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `MIR-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Mirpur',
    locationType: 'SHOWROOM',
    capabilities: ['STOCK_HOLDING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
  });
  return {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    main,
    secondary,
  };
}

async function opening(f: Awaited<ReturnType<typeof fixture>>, quantity: string) {
  return adjustInventory(database.db, {
    organizationId: f.organizationId,
    actorId: f.actorId,
    variantId: f.variantId,
    locationId: f.main.id,
    condition: 'SELLABLE',
    quantityDelta: quantity,
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
}

describe('ledger-backed inventory', () => {
  it('maintains condition balances, ATS, immutable ledger evidence, audit and outbox in one adjustment', async () => {
    const f = await fixture();
    const adjustment = await opening(f, '10');
    await moveInventoryCondition(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      fromCondition: 'SELLABLE',
      toCondition: 'DAMAGED',
      quantity: '2',
      idempotencyKey: crypto.randomUUID(),
    });
    const balances = await listInventoryBalances(database.db, f.organizationId);
    expect(balances.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ condition: 'SELLABLE', onHand: '8', availableToSell: '8' }),
        expect.objectContaining({ condition: 'DAMAGED', onHand: '2', availableToSell: '0' }),
      ]),
    );
    const evidence = await sql<{
      audit: string;
      outbox: string;
    }>`select (select count(*)::text from audit.audit_events where target_id = ${adjustment.transactionId}) as audit, (select count(*)::text from platform.outbox_events where aggregate_id = ${adjustment.transactionId}) as outbox`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({ audit: '1', outbox: '1' });
  });

  it('allows only one concurrent final-unit reservation and prevents cross-organization inventory access', async () => {
    const f = await fixture();
    await opening(f, '1');
    const results = await Promise.allSettled([
      createInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        quantity: '1',
        sourceType: 'TEST',
        sourceReference: `a-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      }),
      createInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        quantity: '1',
        sourceType: 'TEST',
        sourceReference: `b-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const balance = (await listInventoryBalances(database.db, f.organizationId)).items.find(
      (row) => row.condition === 'SELLABLE',
    )!;
    expect(balance).toMatchObject({ onHand: '1', reserved: '1', availableToSell: '0' });
    const other = await createOrganization(database.db, {
      code: `other-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    await expect(
      adjustInventory(database.db, {
        organizationId: other.id,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        condition: 'SELLABLE',
        quantityDelta: '1',
        reasonCode: 'OTHER',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('scopes reservation, transfer, and stocktake commands to their organization without disclosing another tenant', async () => {
    const f = await fixture();
    const other = await createOrganization(database.db, {
      code: `isolated-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Isolated inventory test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    await expect(
      createInventoryReservation(database.db, {
        organizationId: other.id,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        quantity: '1',
        sourceType: 'TEST',
        sourceReference: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createWarehouseTransfer(database.db, {
        organizationId: other.id,
        actorId: f.actorId,
        sourceLocationId: f.main.id,
        destinationLocationId: f.secondary.id,
        lines: [{ variantId: f.variantId, quantity: '1' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      startStocktake(database.db, {
        organizationId: other.id,
        actorId: f.actorId,
        locationId: f.main.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('replays idempotent adjustments and releases a reservation exactly once', async () => {
    const f = await fixture();
    const key = crypto.randomUUID();
    const first = await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      condition: 'SELLABLE',
      quantityDelta: '4',
      reasonCode: 'OPENING_BALANCE',
      idempotencyKey: key,
    });
    const retry = await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      condition: 'SELLABLE',
      quantityDelta: '4',
      reasonCode: 'OPENING_BALANCE',
      idempotencyKey: key,
    });
    expect(retry).toEqual(first);
    const reservation = await createInventoryReservation(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      quantity: '2',
      sourceType: 'TEST',
      sourceReference: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    });
    const released = await Promise.all([
      releaseInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        reservationId: reservation.reservationId,
        idempotencyKey: crypto.randomUUID(),
      }),
      releaseInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        reservationId: reservation.reservationId,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(released.filter((result) => result.released)).toHaveLength(1);
    const balance = (await listInventoryBalances(database.db, f.organizationId)).items.find(
      (row) => row.condition === 'SELLABLE',
    )!;
    expect(balance).toMatchObject({ onHand: '4', reserved: '0', availableToSell: '4' });
  });

  it('serializes competing transfer dispatches and keeps ledger/balance reconciliation intact', async () => {
    const f = await fixture();
    const openingTransaction = await opening(f, '3');
    const makeTransfer = async () => {
      const transfer = await createWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        sourceLocationId: f.main.id,
        destinationLocationId: f.secondary.id,
        lines: [{ variantId: f.variantId, quantity: '2' }],
      });
      await approveWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        transferId: transfer.transferId,
        expectedVersion: transfer.version,
      });
      return transfer.transferId;
    };
    const [a, b] = await Promise.all([makeTransfer(), makeTransfer()]);
    const dispatched = await Promise.allSettled([
      dispatchWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        transferId: a,
        idempotencyKey: crypto.randomUUID(),
      }),
      dispatchWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        transferId: b,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(dispatched.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const reconciliation = await reconcileInventoryItem(
      database.db,
      f.organizationId,
      openingTransaction.inventoryItemId,
      f.main.id,
    );
    expect(reconciliation).toEqual({ matches: true, ledgerQuantity: '1', balanceQuantity: '1' });
  });

  it('allows cancellation only while a transfer is a current Draft', async () => {
    const f = await fixture();
    const transfer = await createWarehouseTransfer(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      sourceLocationId: f.main.id,
      destinationLocationId: f.secondary.id,
      lines: [{ variantId: f.variantId, quantity: '1' }],
    });
    await expect(
      cancelWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        transferId: transfer.transferId,
        expectedVersion: transfer.version,
      }),
    ).resolves.toMatchObject({ transferId: transfer.transferId, version: 2 });
    await expect(
      cancelWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        transferId: transfer.transferId,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });
  it('posts a stocktake discrepancy at most once', async () => {
    const f = await fixture();
    const opened = await opening(f, '5');
    const stocktake = await startStocktake(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      locationId: f.main.id,
    });
    await recordStocktakeCount(database.db, {
      organizationId: f.organizationId,
      stocktakeId: stocktake.stocktakeId,
      inventoryItemId: opened.inventoryItemId,
      countedQuantity: '4',
      expectedVersion: stocktake.version,
    });
    const results = await Promise.allSettled([
      postStocktake(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        stocktakeId: stocktake.stocktakeId,
        idempotencyKey: crypto.randomUUID(),
      }),
      postStocktake(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        stocktakeId: stocktake.stocktakeId,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const balance = (await listInventoryBalances(database.db, f.organizationId)).items.find(
      (row) => row.condition === 'SELLABLE',
    )!;
    expect(balance.onHand).toBe('4');
  });
});
