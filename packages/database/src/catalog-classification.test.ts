import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createCatalogProduct, getCatalogProductWorkspace } from './catalog.js';
import {
  createCatalogVocabularyItem,
  createManagedCategory,
  listCatalogCategories,
  listCatalogVocabulary,
  setCatalogProductVocabulary,
  updateCatalogVocabularyItem,
  updateManagedCategory,
} from './catalog-classification.js';
import type { CatalogDomainError } from './catalog.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `classification-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Classification test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id,code,name)
    values (${organization.id},'dress','Dress') returning id
  `.execute(database.db);
  return {
    organizationId: organization.id,
    actorId: crypto.randomUUID(),
    productTypeId: productType.rows[0]!.id,
  };
}

describe('catalog classification', () => {
  it('preserves nested configured state while an inactive parent controls effective state', async () => {
    const context = await fixture();
    const suffix = crypto.randomUUID().slice(0, 8);
    const parent = await createManagedCategory(database.db, {
      ...context,
      name: 'Women',
      handle: `women-${suffix}`,
    });
    const child = await createManagedCategory(database.db, {
      ...context,
      name: 'Dresses',
      handle: `dresses-${suffix}`,
      parentCategoryId: parent.id,
    });

    await updateManagedCategory(database.db, {
      ...context,
      categoryId: parent.id,
      expectedVersion: 1,
      status: 'INACTIVE',
    });

    const listed = await listCatalogCategories(database.db, {
      organizationId: context.organizationId,
      query: `dresses-${suffix}`,
    });
    expect(listed.items).toContainEqual(
      expect.objectContaining({
        id: child.id,
        status: 'ACTIVE',
        effectiveStatus: 'INACTIVE',
        effectiveStatusReason: 'ANCESTOR_INACTIVE',
        path: 'Women / Dresses',
      }),
    );
    await expect(
      createCatalogProduct(database.db, {
        ...context,
        title: 'Hidden-path dress',
        handle: `hidden-path-${suffix}`,
        categoryIds: [child.id],
        primaryCategoryId: child.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'] });
    await expect(
      updateManagedCategory(database.db, {
        ...context,
        categoryId: parent.id,
        expectedVersion: 2,
        parentCategoryId: child.id,
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' satisfies CatalogDomainError['code'] });
  });

  it('manages and assigns active tags, occasions, and collections atomically', async () => {
    const context = await fixture();
    const suffix = crypto.randomUUID().slice(0, 8);
    const product = await createCatalogProduct(database.db, {
      ...context,
      title: 'Silk dress',
      handle: `silk-dress-${suffix}`,
    });
    const tag = await createCatalogVocabularyItem(database.db, {
      ...context,
      kind: 'TAG',
      name: 'Hand finished',
      handle: `hand-finished-${suffix}`,
    });
    const occasion = await createCatalogVocabularyItem(database.db, {
      ...context,
      kind: 'OCCASION',
      name: 'Wedding',
      handle: `wedding-${suffix}`,
    });
    const collection = await createCatalogVocabularyItem(database.db, {
      ...context,
      kind: 'COLLECTION',
      name: 'Festive Edit',
      handle: `festive-edit-${suffix}`,
      position: 10,
    });
    const category = await createManagedCategory(database.db, {
      ...context,
      name: 'Dresses',
      handle: `dresses-${suffix}`,
    });
    const organizedAtCreation = await createCatalogProduct(database.db, {
      ...context,
      title: 'Organized dress',
      handle: `organized-dress-${suffix}`,
      categoryIds: [category.id],
      primaryCategoryId: category.id,
      tagIds: [tag.id],
      occasionIds: [occasion.id],
      collectionIds: [collection.id],
    });
    await expect(
      getCatalogProductWorkspace(database.db, context.organizationId, organizedAtCreation.id),
    ).resolves.toMatchObject({
      organization: {
        categoryIds: [category.id],
        primaryCategoryId: category.id,
        tagIds: [tag.id],
        occasionIds: [occasion.id],
        collectionIds: [collection.id],
      },
    });

    await setCatalogProductVocabulary(database.db, {
      ...context,
      productId: product.id,
      expectedVersion: product.version,
      tagIds: [tag.id, tag.id],
      occasionIds: [occasion.id],
      collectionIds: [collection.id],
    });
    const workspace = await getCatalogProductWorkspace(
      database.db,
      context.organizationId,
      product.id,
    );
    expect(workspace?.organization).toMatchObject({
      tagIds: [tag.id],
      occasionIds: [occasion.id],
      collectionIds: [collection.id],
    });
    const collections = await listCatalogVocabulary(database.db, {
      organizationId: context.organizationId,
      kind: 'COLLECTION',
    });
    expect(collections.items).toContainEqual(
      expect.objectContaining({ id: collection.id, position: 10, productCount: 2 }),
    );

    await updateCatalogVocabularyItem(database.db, {
      ...context,
      kind: 'TAG',
      itemId: tag.id,
      expectedVersion: 1,
      name: 'Hand finished',
      handle: `hand-finished-${suffix}`,
      status: 'INACTIVE',
    });
    await expect(
      setCatalogProductVocabulary(database.db, {
        ...context,
        productId: product.id,
        expectedVersion: product.version + 1,
        tagIds: [tag.id],
        occasionIds: [],
        collectionIds: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'] });
  });
});
