import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createCatalogProduct } from './catalog.js';
import { createOrganization } from './platform.js';
import {
  addSizeGuideRow,
  attachSizeGuideToProduct,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeGuide,
  createSizeGuideRevision,
  createSizeSystem,
  createSizingDomain,
  getAdminSizingWorkspace,
  publishSizeGuideRevision,
  setSizeGuideMeasurement,
  duplicateSizeGuide,
  removeSizeGuideRow,
  setCategoryDefaultSizeGuide,
  getPublicSizeGuideForProduct,
} from './sizing.js';
import { createCatalogCategory } from './catalog.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});
afterAll(async () => database.close());

describe('revisioned sizing', () => {
  it('keeps a published guide immutable and only attaches a published guide to a product', async () => {
    const organization = await createOrganization(database.db, {
      code: `sizing-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Sizing',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const user = await sql<{
      id: string;
    }>`insert into iam.users (name, email, email_normalized) values ('Sizing User', ${`sizing-${crypto.randomUUID()}@test.local`}, ${`sizing-${crypto.randomUUID()}@test.local`}) returning id`.execute(
      database.db,
    );
    const actorId = user.rows[0]!.id;
    const domain = await createSizingDomain(database.db, {
      organizationId: organization.id,
      code: 'garment',
      name: 'Garment',
      subjectType: 'GARMENT',
    });
    const system = await createSizeSystem(database.db, {
      organizationId: organization.id,
      sizingDomainId: domain.id,
      code: 'intl',
      name: 'International',
    });
    const definition = await createSizeDefinition(database.db, {
      organizationId: organization.id,
      sizeSystemId: system.id,
      code: 'm',
      label: 'M',
    });
    const measurement = await createMeasurementDefinition(database.db, {
      organizationId: organization.id,
      sizingDomainId: domain.id,
      code: 'chest',
      name: 'Chest',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
    });
    const guide = await createSizeGuide(database.db, {
      organizationId: organization.id,
      actorId,
      name: 'Dress guide',
      sizingDomainId: domain.id,
    });
    const row = await addSizeGuideRow(database.db, {
      organizationId: organization.id,
      revisionId: guide.revisionId,
      displayLabel: 'M',
      position: 0,
      sizeDefinitionId: definition.id,
    });
    await setSizeGuideMeasurement(database.db, {
      organizationId: organization.id,
      revisionId: guide.revisionId,
      rowId: row.id,
      measurementDefinitionId: measurement.id,
      unitCode: 'cm',
      exact: '92',
    });
    await publishSizeGuideRevision(database.db, {
      organizationId: organization.id,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
    });
    await expect(
      addSizeGuideRow(database.db, {
        organizationId: organization.id,
        revisionId: guide.revisionId,
        displayLabel: 'L',
        position: 1,
      }),
    ).rejects.toMatchObject({ code: 'IMMUTABLE_REVISION' });
    const next = await createSizeGuideRevision(database.db, {
      organizationId: organization.id,
      sizeGuideId: guide.id,
      actorId,
    });
    expect(next.revisionNumber).toBe(2);

    const type = await sql<{
      id: string;
    }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, 'dress', 'Dress') returning id`.execute(
      database.db,
    );
    const product = await createCatalogProduct(database.db, {
      organizationId: organization.id,
      actorId,
      productTypeId: type.rows[0]!.id,
      title: 'Sized dress',
      handle: `sized-${crypto.randomUUID().slice(0, 8)}`,
    });
    await attachSizeGuideToProduct(database.db, {
      organizationId: organization.id,
      productId: product.id,
      sizeSystemId: system.id,
      sizeGuideId: guide.id,
    });
    const attached = await sql<{
      count: string;
    }>`select count(*)::text as count from sizing.product_size_configurations where product_id = ${product.id} and size_guide_id = ${guide.id}`.execute(
      database.db,
    );
    expect(attached.rows[0]!.count).toBe('1');

    const workspace = await getAdminSizingWorkspace(database.db, organization.id);
    const listedGuide = workspace.guides.find((candidate) => candidate.id === guide.id);
    expect(listedGuide).toMatchObject({
      name: 'Dress guide',
      currentPublishedRevisionId: guide.revisionId,
    });
    expect(listedGuide?.revisions.map((revision) => revision.status)).toEqual([
      'DRAFT',
      'PUBLISHED',
    ]);
    expect(listedGuide?.revisions[1]?.rows[0]).toMatchObject({
      displayLabel: 'M',
      measurements: [
        expect.objectContaining({ measurementDefinitionId: measurement.id, exact: '92.000000' }),
      ],
    });
    expect(workspace.productConfigurations).toEqual([
      expect.objectContaining({ productId: product.id, sizeGuideId: guide.id }),
    ]);
  });

  it('rejects cross-tenant parent IDs and keeps Admin read models isolated', async () => {
    const owner = await createOrganization(database.db, {
      code: `sizing-owner-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Sizing owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const other = await createOrganization(database.db, {
      code: `sizing-other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Sizing other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const domain = await createSizingDomain(database.db, {
      organizationId: owner.id,
      code: 'owner-garment',
      name: 'Owner garment',
      subjectType: 'GARMENT',
    });
    await expect(
      createSizeSystem(database.db, {
        organizationId: other.id,
        sizingDomainId: domain.id,
        code: 'forbidden-system',
        name: 'Forbidden system',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      createMeasurementDefinition(database.db, {
        organizationId: other.id,
        sizingDomainId: domain.id,
        code: 'forbidden-measurement',
        name: 'Forbidden measurement',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      createSizeGuide(database.db, {
        organizationId: other.id,
        actorId: crypto.randomUUID(),
        name: 'Forbidden guide',
        sizingDomainId: domain.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getAdminSizingWorkspace(database.db, other.id)).domains).toEqual([]);
    expect((await getAdminSizingWorkspace(database.db, owner.id)).domains).toEqual([
      expect.objectContaining({ id: domain.id, name: 'Owner garment' }),
    ]);
  });

  it('can duplicate an existing size guide and its contents', async () => {
    const organization = await createOrganization(database.db, {
      code: `sizing-dup-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Sizing Dup',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const user1 = await sql<{ id: string }>`
      insert into iam.users (name, email, email_normalized)
      values ('Sizing Dup User', ${`sizing-dup-${crypto.randomUUID()}@test.local`}, ${`sizing-dup-${crypto.randomUUID()}@test.local`})
      returning id
    `.execute(database.db);
    const actorId = user1.rows[0]!.id;
    const domain = await createSizingDomain(database.db, {
      organizationId: organization.id,
      code: 'garment-dup',
      name: 'Garment',
      subjectType: 'GARMENT',
    });
    const guide = await createSizeGuide(database.db, {
      organizationId: organization.id,
      actorId,
      name: 'Original Guide',
      sizingDomainId: domain.id,
    });
    await addSizeGuideRow(database.db, {
      organizationId: organization.id,
      revisionId: guide.revisionId,
      displayLabel: 'L',
      position: 0,
    });
    const duplicated = await duplicateSizeGuide(database.db, {
      organizationId: organization.id,
      actorId,
      id: guide.id,
      name: 'Duplicated Guide',
    });
    expect(duplicated.id).not.toBe(guide.id);
    const workspace = await getAdminSizingWorkspace(database.db, organization.id);
    const dupGuide = workspace.guides.find((g) => g.id === duplicated.id);
    expect(dupGuide?.name).toBe('Duplicated Guide');
    expect(dupGuide?.revisions[0]?.rows).toHaveLength(1);
    expect(dupGuide?.revisions[0]?.rows[0]?.displayLabel).toBe('L');
  });

  it('can set and retrieve a category default size guide', async () => {
    const organization = await createOrganization(database.db, {
      code: `sizing-cat-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Sizing Cat',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const user2 = await sql<{ id: string }>`
      insert into iam.users (name, email, email_normalized)
      values ('Sizing Cat User', ${`sizing-cat-${crypto.randomUUID()}@test.local`}, ${`sizing-cat-${crypto.randomUUID()}@test.local`})
      returning id
    `.execute(database.db);
    const actorId = user2.rows[0]!.id;
    const domain = await createSizingDomain(database.db, {
      organizationId: organization.id,
      code: 'garment-cat',
      name: 'Garment',
      subjectType: 'GARMENT',
    });
    const guide = await createSizeGuide(database.db, {
      organizationId: organization.id,
      actorId,
      name: 'Category Default Guide',
      sizingDomainId: domain.id,
    });
    const measurement = await createMeasurementDefinition(database.db, {
      organizationId: organization.id,
      sizingDomainId: domain.id,
      code: 'bust-cat',
      name: 'Bust',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      sortOrder: 0,
    });
    const row = await addSizeGuideRow(database.db, {
      organizationId: organization.id,
      revisionId: guide.revisionId,
      displayLabel: 'M',
      position: 0,
    });
    await setSizeGuideMeasurement(database.db, {
      organizationId: organization.id,
      revisionId: guide.revisionId,
      rowId: row.id,
      measurementDefinitionId: measurement.id,
      unitCode: 'cm',
      exact: '90',
    });
    await publishSizeGuideRevision(database.db, {
      organizationId: organization.id,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
      actorId,
    });
    const category = await createCatalogCategory(database.db, {
      organizationId: organization.id,
      actorId,
      handle: 'tops',
      name: 'Tops',
      position: 1,
    });
    await setCategoryDefaultSizeGuide(database.db, {
      organizationId: organization.id,
      categoryId: category.id,
      sizeGuideId: guide.id,
      actorId,
    });
    const type = await sql<{ id: string }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, 'tee', 'Tee') returning id`.execute(database.db);
    const product = await createCatalogProduct(database.db, {
      organizationId: organization.id,
      actorId,
      productTypeId: type.rows[0]!.id,
      title: 'Basic Tee',
      handle: `tee-${crypto.randomUUID().slice(0, 8)}`,
    });
    await sql`insert into catalog.product_categories (organization_id, product_id, category_id) values (${organization.id}, ${product.id}, ${category.id})`.execute(database.db);
    
    const publicGuide = await getPublicSizeGuideForProduct(
      database.db,
      organization.id,
      product.id,
    );
    expect(publicGuide).toMatchObject({ name: 'Category Default Guide' });
  });
});
