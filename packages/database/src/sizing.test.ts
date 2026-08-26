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
} from './sizing.js';

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
});
