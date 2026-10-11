import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import {
  saveCatalogProductWorkspace,
} from './catalog.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function workspaceFixture() {
  const organization = await createOrganization(database.db, {
    code: `wk-test-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Workspace Test Org',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });

  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${organization.id}, 'apparel', 'Apparel') returning id::text
  `.execute(database.db);
  const productTypeId = productType.rows[0]!.id;

  const warehouse = await sql<{ id: string }>`
    insert into warehouse.locations (organization_id, code, name, location_type, status)
    values (${organization.id}, 'DHK-MAIN', 'Dhaka Central Warehouse', 'WAREHOUSE', 'ACTIVE')
    returning id::text
  `.execute(database.db);
  const locationId = warehouse.rows[0]!.id;

  await sql`
    insert into warehouse.location_capabilities (organization_id, location_id, capability_code)
    values (${organization.id}, ${locationId}::uuid, 'STOCK_HOLDING')
  `.execute(database.db);

  const color = await sql<{ id: string }>`
    insert into catalog.colors (organization_id, name, code, hex_value)
    values (${organization.id}, 'Emerald Green', 'emerald-green', '#046A38')
    returning id::text
  `.execute(database.db);
  const colorId = color.rows[0]!.id;

  return {
    organizationId: organization.id,
    actorId: crypto.randomUUID(),
    productTypeId,
    locationId,
    colorId,
  };
}

describe('saveCatalogProductWorkspace domain engine', () => {
  it('atomically creates a complete multi-variant product workspace', async () => {
    const fix = await workspaceFixture();

    const created = await saveCatalogProductWorkspace(database.db, {
      organizationId: fix.organizationId,
      actorId: fix.actorId,
      title: 'Silk Lawn Kurti Collection',
      handle: 'silk-lawn-kurti-collection',
      productTypeId: fix.productTypeId,
      description: 'Handcrafted luxury lawn kurti with intricate embroidery.',
      inventoryPolicy: 'DENY',
      shippingProfile: 'STANDARD',
      shipping: {
        weight: { value: '450', unit: 'G' },
        dimensions: { length: '35', width: '25', height: '4', unit: 'CM' },
      },
      options: [
        {
          clientRef: 'opt_color',
          name: 'Color',
          code: 'color',
          isVisual: true,
          position: 0,
          values: [
            {
              clientRef: 'val_green',
              displayValue: 'Emerald Green',
              code: 'emerald-green',
              colorId: fix.colorId,
              isPrimary: true,
              position: 0,
            },
          ],
        },
        {
          clientRef: 'opt_size',
          name: 'Size',
          code: 'size',
          isVisual: false,
          position: 1,
          values: [
            {
              clientRef: 'val_m',
              displayValue: 'M',
              code: 'm',
              position: 0,
            },
            {
              clientRef: 'val_l',
              displayValue: 'L',
              code: 'l',
              position: 1,
            },
          ],
        },
      ],
      variants: [
        {
          clientRef: 'var_green_m',
          sku: 'SLK-EMR-M',
          title: 'Emerald Green / M',
          status: 'ACTIVE',
          primaryColorId: fix.colorId,
          priceAmount: '3500.00',
          compareAtAmount: '4200.00',
          currency: 'BDT',
          estimatedCostAmount: '1800.00',
          optionValueIds: ['val_green', 'val_m'],
          initialStock: [{ locationId: fix.locationId, quantity: 25 }],
        },
        {
          clientRef: 'var_green_l',
          sku: 'SLK-EMR-L',
          title: 'Emerald Green / L',
          status: 'ACTIVE',
          primaryColorId: fix.colorId,
          priceAmount: '3500.00',
          compareAtAmount: '4200.00',
          currency: 'BDT',
          estimatedCostAmount: '1800.00',
          optionValueIds: ['val_green', 'val_l'],
          initialStock: [{ locationId: fix.locationId, quantity: 15 }],
        },
      ],
      content: {
        informationGroups: [
          {
            title: 'Fabric & Care',
            items: [
              { label: 'Material', value: '100% Pure Egyptian Lawn' },
              { label: 'Wash Care', value: 'Dry clean only' },
            ],
          },
        ],
        faqs: [
          {
            question: 'Is this transparent?',
            answer: 'No, high density weave with included matching slip.',
          },
        ],
        seoTitle: 'Designer Silk Lawn Kurti | Maevelle Bangladesh',
        seoDescription: 'Shop handcrafted Silk Lawn Kurti online in Bangladesh.',
      },
      targetStatus: 'ACTIVE',
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('Silk Lawn Kurti Collection');
    expect(created.status).toBe('ACTIVE');
    expect(created.options).toHaveLength(2);
    expect(created.variants).toHaveLength(2);

    // Verify variants persisted and linked
    const greenM = created.variants.find((v) => v.sku === 'SLK-EMR-M')!;
    const greenL = created.variants.find((v) => v.sku === 'SLK-EMR-L')!;
    expect(greenM).toBeDefined();
    expect(greenL).toBeDefined();
    expect(greenM.status).toBe('ACTIVE');
    expect(Number(greenM.currentPrice?.amount).toFixed(2)).toBe('3500.00');
    expect(greenM.primaryColor?.id).toBe(fix.colorId);

    // Verify inventory opening balance transaction was created
    const stockBalance = await sql<{ quantity: number }>`
      select level.sellable_quantity::numeric::int as quantity
      from inventory.inventory_levels level
      join inventory.inventory_items item on item.id = level.inventory_item_id
      where item.variant_id = ${greenM.id}::uuid and level.location_id = ${fix.locationId}::uuid
    `.execute(database.db);
    expect(stockBalance.rows[0]?.quantity).toBe(25);

    // 2. Now test EDIT MODE on the same workspace!
    const updated = await saveCatalogProductWorkspace(database.db, {
      organizationId: fix.organizationId,
      actorId: fix.actorId,
      productId: created.id,
      version: created.version,
      title: 'Silk Lawn Kurti Collection (Updated Edition)',
      handle: 'silk-lawn-kurti-collection',
      productTypeId: fix.productTypeId,
      description: 'Updated description for the new season.',
      inventoryPolicy: 'DENY',
      shippingProfile: 'STANDARD',
      options: [
        {
          id: created.options[0]!.id,
          name: 'Color',
          isVisual: true,
          values: [
            {
              id: created.options[0]!.values[0]!.id,
              displayValue: 'Emerald Green',
              colorId: fix.colorId,
              isPrimary: true,
            },
          ],
        },
        {
          id: created.options[1]!.id,
          name: 'Size',
          isVisual: false,
          values: [
            {
              id: created.options[1]!.values[0]!.id,
              displayValue: 'M',
            },
            {
              id: created.options[1]!.values[1]!.id,
              displayValue: 'L',
            },
            {
              clientRef: 'val_xl', // Brand new option value added during edit!
              displayValue: 'XL',
              code: 'xl',
            },
          ],
        },
      ],
      variants: [
        {
          id: greenM.id, // Existing variant updated!
          sku: 'SLK-EMR-M',
          title: 'Emerald Green / M (Season 2)',
          status: 'ACTIVE',
          priceAmount: '3800.00', // Updated price
          primaryColorId: fix.colorId,
        },
        {
          id: greenL.id, // Existing variant kept
          sku: 'SLK-EMR-L',
          status: 'ACTIVE',
          priceAmount: '3800.00',
          primaryColorId: fix.colorId,
        },
        {
          clientRef: 'var_green_xl', // Brand new variant added during edit!
          sku: 'SLK-EMR-XL',
          title: 'Emerald Green / XL',
          status: 'ACTIVE',
          priceAmount: '3900.00',
          primaryColorId: fix.colorId,
          optionValueIds: [created.options[0]!.values[0]!.id, 'val_xl'],
          initialStock: [{ locationId: fix.locationId, quantity: 10 }],
        },
      ],
      targetStatus: 'ACTIVE',
    });

    expect(updated.title).toBe('Silk Lawn Kurti Collection (Updated Edition)');
    expect(updated.variants).toHaveLength(3);

    const greenXl = updated.variants.find((v) => v.sku === 'SLK-EMR-XL')!;
    expect(greenXl).toBeDefined();
    expect(greenXl.status).toBe('ACTIVE');
    expect(Number(greenXl.currentPrice?.amount).toFixed(2)).toBe('3900.00');

    // Verify existing greenM received new price
    const updatedGreenM = updated.variants.find((v) => v.sku === 'SLK-EMR-M')!;
    expect(Number(updatedGreenM.currentPrice?.amount).toFixed(2)).toBe('3800.00');
  });

  it('rejects stale versions to prevent concurrency conflicts', async () => {
    const fix = await workspaceFixture();

    const created = await saveCatalogProductWorkspace(database.db, {
      organizationId: fix.organizationId,
      actorId: fix.actorId,
      title: 'Concurrency Test Saree',
      handle: 'concurrency-test-saree',
      productTypeId: fix.productTypeId,
      variants: [
        {
          clientRef: 'var_1',
          sku: 'CNC-001',
          priceAmount: '2000.00',
          currency: 'BDT',
          status: 'ACTIVE',
        },
      ],
    });

    // Attempting to save with outdated version must throw STALE_VERSION
    await expect(
      saveCatalogProductWorkspace(database.db, {
        organizationId: fix.organizationId,
        actorId: fix.actorId,
        productId: created.id,
        version: created.version - 1, // Stale version!
        title: 'Conflicting Saree Title',
        handle: 'concurrency-test-saree',
        productTypeId: fix.productTypeId,
        variants: [
          {
            id: created.variants[0]!.id,
            sku: 'CNC-001',
            priceAmount: '2500.00',
          },
        ],
      }),
    ).rejects.toThrow('Product has been modified by another operation');
  });
});
