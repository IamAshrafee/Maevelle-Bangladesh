import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import {
  createCatalogCategory,
  createCatalogProduct,
  createCatalogVariant,
  getCatalogProductReadiness,
  getCatalogProductWorkspace,
  getStorefrontCatalogProduct,
  listCatalogCategoryChoices,
  listCatalogProductWorkItems,
  moveCatalogCategory,
  publishCatalogProduct,
  setCatalogProductAttributes,
  setCatalogProductCategories,
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
    const alternateType = await sql<{ id: string }>`
      insert into catalog.product_types (organization_id, code, name)
      values (${fixture.organizationId}, 'cap', 'Cap') returning id
    `.execute(database.db);
    const updated = await updateCatalogProduct(database.db, {
      ...fixture,
      productId: product.id,
      expectedVersion: product.version,
      title: '  Updated hat  ',
      handle: `updated-${handle}`,
      productTypeId: alternateType.rows[0]!.id,
    });
    expect(updated).toMatchObject({
      title: 'Updated hat',
      handle: `updated-${handle}`,
      version: product.version + 1,
    });
    const workspace = await getCatalogProductWorkspace(
      database.db,
      fixture.organizationId,
      product.id,
    );
    expect(workspace?.productTypeId).toBe(alternateType.rows[0]!.id);
    const redirects = await sql<{ old_handle: string }>`
      select old_handle from catalog.product_handle_history
      where organization_id=${fixture.organizationId} and product_id=${product.id}
    `.execute(database.db);
    expect(redirects.rows).toContainEqual({ old_handle: handle });
    const otherOrganization = await catalogFixture();
    await expect(
      updateCatalogProduct(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: updated.version,
        productTypeId: otherOrganization.productTypeId,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'] });
    await expect(
      updateCatalogProduct(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: product.version,
        title: 'Stale update',
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' satisfies CatalogDomainError['code'] });
  });

  it('provides bounded Product work items with authoritative blockers and separate warnings', async () => {
    const fixture = await catalogFixture();
    const handle = `work-item-${crypto.randomUUID().slice(0, 8)}`;
    const product = await createCatalogProduct(database.db, {
      ...fixture,
      title: 'Worklist dress',
      handle,
      description: 'A useful customer-facing description.',
    });

    const blocked = await getCatalogProductReadiness(
      database.db,
      fixture.organizationId,
      product.id,
    );
    expect(blocked?.readiness).toMatchObject({
      state: 'BLOCKED',
      canPublish: false,
      blockerCount: 1,
    });
    expect(blocked?.readiness.checks).toContainEqual(
      expect.objectContaining({ code: 'ACTIVE_VARIANT', state: 'BLOCKER' }),
    );

    const blockedList = await listCatalogProductWorkItems(database.db, {
      organizationId: fixture.organizationId,
      query: handle,
      status: 'DRAFT',
      readiness: 'BLOCKED',
      page: 1,
      pageSize: 10,
    });
    expect(blockedList).toMatchObject({
      items: [expect.objectContaining({ id: product.id, readinessState: 'BLOCKED' })],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const normalizedStalePage = await listCatalogProductWorkItems(database.db, {
      organizationId: fixture.organizationId,
      query: handle,
      page: 9,
      pageSize: 10,
    });
    expect(normalizedStalePage.pagination).toMatchObject({
      page: 1,
      totalItems: 1,
      totalPages: 1,
    });

    const axis = await sql<{ id: string }>`
      insert into catalog.product_option_axes (organization_id, product_id, code, name)
      values (${fixture.organizationId}, ${product.id}, 'size', 'Size') returning id
    `.execute(database.db);
    const value = await sql<{ id: string }>`
      insert into catalog.product_option_values (organization_id, option_axis_id, code, display_value)
      values (${fixture.organizationId}, ${axis.rows[0]!.id}, 'm', 'M') returning id
    `.execute(database.db);
    await createCatalogVariant(database.db, {
      organizationId: fixture.organizationId,
      productId: product.id,
      sku: `WORK-${crypto.randomUUID().slice(0, 8)}`,
      optionValueIds: [value.rows[0]!.id],
    });

    const ready = await getCatalogProductReadiness(database.db, fixture.organizationId, product.id);
    expect(ready?.readiness).toMatchObject({
      state: 'READY',
      canPublish: true,
      blockerCount: 0,
    });
    expect(ready?.readiness.warningCount).toBeGreaterThan(0);
    expect(ready?.readiness.checks).toContainEqual(
      expect.objectContaining({ code: 'CURRENT_PRICE', state: 'WARNING' }),
    );
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

  it('assigns tenant-scoped taxonomy and typed Product Type attributes atomically', async () => {
    const fixture = await catalogFixture();
    const product = await createCatalogProduct(database.db, {
      ...fixture,
      title: 'Structured dress',
      handle: `structured-dress-${crypto.randomUUID().slice(0, 8)}`,
    });
    const parent = await createCatalogCategory(database.db, {
      organizationId: fixture.organizationId,
      name: 'Women',
      handle: `women-${crypto.randomUUID().slice(0, 8)}`,
    });
    const child = await createCatalogCategory(database.db, {
      organizationId: fixture.organizationId,
      name: 'Dresses',
      handle: `dresses-${crypto.randomUUID().slice(0, 8)}`,
      parentCategoryId: parent.id,
    });
    const choices = await listCatalogCategoryChoices(database.db, fixture.organizationId);
    expect(choices).toContainEqual(
      expect.objectContaining({ id: child.id, path: 'Women / Dresses', depth: 1 }),
    );
    const categorized = await setCatalogProductCategories(database.db, {
      ...fixture,
      productId: product.id,
      expectedVersion: product.version,
      categoryIds: [parent.id, child.id],
      primaryCategoryId: child.id,
    });

    const attributes = await sql<{ id: string; code: string }>`
      insert into catalog.attribute_definitions
        (organization_id,code,name,value_type,scope,is_filterable,is_searchable)
      values
        (${fixture.organizationId},'material','Material','TEXT','PRODUCT',true,true),
        (${fixture.organizationId},'washable','Machine washable','BOOLEAN','PRODUCT',true,false)
      returning id::text,code
    `.execute(database.db);
    for (const attribute of attributes.rows)
      await sql`
        insert into catalog.product_type_attributes
          (product_type_id,attribute_definition_id,is_required)
        values (${fixture.productTypeId},${attribute.id}::uuid,${attribute.code === 'material'})
      `.execute(database.db);
    const byCode = new Map(attributes.rows.map((attribute) => [attribute.code, attribute.id]));
    const attributed = await setCatalogProductAttributes(database.db, {
      ...fixture,
      productId: product.id,
      expectedVersion: categorized.version,
      values: [
        { attributeDefinitionId: byCode.get('material')!, value: ' Cotton ' },
        { attributeDefinitionId: byCode.get('washable')!, value: false },
      ],
    });
    const workspace = await getCatalogProductWorkspace(
      database.db,
      fixture.organizationId,
      product.id,
    );
    expect(workspace?.organization).toMatchObject({
      categoryIds: expect.arrayContaining([parent.id, child.id]),
      primaryCategoryId: child.id,
      attributes: expect.arrayContaining([
        expect.objectContaining({ code: 'material', required: true, value: 'Cotton' }),
        expect.objectContaining({ code: 'washable', value: false }),
      ]),
    });
    await expect(
      setCatalogProductAttributes(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: attributed.version,
        values: [{ attributeDefinitionId: byCode.get('material')!, value: null }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'] });
    await expect(
      setCatalogProductCategories(database.db, {
        ...fixture,
        productId: product.id,
        expectedVersion: product.version,
        categoryIds: [],
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' satisfies CatalogDomainError['code'] });
    const afterStale = await getCatalogProductWorkspace(
      database.db,
      fixture.organizationId,
      product.id,
    );
    expect(afterStale?.organization.categoryIds).toEqual(
      expect.arrayContaining([parent.id, child.id]),
    );
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
