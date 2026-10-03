import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import {
  createCatalogProduct,
  createProductOptionAxis,
  createProductOptionValue,
  getCatalogProductWorkspace,
  getCatalogProductReadiness,
  CatalogDomainError,
} from './catalog.js';
import { attachMediaToProduct, registerUploadedMedia } from './media.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function createFixture() {
  const organization = await createOrganization(database.db, {
    code: `v3-arch-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'V3 Architecture Test Org',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${organization.id}, 'apparel', 'Apparel') returning id::text
  `.execute(database.db);
  const locationA = await sql<{ id: string }>`
    insert into warehouse.locations (organization_id, code, name, location_type, status)
    values (${organization.id}, 'WH-LOC-A', 'Warehouse A', 'WAREHOUSE', 'ACTIVE') returning id::text
  `.execute(database.db);
  const locationB = await sql<{ id: string }>`
    insert into warehouse.locations (organization_id, code, name, location_type, status)
    values (${organization.id}, 'WH-LOC-B', 'Warehouse B', 'WAREHOUSE', 'ACTIVE') returning id::text
  `.execute(database.db);

  await sql`
    insert into warehouse.location_capabilities (organization_id, location_id, capability_code)
    values
      (${organization.id}, ${locationA.rows[0]!.id}, 'STOCK_HOLDING'),
      (${organization.id}, ${locationB.rows[0]!.id}, 'STOCK_HOLDING')
  `.execute(database.db);

  const actorId = crypto.randomUUID();
  const actorEmail = `arch-actor-${actorId.slice(0, 8)}@example.test`;
  await sql`
    insert into iam.users (id, name, email, email_normalized)
    values (${actorId}::uuid, 'Architecture Operator', ${actorEmail}, ${actorEmail})
  `.execute(database.db);

  return {
    organizationId: organization.id,
    actorId,
    productTypeId: productType.rows[0]!.id,
    locationAId: locationA.rows[0]!.id,
    locationBId: locationB.rows[0]!.id,
  };
}

describe('V3 Catalog Architecture & Integrity', () => {
  it('supports size-only configurable products with shared gallery and no primary SKU', async () => {
    const fx = await createFixture();

    const mediaAsset = await registerUploadedMedia(database.db, {
      organizationId: fx.organizationId,
      objectKey: `images/${crypto.randomUUID()}.webp`,
      mimeType: 'image/webp',
      byteSize: 200,
      checksumSha256: 'a'.repeat(64),
      visibility: 'PUBLIC',
    });

    const product = await createCatalogProduct(database.db, {
      organizationId: fx.organizationId,
      actorId: fx.actorId,
      productTypeId: fx.productTypeId,
      title: 'Classic Cotton Crewneck',
      handle: `classic-crewneck-${crypto.randomUUID().slice(0, 8)}`,
      shipping: {
        weight: { value: '350', unit: 'G' },
        dimensions: { length: '30', width: '25', height: '3', unit: 'CM' },
      },
      options: [
        {
          name: 'Size',
          clientRef: 'axis-size',
          isVisual: false,
          values: [
            { displayValue: 'S', clientRef: 'val-s' },
            { displayValue: 'M', clientRef: 'val-m' },
            { displayValue: 'L', clientRef: 'val-l' },
          ],
        },
      ],
      variants: [
        {
          sku: 'CREW-S',
          optionValueRefs: ['val-s'],
          priceAmount: '1200.00',
          estimatedCostAmount: '450.00',
        },
        {
          sku: 'CREW-M',
          optionValueRefs: ['val-m'],
          priceAmount: '1200.00',
          estimatedCostAmount: '450.00',
        },
        {
          sku: 'CREW-L',
          optionValueRefs: ['val-l'],
          priceAmount: '1250.00',
          estimatedCostAmount: '470.00',
          // Variant override for heavier size L
          weight: { value: '380', unit: 'G' },
        },
      ],
      media: [
        {
          assetId: mediaAsset.id,
          role: 'THUMBNAIL',
          isPrimary: true,
        },
      ],
    });

    const workspace = await getCatalogProductWorkspace(database.db, fx.organizationId, product.id);
    expect(workspace).toBeDefined();

    // Verify variants inherit base shipping unless overridden
    const variantS = workspace!.variants.find((v) => v.sku === 'CREW-S');
    const variantL = workspace!.variants.find((v) => v.sku === 'CREW-L');
    expect(Number(variantS?.shipping?.weight?.value)).toBe(350);
    expect(variantS?.shipping?.weight?.unit).toBe('G');
    expect(Number(variantS?.estimatedCostAmount)).toBe(450);
    expect(Number(variantL?.shipping?.weight?.value)).toBe(380);
    expect(variantL?.shipping?.weight?.unit).toBe('G');
    expect(Number(variantL?.shipping?.dimensions?.length)).toBe(30);
    expect(Number(variantL?.shipping?.dimensions?.width)).toBe(25);
    expect(Number(variantL?.shipping?.dimensions?.height)).toBe(3);
    expect(variantL?.shipping?.dimensions?.unit).toBe('CM');

    // Verify shared gallery media is attached at product level
    expect(workspace!.media).toHaveLength(1);
    expect(workspace!.media[0]!.optionValueId).toBeNull();
    expect(workspace!.media[0]!.variantId).toBeNull();
    expect(workspace!.media[0]!.isPrimary).toBe(true);

    // Verify readiness recognises shared gallery media
    const readiness = await getCatalogProductReadiness(database.db, fx.organizationId, product.id);
    const mediaCheck = readiness?.readiness.checks.find((c) => c.code === 'PUBLIC_MEDIA');
    expect(mediaCheck?.state).toBe('PASS');
  });

  it('enforces immediate write-time rejection when marking a non-visual axis value as primary', async () => {
    const fx = await createFixture();

    const product = await createCatalogProduct(database.db, {
      organizationId: fx.organizationId,
      actorId: fx.actorId,
      productTypeId: fx.productTypeId,
      title: 'Size Test Product',
      handle: `size-test-${crypto.randomUUID().slice(0, 8)}`,
    });

    const sizeAxis = await createProductOptionAxis(database.db, {
      organizationId: fx.organizationId,
      productId: product.id,
      code: 'size',
      name: 'Size',
      isVisual: false,
    });

    await expect(
      createProductOptionValue(database.db, {
        organizationId: fx.organizationId,
        optionAxisId: sizeAxis.id,
        code: 'xl',
        displayValue: 'XL',
        isPrimary: true, // Should fail immediately at write-time!
      }),
    ).rejects.toThrow(CatalogDomainError);
  });

  it('enforces at most one visual axis per product', async () => {
    const fx = await createFixture();

    const product = await createCatalogProduct(database.db, {
      organizationId: fx.organizationId,
      actorId: fx.actorId,
      productTypeId: fx.productTypeId,
      title: 'Multi Visual Test Product',
      handle: `multi-visual-${crypto.randomUUID().slice(0, 8)}`,
    });

    await createProductOptionAxis(database.db, {
      organizationId: fx.organizationId,
      productId: product.id,
      code: 'color',
      name: 'Color',
      isVisual: true,
    });

    await expect(
      createProductOptionAxis(database.db, {
        organizationId: fx.organizationId,
        productId: product.id,
        code: 'pattern',
        name: 'Pattern',
        isVisual: true,
      }),
    ).rejects.toThrow(CatalogDomainError);
  });

  it('rejects product-level merchandising photography when a visual axis exists', async () => {
    const fx = await createFixture();

    const mediaAsset = await registerUploadedMedia(database.db, {
      organizationId: fx.organizationId,
      objectKey: `images/${crypto.randomUUID()}.webp`,
      mimeType: 'image/webp',
      byteSize: 150,
      checksumSha256: 'b'.repeat(64),
      visibility: 'PUBLIC',
    });

    const product = await createCatalogProduct(database.db, {
      organizationId: fx.organizationId,
      actorId: fx.actorId,
      productTypeId: fx.productTypeId,
      title: 'Color T-Shirt',
      handle: `color-tee-${crypto.randomUUID().slice(0, 8)}`,
      options: [
        {
          name: 'Color',
          isVisual: true,
          values: [
            { displayValue: 'Black', isPrimary: true },
            { displayValue: 'White', isPrimary: false },
          ],
        },
      ],
    });

    // Attaching merchandising media directly to product (no optionValueId) must fail because product has a visual axis!
    await expect(
      attachMediaToProduct(database.db, {
        organizationId: fx.organizationId,
        productId: product.id,
        assetId: mediaAsset.id,
        role: 'THUMBNAIL',
      }),
    ).rejects.toThrow();

    // But attaching SIZE_DIAGRAM at product level is allowed
    await expect(
      attachMediaToProduct(database.db, {
        organizationId: fx.organizationId,
        productId: product.id,
        assetId: mediaAsset.id,
        role: 'SIZE_DIAGRAM',
      }),
    ).resolves.toBeUndefined();
  });

  it('enforces shipping group-consistency database check constraints', async () => {
    const fx = await createFixture();

    // Weight value without unit should violate database constraint
    await expect(
      sql`
        insert into catalog.products (organization_id, product_type_id, handle, title, weight_value, weight_unit)
        values (${fx.organizationId}, ${fx.productTypeId}, ${`shipping-fail-${crypto.randomUUID().slice(0, 8)}`}, 'Fail', 500, null)
      `.execute(database.db),
    ).rejects.toThrow(/products_shipping_weight_group/);

    // Partial dimensions should violate database constraint
    await expect(
      sql`
        insert into catalog.products (organization_id, product_type_id, handle, title, length_value, width_value, height_value, dimension_unit)
        values (${fx.organizationId}, ${fx.productTypeId}, ${`dim-fail-${crypto.randomUUID().slice(0, 8)}`}, 'Fail', 10, 20, null, 'CM')
      `.execute(database.db),
    ).rejects.toThrow(/products_shipping_dimensions_group/);
  });

  it('posts multi-location opening inventory atomically through caller transaction', async () => {
    const fx = await createFixture();

    const product = await createCatalogProduct(database.db, {
      organizationId: fx.organizationId,
      actorId: fx.actorId,
      productTypeId: fx.productTypeId,
      title: 'Atomic Inventory Product',
      handle: `atomic-inv-${crypto.randomUUID().slice(0, 8)}`,
      initialVariant: {
        sku: 'ATOMIC-001',
        priceAmount: '990.00',
      },
      variants: [
        {
          sku: 'ATOMIC-001',
          priceAmount: '990.00',
          initialStock: [
            { locationId: fx.locationAId, quantity: 25 },
            { locationId: fx.locationBId, quantity: 15 },
          ],
        },
      ],
    });

    const workspace = await getCatalogProductWorkspace(database.db, fx.organizationId, product.id);
    const variantId = workspace!.variants[0]!.id;

    // Check inventory levels created in warehouse
    const levels = await sql<{ location_id: string; sellable_quantity: string }>`
      select level.location_id::text, level.sellable_quantity::text
      from inventory.inventory_levels level
      join inventory.inventory_items item on item.id = level.inventory_item_id
      where item.variant_id = ${variantId}::uuid and item.organization_id = ${fx.organizationId}
      order by level.location_id
    `.execute(database.db);

    expect(levels.rows).toHaveLength(2);
    const locAStock = levels.rows.find((r) => r.location_id === fx.locationAId);
    const locBStock = levels.rows.find((r) => r.location_id === fx.locationBId);
    expect(Number(locAStock?.sellable_quantity)).toBe(25);
    expect(Number(locBStock?.sellable_quantity)).toBe(15);

    // Check that real inventory ledger movements were posted
    const movements = await sql<{ quantity_delta: string; reason_code: string | null }>`
      select line.quantity_delta::text, tx.reason_code
      from inventory.inventory_movement_lines line
      join inventory.inventory_transactions tx on tx.id = line.inventory_transaction_id
      join inventory.inventory_items item on item.id = line.inventory_item_id
      where item.variant_id = ${variantId}::uuid and line.organization_id = ${fx.organizationId}
    `.execute(database.db);

    expect(movements.rows).toHaveLength(2);
    expect(movements.rows.every((m) => m.reason_code === 'OPENING_BALANCE')).toBe(true);
  });
});
