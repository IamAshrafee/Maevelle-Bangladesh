import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  createCatalogProduct,
  createCatalogVariant,
  createProductOptionAxis,
  createProductOptionValue,
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
});
