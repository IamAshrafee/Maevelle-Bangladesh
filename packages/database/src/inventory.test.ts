import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import { archiveCatalogProduct, restoreCatalogProduct } from './catalog.js';
import {
  adjustInventory,
  approveWarehouseTransfer,
  cancelWarehouseTransfer,
  createInventoryReservation,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  expireInventoryReservations,
  getInventoryStats,
  getInventoryItemDetail,
  listInventoryBalances,
  listInventoryHistory,
  listInventoryPositions,
  listInventoryReservations,
  moveInventoryCondition,
  postStocktake,
  recordStocktakeCount,
  reconcileInventoryItem,
  releaseInventoryReservation,
  startStocktake,
  verifyInventoryIntegrity,
} from './inventory.js';
import { createLocation, getLocationDetail, listWarehouseTransfers } from './warehouse.js';

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
  const actorId = crypto.randomUUID();
  const actorEmail = `inventory-${actorId}@example.test`;
  await sql`insert into iam.users (id, name, email, email_normalized) values (${actorId}, 'Inventory Operator', ${actorEmail}, ${actorEmail})`.execute(
    database.db,
  );
  await sql`insert into iam.organization_memberships (organization_id, user_id, membership_type, status, display_name) values (${organization.id}, ${actorId}, 'STANDARD', 'ACTIVE', 'Inventory Operator')`.execute(
    database.db,
  );
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
    productId: product.rows[0]!.id,
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
    expect(await getInventoryStats(database.db, f.organizationId)).toMatchObject({
      totalOnHand: '10',
      totalUnavailable: '2',
      totalDamaged: '2',
    });
    const unvalued = await sql<{
      quantity: string;
      reason_code: string;
    }>`select quantity::text, reason_code from costing.unvalued_inventory_additions where inventory_transaction_id = ${adjustment.transactionId}`.execute(
      database.db,
    );
    expect(unvalued.rows[0]).toEqual({ quantity: '10.000000', reason_code: 'OPENING_BALANCE' });
    const evidence = await sql<{
      audit: string;
      outbox: string;
    }>`select (select count(*)::text from audit.audit_events where target_id = ${adjustment.transactionId}) as audit, (select count(*)::text from platform.outbox_events where aggregate_id = ${adjustment.transactionId}) as outbox`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({ audit: '1', outbox: '1' });
    await expect(
      sql`update inventory.inventory_transactions set reason_code = 'TAMPERED' where id = ${adjustment.transactionId}`.execute(
        database.db,
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      sql`delete from inventory.inventory_movement_lines where inventory_transaction_id = ${adjustment.transactionId}`.execute(
        database.db,
      ),
    ).rejects.toMatchObject({ code: '55000' });
    expect(await verifyInventoryIntegrity(database.db, f.organizationId)).toEqual([]);
  });

  it('rejects fractional movements and reservations for unit-tracked variants', async () => {
    const f = await fixture();
    await expect(opening(f, '1.5')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await opening(f, '2');
    await expect(
      createInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        quantity: '0.5',
        sourceType: 'TEST',
        sourceReference: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createWarehouseTransfer(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        sourceLocationId: f.main.id,
        destinationLocationId: f.secondary.id,
        lines: [{ variantId: f.variantId, quantity: '0.5' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('serves authoritative position and searchable running-balance history read models', async () => {
    const f = await fixture();
    await opening(f, '5');
    await moveInventoryCondition(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      fromCondition: 'SELLABLE',
      toCondition: 'DAMAGED',
      quantity: '2',
      reason: 'Packaging torn during inspection',
      idempotencyKey: crypto.randomUUID(),
    });
    await createInventoryReservation(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      quantity: '1',
      sourceType: 'TEST',
      sourceReference: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    });

    const positions = await listInventoryPositions(database.db, f.organizationId, {
      search: 'Test Hat',
      condition: 'DAMAGED',
    });
    expect(positions).toMatchObject({
      totalCount: 1,
      items: [
        {
          inventoryItemId: expect.any(String),
          productId: f.productId,
          variantId: f.variantId,
          locationId: f.main.id,
          onHand: '5',
          sellable: '3',
          reserved: '1',
          availableToSell: '2',
          unavailable: '2',
          damaged: '2',
          activeReservationCount: 1,
        },
      ],
    });

    const history = await listInventoryHistory(database.db, f.organizationId, {
      search: 'packaging torn',
      condition: 'DAMAGED',
    });
    expect(history).toMatchObject({
      totalCount: 1,
      items: [
        {
          productId: f.productId,
          variantId: f.variantId,
          locationId: f.main.id,
          transactionType: 'CONDITION_CHANGE',
          quantityDelta: '2.000000',
          reasonText: 'Packaging torn during inspection',
          actorId: f.actorId,
          actorDisplayName: 'Inventory Operator',
          runningBalance: '2',
        },
      ],
    });
    const detail = await getInventoryItemDetail(
      database.db,
      f.organizationId,
      positions.items[0]!.inventoryItemId,
    );
    expect(detail).toMatchObject({
      productId: f.productId,
      summary: {
        onHand: '5',
        sellable: '3',
        reserved: '1',
        availableToSell: '2',
        unavailable: '2',
      },
      recentHistory: expect.arrayContaining([
        expect.objectContaining({ runningBalance: expect.any(String) }),
      ]),
      activeReservations: expect.arrayContaining([expect.objectContaining({ status: 'ACTIVE' })]),
    });
  });

  it('preserves archived Catalog stock while blocking new stock and reservations until restoration', async () => {
    const f = await fixture();
    await opening(f, '2');
    const archived = await archiveCatalogProduct(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      productId: f.productId,
      expectedVersion: 1,
    });
    const item = await sql<{
      status: string;
    }>`select status from inventory.inventory_items where organization_id=${f.organizationId} and variant_id=${f.variantId}`.execute(
      database.db,
    );
    expect(item.rows[0]?.status).toBe('ARCHIVED');
    await expect(opening(f, '1')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createInventoryReservation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.main.id,
        quantity: '1',
        sourceType: 'TEST',
        sourceReference: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      condition: 'SELLABLE',
      quantityDelta: '-1',
      reasonCode: 'CORRECTION',
      idempotencyKey: crypto.randomUUID(),
    });
    await restoreCatalogProduct(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      productId: f.productId,
      expectedVersion: archived.version,
    });
    await expect(opening(f, '1')).resolves.toMatchObject({ inventoryItemId: expect.any(String) });
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
    const stats = await getInventoryStats(database.db, f.organizationId);
    expect(stats).toMatchObject({ totalOnHand: '1', totalReserved: '1', totalAvailable: '0' });
    const location = await getLocationDetail(database.db, f.organizationId, f.main.id);
    expect(location?.inventorySummary).toMatchObject({
      totalOnHand: '1.000000',
      totalReserved: '1.000000',
    });
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
    await sql`update inventory.inventory_reservations set status = 'PARTIALLY_CONSUMED' where id = ${reservation.reservationId}`.execute(
      database.db,
    );
    expect(await listInventoryReservations(database.db, f.organizationId)).toMatchObject({
      totalCount: 1,
      items: [
        expect.objectContaining({ id: reservation.reservationId, status: 'PARTIALLY_CONSUMED' }),
      ],
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

  it('expires standalone timed holds once with system audit and outbox evidence', async () => {
    const f = await fixture();
    await opening(f, '3');
    const reservation = await createInventoryReservation(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      quantity: '2',
      sourceType: 'OPERATIONS_HOLD',
      sourceReference: crypto.randomUUID(),
      expiresAt: new Date(Date.now() - 60_000),
      idempotencyKey: crypto.randomUUID(),
    });

    expect(await expireInventoryReservations(database.db)).toBe(1);
    expect(await expireInventoryReservations(database.db)).toBe(0);
    const evidence = await sql<{
      status: string;
      reserved: string;
      audit: string;
      outbox: string;
    }>`
      select
        reservation.status,
        level.reserved_quantity::text as reserved,
        (select count(*)::text from audit.audit_events where target_id = reservation.id and action = 'inventory.reservation.expired' and actor_type = 'SYSTEM') as audit,
        (select count(*)::text from platform.outbox_events where aggregate_id = reservation.id and event_type = 'inventory.reservation.expired') as outbox
      from inventory.inventory_reservations reservation
      join inventory.inventory_levels level
        on level.organization_id = reservation.organization_id
        and level.inventory_item_id = reservation.inventory_item_id
        and level.location_id = reservation.location_id
      where reservation.id = ${reservation.reservationId}
    `.execute(database.db);
    expect(evidence.rows[0]).toEqual({
      status: 'EXPIRED',
      reserved: '0.000000',
      audit: '1',
      outbox: '1',
    });
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
    const transferList = await listWarehouseTransfers(database.db, f.organizationId);
    expect(transferList.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          totalRequested: '2.000000',
          totalDispatched: '2.000000',
          totalReceived: '0.000000',
          lineCount: 1,
        }),
      ]),
    );
    const dispatchedTransfer = transferList.items.find(
      (transfer) => transfer.status === 'IN_TRANSIT',
    )!;
    expect(
      await listInventoryHistory(database.db, f.organizationId, {
        transactionType: 'TRANSFER_DISPATCH',
        search: dispatchedTransfer.transferNumber,
      }),
    ).toMatchObject({
      totalCount: 1,
      items: [
        {
          referenceType: 'warehouse.transfer',
          referenceId: dispatchedTransfer.id,
          referenceNumber: dispatchedTransfer.transferNumber,
          actorDisplayName: 'Inventory Operator',
        },
      ],
    });
    const positions = await listInventoryPositions(database.db, f.organizationId, {
      inventoryItemId: openingTransaction.inventoryItemId,
    });
    expect(positions.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locationId: f.main.id,
          onHand: '1',
          outgoingTransfer: '2',
        }),
        expect.objectContaining({
          locationId: f.secondary.id,
          onHand: '0',
          incomingTransfer: '2',
        }),
      ]),
    );
    const firstPage = await listInventoryPositions(database.db, f.organizationId, {
      inventoryItemId: openingTransaction.inventoryItemId,
      sortBy: 'AVAILABLE',
      sortOrder: 'DESC',
      page: 1,
      limit: 1,
    });
    const secondPage = await listInventoryPositions(database.db, f.organizationId, {
      inventoryItemId: openingTransaction.inventoryItemId,
      sortBy: 'AVAILABLE',
      sortOrder: 'DESC',
      page: 2,
      limit: 1,
    });
    expect(firstPage).toMatchObject({ totalCount: 2, items: [{ locationId: f.main.id }] });
    expect(secondPage).toMatchObject({ totalCount: 2, items: [{ locationId: f.secondary.id }] });
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

  it('serializes stocktake posting against concurrent balance adjustments', async () => {
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
    let reportBalancesLocked!: () => void;
    let releaseStocktake!: () => void;
    const balancesLocked = new Promise<void>((resolve) => {
      reportBalancesLocked = resolve;
    });
    const continueStocktake = new Promise<void>((resolve) => {
      releaseStocktake = resolve;
    });
    const posting = postStocktake(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      stocktakeId: stocktake.stocktakeId,
      idempotencyKey: crypto.randomUUID(),
      afterBalancesLocked: async () => {
        reportBalancesLocked();
        await continueStocktake;
      },
    });
    await balancesLocked;
    const adjustment = adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.main.id,
      condition: 'SELLABLE',
      quantityDelta: '1',
      reasonCode: 'FOUND_STOCK',
      idempotencyKey: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseStocktake();
    await Promise.all([posting, adjustment]);

    const order = await sql<{
      transaction_type: string;
    }>`select transaction.transaction_type from inventory.inventory_movement_lines line join inventory.inventory_transactions transaction on transaction.id = line.inventory_transaction_id where line.organization_id = ${f.organizationId} and transaction.transaction_type in ('STOCKTAKE_ADJUSTMENT', 'ADJUSTMENT') order by line.id`.execute(
      database.db,
    );
    expect(order.rows.map((row) => row.transaction_type)).toEqual([
      'STOCKTAKE_ADJUSTMENT',
      'ADJUSTMENT',
    ]);
    const balance = (await listInventoryBalances(database.db, f.organizationId)).items.find(
      (row) => row.condition === 'SELLABLE',
    )!;
    expect(balance.onHand).toBe('5');
  });
});
