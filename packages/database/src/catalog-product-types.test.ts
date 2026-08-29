import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  createManagedCatalogAttribute,
  createManagedCatalogProductType,
  createManagedCatalogReferenceOption,
  listManagedCatalogProductTypes,
  updateManagedCatalogAttribute,
  updateManagedCatalogProductType,
  updateManagedCatalogReferenceOption,
} from './catalog-product-types.js';
import type { CatalogDomainError } from './catalog.js';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function organization() {
  return createOrganization(database.db, {
    code: `types-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Product Type test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
}

describe('managed Catalog Product Types', () => {
  it('manages attributes and normalized reference options with optimistic versions', async () => {
    const tenant = await organization();
    const actorId = crypto.randomUUID();
    const productType = await createManagedCatalogProductType(database.db, {
      organizationId: tenant.id,
      actorId,
      code: 'occasionwear',
      name: 'Occasionwear',
    });
    const fabric = await createManagedCatalogAttribute(database.db, {
      organizationId: tenant.id,
      actorId,
      productTypeId: productType.id,
      code: 'fabric-family',
      name: 'Fabric family',
      valueType: 'REFERENCE',
      scope: 'PRODUCT',
      required: true,
      filterable: true,
      referenceOptions: [
        { code: 'silk', label: 'Silk', position: 1 },
        { code: 'linen', label: 'Linen', position: 2 },
      ],
    });
    const wool = await createManagedCatalogReferenceOption(database.db, {
      organizationId: tenant.id,
      actorId,
      attributeId: fabric.id,
      code: 'wool',
      label: 'Wool',
      position: 3,
    });

    let definitions = await listManagedCatalogProductTypes(database.db, tenant.id);
    expect(definitions).toEqual([
      expect.objectContaining({
        id: productType.id,
        code: 'occasionwear',
        productCount: 0,
        attributes: [
          expect.objectContaining({
            id: fabric.id,
            required: true,
            referenceOptions: [
              expect.objectContaining({ code: 'silk', position: 1 }),
              expect.objectContaining({ code: 'linen', position: 2 }),
              expect.objectContaining({ id: wool.id, code: 'wool', position: 3 }),
            ],
          }),
        ],
      }),
    ]);
    const attribute = definitions[0]!.attributes[0]!;
    const woolOption = attribute.referenceOptions.find((option) => option.id === wool.id)!;
    await updateManagedCatalogReferenceOption(database.db, {
      organizationId: tenant.id,
      actorId,
      attributeId: fabric.id,
      optionId: wool.id,
      expectedVersion: woolOption.version,
      label: 'Merino wool',
      status: 'ARCHIVED',
      position: 4,
    });
    await updateManagedCatalogAttribute(database.db, {
      organizationId: tenant.id,
      actorId,
      productTypeId: productType.id,
      attributeId: fabric.id,
      expectedVersion: attribute.version,
      name: 'Primary fabric',
      status: 'ACTIVE',
      required: false,
      filterable: true,
      searchable: false,
    });
    definitions = await listManagedCatalogProductTypes(database.db, tenant.id);
    expect(definitions[0]!.attributes[0]).toMatchObject({
      name: 'Primary fabric',
      required: false,
      referenceOptions: expect.arrayContaining([
        expect.objectContaining({
          id: wool.id,
          label: 'Merino wool',
          status: 'ARCHIVED',
          version: 2,
        }),
      ]),
    });
    await expect(
      updateManagedCatalogAttribute(database.db, {
        organizationId: tenant.id,
        actorId,
        productTypeId: productType.id,
        attributeId: fabric.id,
        expectedVersion: attribute.version,
        name: 'Stale name',
        status: 'ACTIVE',
        required: false,
        filterable: false,
        searchable: false,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' satisfies CatalogDomainError['code'] });
  });

  it('rejects cross-tenant bindings and blocks archiving a Product Type in active use', async () => {
    const [tenant, otherTenant] = await Promise.all([organization(), organization()]);
    const actorId = crypto.randomUUID();
    const productType = await createManagedCatalogProductType(database.db, {
      organizationId: tenant.id,
      actorId,
      code: 'dress',
      name: 'Dress',
    });
    const otherType = await createManagedCatalogProductType(database.db, {
      organizationId: otherTenant.id,
      actorId,
      code: 'dress',
      name: 'Other dress',
    });
    const attribute = await createManagedCatalogAttribute(database.db, {
      organizationId: tenant.id,
      actorId,
      productTypeId: productType.id,
      code: 'material',
      name: 'Material',
      valueType: 'TEXT',
      scope: 'PRODUCT',
    });
    await expect(
      sql`insert into catalog.product_type_attributes
        (organization_id,product_type_id,attribute_definition_id)
        values (${otherTenant.id},${otherType.id}::uuid,${attribute.id}::uuid)`.execute(
        database.db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await sql`insert into catalog.products (organization_id,product_type_id,handle,title)
      values (${tenant.id},${productType.id}::uuid,'active-dress','Active dress')`.execute(
      database.db,
    );
    await expect(
      updateManagedCatalogProductType(database.db, {
        organizationId: tenant.id,
        actorId,
        productTypeId: productType.id,
        expectedVersion: 1,
        name: 'Dress',
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' satisfies CatalogDomainError['code'] });
  });
});
