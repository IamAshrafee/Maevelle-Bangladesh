import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  createCatalogProduct,
  createCatalogColor,
  createCatalogVariant,
  createCatalogVariants,
  createProductOptionAxis,
  createProductOptionValue,
  getCatalogProductWorkspace,
  updateCatalogColor,
  updateCatalogVariant,
} from './catalog.js';
import { getCatalogVariantMatrix } from './catalog-variants.js';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

describe('Catalog Variant matrix', () => {
  it('paginates potential combinations and exposes incomplete and cross-domain setup state', async () => {
    const organization = await createOrganization(database.db, {
      code: `matrix-${crypto.randomUUID().slice(0, 12)}`,
      displayName: 'Variant matrix test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const actorId = crypto.randomUUID();
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${organization.id},'dress','Dress') returning id::text`.execute(
      database.db,
    );
    const product = await createCatalogProduct(database.db, {
      organizationId: organization.id,
      actorId,
      productTypeId: productType.rows[0]!.id,
      title: 'Matrix dress',
      handle: `matrix-dress-${crypto.randomUUID().slice(0, 8)}`,
    });
    const size = await createProductOptionAxis(database.db, {
      organizationId: organization.id,
      productId: product.id,
      code: 'size',
      name: 'Size',
      position: 0,
    });
    const small = await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: size.id,
      code: 's',
      displayValue: 'Small',
      position: 0,
    });
    await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: size.id,
      code: 'm',
      displayValue: 'Medium',
      position: 1,
    });
    const incomplete = await createCatalogVariant(database.db, {
      organizationId: organization.id,
      productId: product.id,
      sku: `DRESS-S-${crypto.randomUUID().slice(0, 6)}`,
      optionValueIds: [small.id],
    });
    const color = await createProductOptionAxis(database.db, {
      organizationId: organization.id,
      productId: product.id,
      code: 'color',
      name: 'Color',
      position: 1,
    });
    const red = await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: color.id,
      code: 'red',
      displayValue: 'Red',
      position: 0,
    });
    await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: color.id,
      code: 'blue',
      displayValue: 'Blue',
      position: 1,
    });
    const complete = await createCatalogVariant(database.db, {
      organizationId: organization.id,
      productId: product.id,
      sku: `DRESS-S-RED-${crypto.randomUUID().slice(0, 6)}`,
      optionValueIds: [small.id, red.id],
    });
    await sql`insert into pricing.price_definitions
      (organization_id,variant_id,currency_code,amount,status)
      values (${organization.id},${complete.id}::uuid,'USD',125.50,'ACTIVE')`.execute(database.db);

    const matrix = await getCatalogVariantMatrix(database.db, {
      organizationId: organization.id,
      productId: product.id,
      page: 1,
      pageSize: 10,
    });

    expect(matrix.summary).toEqual({
      potentialCombinations: 4,
      activeVariants: 2,
      archivedVariants: 0,
      missingCombinations: 3,
      incompleteVariants: 1,
    });
    expect(matrix.incompleteVariants).toContainEqual(
      expect.objectContaining({ id: incomplete.id, reasons: ['MISSING_AXIS'] }),
    );
    expect(matrix.rows).toContainEqual(
      expect.objectContaining({
        state: 'ACTIVE',
        values: expect.arrayContaining([
          expect.objectContaining({ valueLabel: 'Small' }),
          expect.objectContaining({ valueLabel: 'Red' }),
        ]),
        variant: expect.objectContaining({
          id: complete.id,
          currentPrice: { amount: '125.5000', compareAtAmount: null, currency: 'USD' },
          sellableQuantity: '0',
          setupIssues: ['MEDIA', 'INVENTORY'],
        }),
      }),
    );
    expect(matrix.rows.filter((row) => row.state === 'MISSING')).toHaveLength(3);
  });

  it('creates a complete matrix atomically and updates variant identity, colors, and physical data', async () => {
    const organization = await createOrganization(database.db, {
      code: `variant-write-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Variant write test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${organization.id},'shirt','Shirt') returning id::text`.execute(
      database.db,
    );
    const product = await createCatalogProduct(database.db, {
      organizationId: organization.id,
      actorId: crypto.randomUUID(),
      productTypeId: productType.rows[0]!.id,
      title: 'Variant shirt',
      handle: `variant-shirt-${crypto.randomUUID().slice(0, 8)}`,
    });
    const red = await createCatalogColor(database.db, {
      organizationId: organization.id,
      code: 'red',
      name: 'Red',
      hexValue: '#D9272E',
    });
    const burgundy = await createCatalogColor(database.db, {
      organizationId: organization.id,
      code: 'burgundy',
      name: 'Burgundy',
      hexValue: '#722F37',
    });
    const renamedRed = await updateCatalogColor(database.db, {
      organizationId: organization.id,
      colorId: red.id,
      expectedVersion: red.version,
      name: 'Crimson',
      hexValue: '#DC143C',
    });
    expect(renamedRed).toMatchObject({
      id: red.id,
      name: 'Crimson',
      hexValue: '#DC143C',
      version: red.version + 1,
    });
    await expect(
      updateCatalogColor(database.db, {
        organizationId: organization.id,
        colorId: red.id,
        expectedVersion: red.version,
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
    const color = await createProductOptionAxis(database.db, {
      organizationId: organization.id,
      productId: product.id,
      code: 'color',
      name: 'Color',
    });
    const redValue = await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: color.id,
      code: 'red',
      displayValue: 'Red',
      colorId: red.id,
    });
    const size = await createProductOptionAxis(database.db, {
      organizationId: organization.id,
      productId: product.id,
      code: 'size',
      name: 'Size',
      position: 1,
    });
    const small = await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: size.id,
      code: 's',
      displayValue: 'Small',
    });
    const medium = await createProductOptionValue(database.db, {
      organizationId: organization.id,
      optionAxisId: size.id,
      code: 'm',
      displayValue: 'Medium',
      position: 1,
    });

    const created = await createCatalogVariants(database.db, {
      organizationId: organization.id,
      productId: product.id,
      variants: [small, medium].map((sizeValue) => ({
        sku: `SHIRT-RED-${sizeValue.id === small.id ? 'S' : 'M'}-${crypto.randomUUID().slice(0, 5)}`,
        title: `Red / ${sizeValue.id === small.id ? 'Small' : 'Medium'}`,
        optionValueIds: [redValue.id, sizeValue.id],
        primaryColorId: red.id,
        associatedColorIds: [burgundy.id],
      })),
    });
    expect(created).toHaveLength(2);

    const updated = await updateCatalogVariant(database.db, {
      organizationId: organization.id,
      productId: product.id,
      variantId: created[0]!.id,
      expectedVersion: created[0]!.version,
      title: 'Scarlet / Small',
      barcode: '8901234567890',
      primaryColorId: burgundy.id,
      associatedColorIds: [red.id],
      weight: { value: '245.500', unit: 'G' },
      dimensions: { length: '30.000', width: '22.000', height: '4.000', unit: 'CM' },
    });
    expect(updated.version).toBe(created[0]!.version + 1);

    const workspace = await getCatalogProductWorkspace(database.db, organization.id, product.id);
    expect(workspace?.variants.find((variant) => variant.id === updated.id)).toMatchObject({
      title: 'Scarlet / Small',
      barcode: '8901234567890',
      primaryColor: { id: burgundy.id, hexValue: '#722F37' },
      associatedColors: [expect.objectContaining({ id: red.id, name: 'Crimson' })],
      weight: { value: '245.500000', unit: 'G' },
      dimensions: { length: '30.000000', width: '22.000000', height: '4.000000', unit: 'CM' },
    });
    await expect(
      updateCatalogVariant(database.db, {
        organizationId: organization.id,
        productId: product.id,
        variantId: updated.id,
        expectedVersion: created[0]!.version,
        title: 'Stale overwrite',
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });
});
