import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  adjustInventory,
  approveWarehouseTransfer,
  createInventoryReservation,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  receiveWarehouseTransfer,
} from './inventory.js';
import { createLocation } from './warehouse.js';
import {
  allocateUnitsToFulfillment,
  convertStockToSerialized,
  findInventoryUnitByCode,
  getInventoryUnit,
  listUnitEvents,
  listUnitInspections,
  moveUnitLocation,
  performUnitInspection,
  receiveReturnedUnit,
  reconcileSerializedInventory,
  registerInventoryUnits,
  releaseUnitForSale,
  requestUnitRepair,
  completeUnitRepair,
  setVariantTrackingMode,
  updateUnitPackaging,
  writeOffUnit,
  UnitTraceabilityDomainError,
  renderCode128Svg,
} from './inventory-units.js';
import {
  createFulfillment,
  cancelFulfillment,
} from './fulfillment.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `unit-test-${crypto.randomUUID().slice(0, 10)}`,
    displayName: 'Unit Traceability Test Organization',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });

  const actorId = crypto.randomUUID();
  const actorEmail = `operator-${actorId}@example.test`;
  await sql`
    insert into iam.users (id, name, email, email_normalized)
    values (${actorId}, 'QC Operator', ${actorEmail}, ${actorEmail})
  `.execute(database.db);

  await sql`
    insert into iam.organization_memberships (organization_id, user_id, membership_type, status, display_name)
    values (${organization.id}, ${actorId}, 'OWNER', 'ACTIVE', 'QC Operator')
  `.execute(database.db);

  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${organization.id}, 'dress', 'Dress') returning id
  `.execute(database.db);

  const product = await sql<{ id: string }>`
    insert into catalog.products (organization_id, product_type_id, handle, title)
    values (${organization.id}, ${productType.rows[0]!.id}, ${`dress-${crypto.randomUUID().slice(0, 8)}`}, 'Silk Summer Dress')
    returning id
  `.execute(database.db);

  const axis = await sql<{ id: string }>`
    insert into catalog.product_option_axes (organization_id, product_id, code, name)
    values (${organization.id}, ${product.rows[0]!.id}, 'color', 'Color') returning id
  `.execute(database.db);

  const value = await sql<{ id: string }>`
    insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value)
    values (${organization.id}, ${axis.rows[0]!.id}, 'pink', 'Pink') returning id
  `.execute(database.db);

  const skuString = `DR-PNK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const variant = await sql<{ id: string }>`
    insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature)
    values (${organization.id}, ${product.rows[0]!.id}, ${skuString}, ${skuString}, ${value.rows[0]!.id})
    returning id
  `.execute(database.db);

  const mainLocation = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `WH-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Central Warehouse Dhaka',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING', 'PURCHASE_RECEIVING', 'ORDER_FULFILLMENT', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
  });

  const secondaryLocation = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `SHOW-${crypto.randomUUID().slice(0, 5)}`,
    name: 'Gulshan Showroom',
    locationType: 'SHOWROOM',
    capabilities: ['STOCK_HOLDING', 'ORDER_FULFILLMENT', 'TRANSFER_RECEIVE'],
  });

  return {
    organizationId: organization.id,
    actorId,
    productId: product.rows[0]!.id,
    variantId: variant.rows[0]!.id,
    sku: skuString,
    mainLocation,
    secondaryLocation,
  };
}

async function registerLedgerBackedUnits(
  f: Awaited<ReturnType<typeof fixture>>,
  input: {
    quantity: number;
    inventoryCondition?: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
    initialCondition?: 'GRADE_A' | 'GRADE_B' | 'REPAIR_REQUIRED' | 'DAMAGED_UNSELLABLE';
    initialStatus?: 'AWAITING_QC' | 'AVAILABLE' | 'ON_HOLD';
    packageReference?: string;
    storageNotes?: string;
  },
) {
  const inventoryCondition = input.inventoryCondition ?? 'INSPECTION';
  await adjustInventory(database.db, {
    organizationId: f.organizationId,
    actorId: f.actorId,
    locationId: f.mainLocation.id,
    variantId: f.variantId,
    condition: inventoryCondition,
    quantityDelta: String(input.quantity),
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: `unit-fixture-${crypto.randomUUID()}`,
  });
  return registerInventoryUnits(database.db, {
    organizationId: f.organizationId,
    actorId: f.actorId,
    variantId: f.variantId,
    locationId: f.mainLocation.id,
    quantity: input.quantity,
    sourceType: 'MANUAL_INTAKE',
    inventoryCondition,
    initialCondition: input.initialCondition,
    initialStatus: input.initialStatus,
    packageReference: input.packageReference,
    storageNotes: input.storageNotes,
  });
}

describe('Individual Unit Traceability & Quality Control', () => {
  it('registers multiple units sharing one variant SKU with permanent, sequential Unit Codes', async () => {
    const f = await fixture();

    const units = await registerLedgerBackedUnits(f, {
      quantity: 3,
      initialCondition: 'GRADE_A',
      packageReference: 'BOX-001',
      storageNotes: 'Rack A, Shelf 2',
    });

    expect(units).toHaveLength(3);
    const codes = units.map((u) => u.unitCode);
    // All units have unique sequential codes with prefix MVU-
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) {
      expect(code).toMatch(/^MVU-\d{6}$/);
    }

    // All units share the same variant SKU and product
    for (const u of units) {
      expect(u.variantId).toBe(f.variantId);
      expect(u.sku).toBe(f.sku);
      expect(u.productTitle).toBe('Silk Summer Dress');
      expect(u.locationId).toBe(f.mainLocation.id);
      expect(u.status).toBe('AWAITING_QC');
      expect(u.inventoryCondition).toBe('INSPECTION');
      expect(u.currentCondition).toBe('GRADE_A');
      expect(u.packageReference).toBe('BOX-001');
    }

    // Events are logged in unit_events
    const events = await listUnitEvents(database.db, {
      organizationId: f.organizationId,
      unitId: units[0]!.id,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('REGISTERED');

    await expect(
      registerInventoryUnits(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.mainLocation.id,
        quantity: 1,
        sourceType: 'MANUAL_INTAKE',
        inventoryCondition: 'INSPECTION',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('preserves quantity tracking mode and supports safe stock conversion to serialized units', async () => {
    const f = await fixture();

    // 1. Put 5 sellable quantity-based items in inventory
    await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      locationId: f.mainLocation.id,
      variantId: f.variantId,
      condition: 'SELLABLE',
      quantityDelta: '5',
      reasonCode: 'OPENING_BALANCE',
      idempotencyKey: `adj-${crypto.randomUUID()}`,
    });

    // Variant starts in STANDARD tracking mode
    const trackingMode = await setVariantTrackingMode(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      trackingMode: 'STANDARD',
    });
    expect(trackingMode.trackingMode).toBe('STANDARD');

    // 2. Convert stock to serialized
    const conversion = await convertStockToSerialized(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
      packageReference: 'LOT-BATCH-1',
    });

    expect(conversion.unitsCreated).toBe(5);
    expect(conversion.units).toHaveLength(5);
    for (const u of conversion.units) {
      expect(u.status).toBe('AVAILABLE');
      expect(u.currentCondition).toBe('GRADE_A');
      expect(u.sourceType).toBe('STOCK_CONVERSION');
    }

    // 3. Serialized stock reconciliation matches perfectly
    const reconciliation = await reconcileSerializedInventory(database.db, {
      organizationId: f.organizationId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
    });

    expect(reconciliation.trackingMode).toBe('SERIAL');
    expect(reconciliation.availableUnitsCount).toBe(5);
    expect(reconciliation.ledgerSellableQuantity).toBe('5.000000');
    expect(reconciliation.isConsistent).toBe(true);
    expect(reconciliation.discrepancies).toHaveLength(0);

    const replay = await convertStockToSerialized(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
    });
    expect(replay.unitsCreated).toBe(0);
  });

  it('rejects conversion to serialized when active inventory reservations conflict', async () => {
    const f = await fixture();

    await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      locationId: f.mainLocation.id,
      variantId: f.variantId,
      condition: 'SELLABLE',
      quantityDelta: '10',
      reasonCode: 'OPENING_BALANCE',
      idempotencyKey: `adj-${crypto.randomUUID()}`,
    });

    // Create an active reservation
    await createInventoryReservation(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
      quantity: '2',
      sourceType: 'ORDER',
      sourceReference: `ORD-${crypto.randomUUID()}`,
      idempotencyKey: `res-${crypto.randomUUID()}`,
    });

    // Conversion must fail with RESERVATION_CONFLICT
    await expect(
      convertStockToSerialized(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        variantId: f.variantId,
        locationId: f.mainLocation.id,
      }),
    ).rejects.toThrowError(UnitTraceabilityDomainError);
  });

  it('supports barcode lookup by Unit Code (case-insensitive) and generates Code 128 payload', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
    });

    // Lookup by lowercase code
    const found = await findInventoryUnitByCode(database.db, {
      organizationId: f.organizationId,
      code: unit!.unitCode.toLowerCase(),
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBe(unit!.id);
    expect(found!.unitCode).toBe(unit!.unitCode);

    // Code 128 barcode SVG rendering
    const svg = renderCode128Svg(unit!.unitCode);
    expect(svg).toContain('<svg');
    expect(svg).toContain(unit!.unitCode);
  });

  it('executes Quality Control inspection workflow: Grade A passes to AVAILABLE', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      initialStatus: 'AWAITING_QC',
    });

    // Perform QC inspection: Grade A
    const { inspection, unit: inspectedUnit } = await performUnitInspection(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      inspectionStage: 'INBOUND_INTAKE',
      conditionResult: 'GRADE_A',
      outcome: 'PASSED',
      notes: 'Fabric flawless, seams secure, passed QC.',
    });

    expect(inspection.inspectionNumber).toMatch(/^INSP-\d{4}-\d{6}$/);
    expect(inspection.conditionResult).toBe('GRADE_A');
    expect(inspection.inspectionOutcome).toBe('PASSED');
    expect(inspectedUnit.status).toBe('AVAILABLE');
    expect(inspectedUnit.inventoryCondition).toBe('SELLABLE');
    expect(inspectedUnit.currentCondition).toBe('GRADE_A');

    // History preserves inspection event
    const events = await listUnitEvents(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(events.some((e) => e.eventType === 'INSPECTED' && e.toStatus === 'AVAILABLE')).toBe(true);
  });

  it('rolls back a unit inspection when its authoritative ledger bucket cannot move', async () => {
    const f = await fixture();
    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      inventoryCondition: 'INSPECTION',
      initialStatus: 'AWAITING_QC',
    });
    await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      locationId: f.mainLocation.id,
      variantId: f.variantId,
      condition: 'INSPECTION',
      quantityDelta: '-1',
      reasonCode: 'TEST_LEDGER_DIVERGENCE',
      idempotencyKey: `divergence-${crypto.randomUUID()}`,
    });

    await expect(
      performUnitInspection(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        unitId: unit!.id,
        inspectionStage: 'INBOUND_INTAKE',
        conditionResult: 'GRADE_A',
        outcome: 'PASSED',
      }),
    ).rejects.toThrow();

    const unchanged = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unchanged.status).toBe('AWAITING_QC');
    expect(await listUnitInspections(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    })).toHaveLength(0);
  });

  it('manages cleaning and repair workflow with mandatory reinspection before release', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      initialStatus: 'AWAITING_QC',
    });

    // Initial inspection reveals defect: repair required
    await performUnitInspection(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      inspectionStage: 'INBOUND_INTAKE',
      conditionResult: 'REPAIR_REQUIRED',
      defectDescription: 'Minor seam unraveling near inner hem',
      outcome: 'HOLD_FOR_REPAIR',
    });

    // 1. Request repair
    const repair = await requestUnitRepair(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      defectDescription: 'Inner hem seam unraveling',
      actionRequired: 'Hand stitching repair',
      technicianName: 'Rafiq Master',
    });

    expect(repair.repairNumber).toMatch(/^REP-\d{4}-\d{6}$/);
    expect(repair.repairStatus).toBe('REQUESTED');

    const unitOnHold = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unitOnHold.status).toBe('ON_HOLD');
    expect(unitOnHold.currentCondition).toBe('REPAIR_REQUIRED');

    // 2. Complete repair
    const completedRepair = await completeUnitRepair(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      repairId: repair.id,
      actionPerformed: 'Reinforced inner hem with double stitching',
      costAmount: '150.0000',
      costCurrency: 'BDT',
    });

    expect(completedRepair.repairStatus).toBe('COMPLETED');
    expect(completedRepair.actionPerformed).toContain('Reinforced inner hem');

    // Unit moves to AWAITING_QC for mandatory reinspection (not sellable yet!)
    const unitAfterRepair = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unitAfterRepair.status).toBe('AWAITING_QC');

    // 3. Reinspection passes
    const reinspection = await performUnitInspection(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      inspectionStage: 'REINSPECTION',
      conditionResult: 'GRADE_A',
      outcome: 'PASSED',
      notes: 'Repair verified clean and invisible. Ready for sale.',
    });

    expect(reinspection.unit.status).toBe('AVAILABLE');
    expect(reinspection.unit.inventoryCondition).toBe('SELLABLE');
    expect(reinspection.unit.currentCondition).toBe('GRADE_A');
  });

  it('blocks direct cross-location movement and preserves packaging identity changes', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      packageReference: 'BOX-ALPHA',
      storageNotes: 'Shelf 1',
    });

    await expect(
      moveUnitLocation(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        unitId: unit!.id,
        newLocationId: f.secondaryLocation.id,
        newStorageNotes: 'Showroom Display Rack 3',
        reason: 'Showroom merchandising transfer',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    const unchanged = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unchanged.locationId).toBe(f.mainLocation.id);

    // Repackage unit
    const repackaged = await updateUnitPackaging(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      packageReference: 'BOX-BETA-GIFT',
    });

    expect(repackaged.packageReference).toBe('BOX-BETA-GIFT');
    expect(repackaged.unitCode).toBe(unit!.unitCode); // Identity preserved!

    const events = await listUnitEvents(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(events.some((e) => e.eventType === 'LOCATION_MOVED')).toBe(false);
    expect(events.some((e) => e.eventType === 'REPACKAGED')).toBe(true);
  });

  it('moves exact serialized identities with an authoritative warehouse transfer', async () => {
    const f = await fixture();
    const units = await registerLedgerBackedUnits(f, {
      quantity: 2,
      inventoryCondition: 'SELLABLE',
      initialStatus: 'AVAILABLE',
    });
    const created = await createWarehouseTransfer(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      sourceLocationId: f.mainLocation.id,
      destinationLocationId: f.secondaryLocation.id,
      lines: [{ variantId: f.variantId, quantity: '2' }],
      idempotencyKey: crypto.randomUUID(),
    });
    await approveWarehouseTransfer(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      transferId: created.transferId,
      expectedVersion: created.version,
    });
    await dispatchWarehouseTransfer(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      transferId: created.transferId,
      idempotencyKey: crypto.randomUUID(),
    });

    const inTransit = await Promise.all(units.map((unit) => getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit.id,
    })));
    expect(inTransit.map((unit) => unit.status)).toEqual(['IN_TRANSFER', 'IN_TRANSFER']);
    expect(inTransit.every((unit) => unit.locationId === f.mainLocation.id)).toBe(true);
    expect((await reconcileSerializedInventory(database.db, {
      organizationId: f.organizationId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
    })).isConsistent).toBe(true);

    const line = await sql<{ id: string }>`
      select id from warehouse.transfer_lines
      where organization_id = ${f.organizationId} and transfer_id = ${created.transferId}
    `.execute(database.db);
    await receiveWarehouseTransfer(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      transferId: created.transferId,
      idempotencyKey: crypto.randomUUID(),
      lines: [{
        transferLineId: line.rows[0]!.id,
        sellableQuantity: '1',
        damagedQuantity: '1',
        unitReceipts: [
          { unitId: units[0]!.id, condition: 'SELLABLE' },
          { unitId: units[1]!.id, condition: 'DAMAGED' },
        ],
      }],
    });

    const received = await Promise.all(units.map((unit) => getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit.id,
    })));
    expect(received[0]).toMatchObject({
      locationId: f.secondaryLocation.id,
      inventoryCondition: 'SELLABLE',
      status: 'AVAILABLE',
    });
    expect(received[1]).toMatchObject({
      locationId: f.secondaryLocation.id,
      inventoryCondition: 'DAMAGED',
      status: 'ON_HOLD',
    });
    expect((await reconcileSerializedInventory(database.db, {
      organizationId: f.organizationId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
    })).isConsistent).toBe(true);
    expect((await reconcileSerializedInventory(database.db, {
      organizationId: f.organizationId,
      variantId: f.variantId,
      locationId: f.secondaryLocation.id,
    })).isConsistent).toBe(true);
  });

  it('supports authorized release and permanent write-off', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      inventoryCondition: 'QUARANTINE',
      initialStatus: 'ON_HOLD',
      initialCondition: 'GRADE_B',
    });

    // Release Grade B for sale with disclosure
    const released = await releaseUnitForSale(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      reason: 'Approved for sale under minor-imperfection discount arrangement',
    });
    expect(released.status).toBe('AVAILABLE');
    expect(released.inventoryCondition).toBe('SELLABLE');

    // Write-off unit
    const writtenOff = await writeOffUnit(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      unitId: unit!.id,
      reason: 'Accidental chemical spill during handling - totally unsellable',
    });
    expect(writtenOff.status).toBe('WRITTEN_OFF');
    expect(writtenOff.currentCondition).toBe('DAMAGED_UNSELLABLE');

    const reconciliation = await reconcileSerializedInventory(database.db, {
      organizationId: f.organizationId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
    });
    expect(reconciliation.ledgerSellableQuantity).toBe('0.000000');
    expect(reconciliation.isConsistent).toBe(true);

    // Cannot write off again or inspect
    await expect(
      writeOffUnit(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        unitId: unit!.id,
        reason: 'Duplicate attempt',
      }),
    ).rejects.toThrowError(UnitTraceabilityDomainError);
  });

  it('integrates with fulfillment: allocating, dispatching, and releasing units', async () => {
    const f = await fixture();

    // 1. Register unit in AVAILABLE status
    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      inventoryCondition: 'SELLABLE',
      initialStatus: 'AVAILABLE',
      initialCondition: 'GRADE_A',
    });

    // 2. Reserve the ledger-backed unit for an order.
    const reservation = await createInventoryReservation(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      locationId: f.mainLocation.id,
      quantity: '1',
      sourceType: 'ORDER',
      sourceReference: `ORD-${crypto.randomUUID()}`,
      idempotencyKey: `res-${crypto.randomUUID()}`,
    });

    // 3. Create dummy order & order_line
    const order = await sql<{ id: string }>`
      insert into orders.orders (
        organization_id, order_number, order_status, sales_channel, payment_method,
        currency_code, subtotal_amount, discount_amount, delivery_amount, tax_amount, total_amount
      ) values (
        ${f.organizationId}, ${`ORD-${crypto.randomUUID().slice(0, 6)}`}, 'CONFIRMED', 'STOREFRONT', 'COD',
        'BDT', 2500, 0, 0, 0, 2500
      ) returning id
    `.execute(database.db);

    const orderLine = await sql<{ id: string }>`
      insert into orders.order_lines (
        organization_id, order_id, variant_id, sku_snapshot, product_title_snapshot,
        quantity, unit_price, gross_amount, discount_amount, net_amount
      ) values (
        ${f.organizationId}, ${order.rows[0]!.id}, ${f.variantId}, ${f.sku},
        'Dress', 1, 2500, 2500, 0, 2500
      ) returning id
    `.execute(database.db);

    await sql`
      insert into orders.order_inventory_reservations (
        organization_id, order_id, order_line_id, reservation_id
      ) values (
        ${f.organizationId}, ${order.rows[0]!.id}, ${orderLine.rows[0]!.id}, ${reservation.reservationId}
      )
    `.execute(database.db);

    await sql`
      insert into inventory.inventory_reservation_allocations (
        organization_id, reservation_id, order_line_id, inventory_item_id, location_id, reserved_quantity
      ) values (
        ${f.organizationId}, ${reservation.reservationId}, ${orderLine.rows[0]!.id},
        ${reservation.inventoryItemId}, ${f.mainLocation.id}, 1
      )
    `.execute(database.db);

    // 4. Create fulfillment
    const fulfillment = await createFulfillment(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      orderId: order.rows[0]!.id,
      locationId: f.mainLocation.id,
      lines: [{ orderLineId: orderLine.rows[0]!.id, quantity: '1' }],
      idempotencyKey: `ful-${crypto.randomUUID()}`,
    });

    const fLineId = fulfillment.lines[0]!.id;

    // 5. Allocate unit to fulfillment
    const allocationResult = await allocateUnitsToFulfillment(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      fulfillmentId: fulfillment.id,
      allocations: [{ fulfillmentLineId: fLineId, unitId: unit!.id }],
    });

    expect(allocationResult.count).toBe(1);

    const unitAllocated = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unitAllocated.status).toBe('IN_FULFILLMENT');
    expect(unitAllocated.currentFulfillmentId).toBe(fulfillment.id);

    // 6. Test cancellation releases units
    const cancelled = await cancelFulfillment(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      fulfillmentId: fulfillment.id,
      expectedVersion: fulfillment.version,
      idempotencyKey: `cancel-${crypto.randomUUID()}`,
    });

    expect(cancelled.status).toBe('CANCELLED');

    const unitReleased = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unitReleased.status).toBe('AVAILABLE');
    expect(unitReleased.currentFulfillmentId).toBeNull();
  });

  it('requires posted return-receipt evidence before reconnecting a dispatched unit', async () => {
    const f = await fixture();

    const [unit] = await registerLedgerBackedUnits(f, {
      quantity: 1,
      inventoryCondition: 'SELLABLE',
      initialStatus: 'AVAILABLE',
    });
    await adjustInventory(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      locationId: f.mainLocation.id,
      variantId: f.variantId,
      condition: 'SELLABLE',
      quantityDelta: '-1',
      reasonCode: 'TEST_DISPATCH',
      idempotencyKey: `dispatch-${crypto.randomUUID()}`,
    });
    await sql`
      update inventory.inventory_units set status = 'DISPATCHED'
      where id = ${unit!.id} and organization_id = ${f.organizationId}
    `.execute(database.db);

    await expect(
      receiveReturnedUnit(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        unitId: unit!.id,
        receivingLocationId: f.secondaryLocation.id,
        notes: 'Customer returned via Pathao courier, bag intact.',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const unchanged = await getInventoryUnit(database.db, {
      organizationId: f.organizationId,
      unitId: unit!.id,
    });
    expect(unchanged.status).toBe('DISPATCHED');
    expect(unchanged.locationId).toBe(f.mainLocation.id);
  });
});
