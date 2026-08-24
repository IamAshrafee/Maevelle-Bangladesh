import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import {
  createCatalogCategory,
  createCatalogProduct,
  createCatalogVariant,
  getCatalogProductWorkspace,
  getStorefrontCatalogProduct,
  moveCatalogCategory,
  publishCatalogProduct,
  unpublishCatalogProduct,
  updateCatalogProduct,
} from './catalog.js';
import type { CatalogDomainError } from './catalog.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function catalogFixture() {
  const organization = await createOrganization(database.db, {
    code: `catalog-test-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Catalog test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${organization.id}, 'hat', 'Hat') returning id
  `.execute(database.db);
  const productTypeId = productType.rows[0]?.id;
  if (!productTypeId) throw new Error('Fixture did not create a product type.');
  return { organizationId: organization.id, productTypeId, actorId: crypto.randomUUID() };
}

describe('catalog invariants', () => {
  it('creates a draft product with transactional audit and outbox evidence, then publishes valid variants', async () => {
    const fixture = await catalogFixture();
    const product = await createCatalogProduct(database.db, {
      ...fixture,
      title: 'Structured Hat',
      handle: `structured-hat-${crypto.randomUUID().slice(0, 8)}`,
    });
    expect(product).toMatchObject({
      status: 'DRAFT',
      publicationStatus: 'UNPUBLISHED',
      version: 1,
    });
    await expect(
      publishCatalogProduct(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: product.version,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'] });

    const axis = await sql<{ id: string }>`
      insert into catalog.product_option_axes (organization_id, product_id, code, name)
      values (${fixture.organizationId}, ${product.id}, 'size', 'Size') returning id
    `.execute(database.db);
    const axisId = axis.rows[0]?.id;
    if (!axisId) throw new Error('Fixture did not create an option axis.');
    const value = await sql<{ id: string }>`
      insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value)
      values (${fixture.organizationId}, ${axisId}, 'm', 'M') returning id
    `.execute(database.db);
    const valueId = value.rows[0]?.id;
    if (!valueId) throw new Error('Fixture did not create an option value.');

    const variant = await createCatalogVariant(database.db, {
      organizationId: fixture.organizationId,
      productId: product.id,
      sku: `HAT-${crypto.randomUUID().slice(0, 8)}`,
      optionValueIds: [valueId],
    });
    expect(variant.sku).toMatch(/^HAT-/);
    await expect(
      getCatalogProductWorkspace(database.db, fixture.organizationId, product.id),
    ).resolves.toEqual(
      expect.objectContaining({
        id: product.id,
        productTypeName: 'Hat',
        variantCount: 1,
        options: [
          expect.objectContaining({
            name: 'Size',
            values: [expect.objectContaining({ label: 'M' })],
          }),
        ],
        variants: [expect.objectContaining({ id: variant.id, sku: variant.sku })],
      }),
    );
    const inventoryItem = await sql<{ variant_id: string }>`
      select variant_id from inventory.inventory_items
      where organization_id = ${fixture.organizationId} and variant_id = ${variant.id}
    `.execute(database.db);
    expect(inventoryItem.rows[0]?.variant_id).toBe(variant.id);
    const published = await publishCatalogProduct(database.db, {
      ...fixture,
      productId: product.id,
      expectedVersion: product.version,
    });
    expect(published).toMatchObject({
      status: 'ACTIVE',
      publicationStatus: 'PUBLISHED',
      version: 2,
    });
    const unpublished = await unpublishCatalogProduct(database.db, {
      ...fixture,
      productId: product.id,
      expectedVersion: published.version,
    });
    expect(unpublished.publicationStatus).toBe('UNPUBLISHED');

    const audit = await sql<{ count: string }>`
      select count(*)::text as count from audit.audit_events
      where organization_id = ${fixture.organizationId} and target_id = ${product.id}
    `.execute(database.db);
    const outbox = await sql<{ count: string }>`
      select count(*)::text as count from platform.outbox_events
      where organization_id = ${fixture.organizationId} and aggregate_id = ${product.id}
    `.execute(database.db);
    expect(Number(audit.rows[0]?.count)).toBeGreaterThanOrEqual(3);
    expect(Number(outbox.rows[0]?.count)).toBeGreaterThanOrEqual(3);
  });

  it('rejects duplicate handles, SKU/signature duplicates, and stale updates', async () => {
    const fixture = await catalogFixture();
    const handle = `unique-hat-${crypto.randomUUID().slice(0, 8)}`;
    const product = await createCatalogProduct(database.db, {
      ...fixture,
      title: 'Unique hat',
      handle,
    });
    await expect(
      createCatalogProduct(database.db, { ...fixture, title: 'Duplicate', handle }),
    ).rejects.toThrow();
    await expect(
      updateCatalogProduct(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: product.version + 1,
        title: 'Stale update',
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' satisfies CatalogDomainError['code'] });
  });

  it('supports arbitrary nested categories but prevents a cycle', async () => {
    const fixture = await catalogFixture();
    const a = await createCatalogCategory(database.db, {
      organizationId: fixture.organizationId,
      name: 'A',
      handle: `a-${crypto.randomUUID().slice(0, 8)}`,
    });
    const b = await createCatalogCategory(database.db, {
      organizationId: fixture.organizationId,
      name: 'B',
      handle: `b-${crypto.randomUUID().slice(0, 8)}`,
      parentCategoryId: a.id,
    });
    const c = await createCatalogCategory(database.db, {
      organizationId: fixture.organizationId,
      name: 'C',
      handle: `c-${crypto.randomUUID().slice(0, 8)}`,
      parentCategoryId: b.id,
    });
    await expect(
      moveCatalogCategory(database.db, {
        organizationId: fixture.organizationId,
        categoryId: a.id,
        parentCategoryId: c.id,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' satisfies CatalogDomainError['code'] });
  });

  it('does not expose drafts or another organization’s products through public reads', async () => {
    const fixture = await catalogFixture();
    const handle = `private-${crypto.randomUUID().slice(0, 8)}`;
    const draft = await createCatalogProduct(database.db, {
      ...fixture,
      title: 'Private until published',
      handle,
    });
    expect(
      await getStorefrontCatalogProduct(database.db, fixture.organizationId, handle),
    ).toBeUndefined();
    expect(
      await getStorefrontCatalogProduct(database.db, crypto.randomUUID(), handle),
    ).toBeUndefined();

    const axis = await sql<{ id: string }>`
      insert into catalog.product_option_axes (organization_id, product_id, code, name)
      values (${fixture.organizationId}, ${draft.id}, 'size', 'Size') returning id
    `.execute(database.db);
    const option = await sql<{ id: string }>`
      insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value)
      values (${fixture.organizationId}, ${axis.rows[0]!.id}, 'm', 'M') returning id
    `.execute(database.db);
    await createCatalogVariant(database.db, {
      organizationId: fixture.organizationId,
      productId: draft.id,
      sku: `PRIVATE-${crypto.randomUUID().slice(0, 8)}`,
      optionValueIds: [option.rows[0]!.id],
    });
    await publishCatalogProduct(database.db, {
      ...fixture,
      productId: draft.id,
      expectedVersion: draft.version,
    });
    expect(
      await getStorefrontCatalogProduct(database.db, fixture.organizationId, handle),
    ).toMatchObject({
      title: 'Private until published',
    });
  });
});
