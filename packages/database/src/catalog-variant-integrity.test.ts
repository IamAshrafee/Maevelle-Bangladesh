import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  createCatalogProduct,
  createCatalogVariant,
  createProductOptionAxis,
  createProductOptionValue,
  getCatalogProductReadiness,
  getStorefrontCatalogProduct,
  listStorefrontCatalogProducts,
  publishCatalogProduct,
  unpublishCatalogProduct,
  updateCatalogVariant,
  updateProductOptionAxis,
  updateProductOptionValue,
} from './catalog.js';
import type { CatalogDomainError } from './catalog.js';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import { rebuildStorefrontSearch, searchStorefront } from './storefront.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function productFixture(valueCodes: readonly string[] = ['small', 'medium'], publish = true) {
  const organization = await createOrganization(database.db, {
    code: `variant-integrity-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'Variant integrity test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  const actorId = crypto.randomUUID();
  const type = await sql<{ id: string }>`insert into catalog.product_types
    (organization_id,code,name) values(${organization.id},'dress','Dress') returning id::text`.execute(
    database.db,
  );
  const handle = `integrity-dress-${crypto.randomUUID().slice(0, 8)}`;
  const product = await createCatalogProduct(database.db, {
    organizationId: organization.id,
    actorId,
    productTypeId: type.rows[0]!.id,
    title: 'Integrity dress',
    handle,
  });
  const axis = await createProductOptionAxis(database.db, {
    organizationId: organization.id,
    actorId,
    productId: product.id,
    code: 'size',
    name: 'Size',
  });
  const values = await Promise.all(
    valueCodes.map((code, position) =>
      createProductOptionValue(database.db, {
        organizationId: organization.id,
        actorId,
        optionAxisId: axis.id,
        code,
        displayValue: code[0]!.toUpperCase() + code.slice(1),
        position,
      }),
    ),
  );
  const variants = await Promise.all(
    values.map((value, index) =>
      createCatalogVariant(database.db, {
        organizationId: organization.id,
        actorId,
        productId: product.id,
        sku: `DRESS-${valueCodes[index]!.toUpperCase()}-${crypto.randomUUID().slice(0, 5)}`,
        title: valueCodes[index]!,
        optionValueIds: [value.id],
      }),
    ),
  );
  const currentProduct = publish
    ? await publishCatalogProduct(database.db, {
        organizationId: organization.id,
        actorId,
        productId: product.id,
        expectedVersion: product.version,
      })
    : product;
  return { organization, actorId, handle, product: currentProduct, axis, values, variants };
}

describe('published Product Variant integrity', () => {
  it('blocks archiving used option values and axes with structured SKU recovery details', async () => {
    const fixture = await productFixture();

    await expect(
      updateProductOptionValue(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        axisId: fixture.axis.id,
        valueId: fixture.values[0]!.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({
      code: 'OPTION_STRUCTURE_IN_USE' satisfies CatalogDomainError['code'],
      details: {
        affectedVariantCount: 1,
        affectedVariants: [expect.objectContaining({ sku: fixture.variants[0]!.sku })],
      },
    });

    await expect(
      updateProductOptionAxis(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        axisId: fixture.axis.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({
      code: 'OPTION_STRUCTURE_IN_USE' satisfies CatalogDomainError['code'],
      details: { affectedVariantCount: 2 },
    });

    await expect(
      createProductOptionAxis(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        code: 'color',
        name: 'Color',
      }),
    ).rejects.toMatchObject({
      code: 'PUBLISHED_VARIANT_INTEGRITY' satisfies CatalogDomainError['code'],
    });

    const otherOrganization = await createOrganization(database.db, {
      code: `variant-tenant-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other tenant',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    await expect(
      updateProductOptionValue(database.db, {
        organizationId: otherOrganization.id,
        actorId: crypto.randomUUID(),
        axisId: fixture.axis.id,
        valueId: fixture.values[0]!.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' satisfies CatalogDomainError['code'] });
  });

  it('allows dependent option values to be archived after Variants are safely deactivated', async () => {
    const fixture = await productFixture();
    const archivedVariant = await updateCatalogVariant(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      productId: fixture.product.id,
      variantId: fixture.variants[0]!.id,
      expectedVersion: fixture.variants[0]!.version,
      status: 'ARCHIVED',
    });
    expect(archivedVariant.version).toBe(fixture.variants[0]!.version + 1);

    await expect(
      updateProductOptionValue(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        axisId: fixture.axis.id,
        valueId: fixture.values[0]!.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ).resolves.toBeUndefined();

    const history = await sql<{ status: string; link_count: string }>`select variant.status,
      (select count(*)::text from catalog.variant_option_values link
        where link.organization_id=variant.organization_id and link.variant_id=variant.id) link_count
      from catalog.product_variants variant where variant.organization_id=${fixture.organization.id}
        and variant.id=${fixture.variants[0]!.id}::uuid`.execute(database.db);
    expect(history.rows[0]).toEqual({ status: 'ARCHIVED', link_count: '1' });
    const audit = await sql<{ count: string }>`select count(*)::text as count
      from audit.audit_events where organization_id=${fixture.organization.id}
        and target_id=${fixture.product.id}::uuid
        and action in ('catalog.product.variants_created','catalog.product.option_value_updated')`.execute(
      database.db,
    );
    const outbox = await sql<{ count: string }>`select count(*)::text as count
      from platform.outbox_events where organization_id=${fixture.organization.id}
        and aggregate_id=${fixture.product.id}::uuid
        and event_type in ('catalog.product.variants_updated','catalog.product.option_structure_updated')`.execute(
      database.db,
    );
    expect(Number(audit.rows[0]?.count)).toBeGreaterThanOrEqual(2);
    expect(Number(outbox.rows[0]?.count)).toBeGreaterThanOrEqual(2);

    await expect(
      updateCatalogVariant(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        variantId: fixture.variants[1]!.id,
        expectedVersion: fixture.variants[1]!.version,
        status: 'ARCHIVED',
      }),
    ).rejects.toMatchObject({
      code: 'PUBLISHED_VARIANT_INTEGRITY' satisfies CatalogDomainError['code'],
    });

    const unpublished = await unpublishCatalogProduct(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      productId: fixture.product.id,
      expectedVersion: fixture.product.version,
    });
    await updateCatalogVariant(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      productId: fixture.product.id,
      variantId: fixture.variants[1]!.id,
      expectedVersion: fixture.variants[1]!.version,
      status: 'ARCHIVED',
    });
    await expect(
      updateProductOptionAxis(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        axisId: fixture.axis.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ).resolves.toBeUndefined();
    const readiness = await getCatalogProductReadiness(
      database.db,
      fixture.organization.id,
      unpublished.id,
    );
    expect(readiness?.readiness.checks).toContainEqual(
      expect.objectContaining({ code: 'ACTIVE_VARIANT', state: 'BLOCKER' }),
    );
  });

  it('serializes publication against option archival so concurrent commands cannot publish invalid state', async () => {
    const fixture = await productFixture(['small'], false);
    const [publication, archival] = await Promise.allSettled([
      publishCatalogProduct(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        expectedVersion: fixture.product.version,
      }),
      updateProductOptionValue(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        axisId: fixture.axis.id,
        valueId: fixture.values[0]!.id,
        expectedVersion: 1,
        status: 'ARCHIVED',
      }),
    ]);

    expect([publication.status, archival.status].sort()).toEqual(['fulfilled', 'rejected']);
    const state = await sql<{ publication_status: string; value_status: string }>`
      select product.publication_status,value.status as value_status
      from catalog.products product
      join catalog.product_option_axes axis on axis.product_id=product.id
      join catalog.product_option_values value on value.option_axis_id=axis.id
      where product.organization_id=${fixture.organization.id} and product.id=${fixture.product.id}::uuid
        and value.id=${fixture.values[0]!.id}::uuid
    `.execute(database.db);
    expect(state.rows[0]).not.toEqual({
      publication_status: 'PUBLISHED',
      value_status: 'ARCHIVED',
    });
    if (publication.status === 'fulfilled')
      expect(archival.status === 'rejected' && archival.reason).toMatchObject({
        code: 'OPTION_STRUCTURE_IN_USE' satisfies CatalogDomainError['code'],
      });
    else
      expect(publication.reason).toMatchObject({
        code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'],
      });
  });

  it('detects legacy inconsistency and excludes it from every public Product projection until restored', async () => {
    const fixture = await productFixture(['small']);
    expect(await rebuildStorefrontSearch(database.db, fixture.organization.id)).toBe(1);
    expect(
      (await searchStorefront(database.db, { organizationId: fixture.organization.id })).total,
    ).toBe(1);

    await sql`update catalog.product_option_values set status='ARCHIVED',version=version+1
      where organization_id=${fixture.organization.id} and id=${fixture.values[0]!.id}::uuid`.execute(
      database.db,
    );

    const readiness = await getCatalogProductReadiness(
      database.db,
      fixture.organization.id,
      fixture.product.id,
    );
    expect(readiness?.readiness).toMatchObject({ state: 'ATTENTION', canPublish: false });
    expect(readiness?.readiness.checks).toContainEqual(
      expect.objectContaining({ code: 'OPTION_COMBINATIONS', state: 'BLOCKER' }),
    );
    await expect(
      getStorefrontCatalogProduct(database.db, fixture.organization.id, fixture.handle),
    ).resolves.toBeUndefined();
    expect(
      await listStorefrontCatalogProducts(database.db, fixture.organization.id),
    ).not.toContainEqual(expect.objectContaining({ id: fixture.product.id }));
    expect(
      (await searchStorefront(database.db, { organizationId: fixture.organization.id })).total,
    ).toBe(0);
    expect(await rebuildStorefrontSearch(database.db, fixture.organization.id)).toBe(0);

    const unpublished = await unpublishCatalogProduct(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      productId: fixture.product.id,
      expectedVersion: fixture.product.version,
    });
    await expect(
      publishCatalogProduct(database.db, {
        organizationId: fixture.organization.id,
        actorId: fixture.actorId,
        productId: fixture.product.id,
        expectedVersion: unpublished.version,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED' satisfies CatalogDomainError['code'],
    });

    await updateProductOptionValue(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      axisId: fixture.axis.id,
      valueId: fixture.values[0]!.id,
      expectedVersion: 2,
      status: 'ACTIVE',
    });
    await publishCatalogProduct(database.db, {
      organizationId: fixture.organization.id,
      actorId: fixture.actorId,
      productId: fixture.product.id,
      expectedVersion: unpublished.version,
    });
    await expect(
      getStorefrontCatalogProduct(database.db, fixture.organization.id, fixture.handle),
    ).resolves.toMatchObject({
      variants: [expect.objectContaining({ sku: fixture.variants[0]!.sku })],
      options: [expect.objectContaining({ values: [expect.objectContaining({ code: 'small' })] })],
    });
  });
});
