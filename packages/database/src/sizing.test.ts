import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createCatalogCategory, createCatalogProduct } from './catalog.js';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  addSizeGuideRow,
  archiveMeasurementDefinition,
  archiveSizeDefinition,
  archiveSizeGuide,
  archiveSizeSystem,
  archiveSizingDomain,
  attachSizeGuideToProduct,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeGuide,
  createSizeGuideRevision,
  createSizeSystem,
  createSizingDomain,
  duplicateSizeGuide,
  getAdminSizingWorkspace,
  getProductSizingConfiguration,
  getPublicSizeGuideForProduct,
  getSizeGuideDetail,
  getSizingQualityChecks,
  listCategorySizeGuideDefaults,
  publishSizeGuideRevision,
  removeProductSizingConfiguration,
  removeSizeGuideMeasurement,
  removeSizeGuideRow,
  reorderSizeGuideRows,
  restoreMeasurementDefinition,
  restoreSizeDefinition,
  restoreSizeGuide,
  restoreSizeSystem,
  restoreSizingDomain,
  setCategoryDefaultSizeGuide,
  setSizeGuideMeasurement,
  setSizeGuideMeasurementsBulk,
  updateSizeGuide,
  updateSizeGuideRevisionMeta,
  updateSizeGuideRow,
} from './sizing.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function createTestOrganization(prefix: string): Promise<{
  organizationId: string;
  actorId: string;
}> {
  const organization = await createOrganization(database.db, {
    code: `${prefix}-${crypto.randomUUID().slice(0, 10)}`,
    displayName: prefix,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });

  const email = `${prefix}-${crypto.randomUUID()}@test.local`;
  const user = await sql<{ id: string }>`
    insert into iam.users (name, email, email_normalized)
    values (${`${prefix} User`}, ${email}, ${email})
    returning id::text
  `.execute(database.db);

  return {
    organizationId: organization.id,
    actorId: user.rows[0]!.id,
  };
}

async function createTestProduct(
  organizationId: string,
  actorId: string,
  prefix: string,
): Promise<{ id: string }> {
  const type = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (
      ${organizationId},
      ${`${prefix}-${crypto.randomUUID().slice(0, 8)}`},
      ${`${prefix} Product Type`}
    )
    returning id::text
  `.execute(database.db);

  return createCatalogProduct(database.db, {
    organizationId,
    actorId,
    productTypeId: type.rows[0]!.id,
    title: `${prefix} Product`,
    handle: `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 8)}`,
  });
}

async function getRevisionVersion(revisionId: string): Promise<number> {
  const result = await sql<{ version: string }>`
    select version::text
    from sizing.size_guide_revisions
    where id = ${revisionId}
  `.execute(database.db);

  if (!result.rows[0]) {
    throw new Error(`Revision ${revisionId} was not found.`);
  }

  return Number(result.rows[0].version);
}

async function getGuideVersion(guideId: string): Promise<number> {
  const result = await sql<{ version: string }>`
    select version::text
    from sizing.size_guides
    where id = ${guideId}
  `.execute(database.db);

  if (!result.rows[0]) {
    throw new Error(`Guide ${guideId} was not found.`);
  }

  return Number(result.rows[0].version);
}

async function getProductVersion(productId: string): Promise<number> {
  const result = await sql<{ version: string }>`
    select version::text
    from catalog.products
    where id = ${productId}
  `.execute(database.db);

  if (!result.rows[0]) {
    throw new Error(`Product ${productId} was not found.`);
  }

  return Number(result.rows[0].version);
}

describe('revisioned sizing', () => {
  it('publishes a system-bound guide, keeps published revisions immutable, clones the published revision, and protects live dependencies', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Core');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'garment',
      name: 'Garment',
      subjectType: 'GARMENT',
      actorId,
    });

    const system = await createSizeSystem(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'intl',
      name: 'International',
      actorId,
    });

    const definition = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 'm',
      label: 'M',
      actorId,
    });

    const measurement = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'chest',
      name: 'Chest',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Dress guide',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
    });

    const row = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 0,
      displayLabel: 'M',
      position: 0,
      sizeDefinitionId: definition.id,
      actorId,
    });

    expect(row.version).toBe(1);

    await setSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: row.id,
      measurementDefinitionId: measurement.id,
      expectedVersion: row.version,
      unitCode: 'cm',
      exact: '92',
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(2);

    await publishSizeGuideRevision(database.db, {
      organizationId,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
      expectedVersion: 2,
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(3);

    await expect(
      addSizeGuideRow(database.db, {
        organizationId,
        revisionId: guide.revisionId,
        expectedVersion: 3,
        displayLabel: 'L',
        position: 1,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'PUBLISHED_REVISION_IMMUTABLE',
    });

    const next = await createSizeGuideRevision(database.db, {
      organizationId,
      sizeGuideId: guide.id,
      actorId,
    });

    expect(next).toMatchObject({
      revisionNumber: 2,
      version: 0,
    });

    const clonedDetail = await getSizeGuideDetail(database.db, organizationId, guide.id);
    const clonedDraft = clonedDetail?.revisions.find((revision) => revision.id === next.id);

    expect(clonedDraft?.rows).toHaveLength(1);
    expect(clonedDraft?.rows[0]).toMatchObject({
      displayLabel: 'M',
      sizeDefinitionId: definition.id,
      measurements: [
        expect.objectContaining({
          measurementDefinitionId: measurement.id,
          exact: '92.000',
        }),
      ],
    });

    await expect(
      createSizeGuideRevision(database.db, {
        organizationId,
        sizeGuideId: guide.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'DRAFT_ALREADY_EXISTS',
    });

    const workspace = await getAdminSizingWorkspace(database.db, organizationId);
    const listedGuide = workspace.guides.find((candidate) => candidate.id === guide.id);

    expect(listedGuide).toMatchObject({
      name: 'Dress guide',
      sizeSystemId: system.id,
      currentPublishedRevisionId: guide.revisionId,
    });

    expect(listedGuide?.revisions.map((revision) => revision.status)).toEqual([
      'DRAFT',
      'PUBLISHED',
    ]);

    const product = await createTestProduct(organizationId, actorId, 'Sized Dress');
    const productVersionBeforeAttach = await getProductVersion(product.id);

    await attachSizeGuideToProduct(database.db, {
      organizationId,
      productId: product.id,
      sizeSystemId: system.id,
      sizeGuideId: guide.id,
      expectedProductVersion: productVersionBeforeAttach,
      actorId,
    });

    const configured = await getProductSizingConfiguration(database.db, organizationId, product.id);

    expect(configured).toMatchObject({
      configured: true,
      sizeSystemId: system.id,
      sizeGuideId: guide.id,
      sizeGuideSystemId: system.id,
      hasPublishedGuide: true,
      productVersion: productVersionBeforeAttach + 1,
    });

    await expect(
      archiveSizeGuide(database.db, {
        organizationId,
        id: guide.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });

    await removeProductSizingConfiguration(database.db, {
      organizationId,
      productId: product.id,
      expectedProductVersion: productVersionBeforeAttach + 1,
      actorId,
    });

    await archiveSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      actorId,
    });

    await expect(
      getProductSizingConfiguration(database.db, organizationId, product.id),
    ).resolves.toMatchObject({
      configured: false,
      sizeSystemId: null,
      sizeGuideId: null,
    });

    await restoreSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      actorId,
    });

    await expect(
      archiveSizeSystem(database.db, {
        organizationId,
        id: system.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });
  });

  it('rejects cross-tenant parent IDs and size-definition mappings from a different system', async () => {
    const owner = await createTestOrganization('Sizing Owner');
    const other = await createTestOrganization('Sizing Other');

    const domain = await createSizingDomain(database.db, {
      organizationId: owner.organizationId,
      code: 'owner-garment',
      name: 'Owner garment',
      subjectType: 'GARMENT',
      actorId: owner.actorId,
    });

    await expect(
      createSizeSystem(database.db, {
        organizationId: other.organizationId,
        sizingDomainId: domain.id,
        code: 'forbidden-system',
        name: 'Forbidden system',
        actorId: other.actorId,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await expect(
      createMeasurementDefinition(database.db, {
        organizationId: other.organizationId,
        sizingDomainId: domain.id,
        code: 'forbidden-measurement',
        name: 'Forbidden measurement',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
        actorId: other.actorId,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await expect(
      createSizeGuide(database.db, {
        organizationId: other.organizationId,
        actorId: other.actorId,
        name: 'Forbidden guide',
        sizingDomainId: domain.id,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const primarySystem = await createSizeSystem(database.db, {
      organizationId: owner.organizationId,
      sizingDomainId: domain.id,
      code: 'alpha',
      name: 'Alpha',
      actorId: owner.actorId,
    });

    const otherSystem = await createSizeSystem(database.db, {
      organizationId: owner.organizationId,
      sizingDomainId: domain.id,
      code: 'numeric',
      name: 'Numeric',
      actorId: owner.actorId,
    });

    const wrongDefinition = await createSizeDefinition(database.db, {
      organizationId: owner.organizationId,
      sizeSystemId: otherSystem.id,
      code: '38',
      label: '38',
      actorId: owner.actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId: owner.organizationId,
      actorId: owner.actorId,
      name: 'Alpha Guide',
      sizingDomainId: domain.id,
      sizeSystemId: primarySystem.id,
    });

    await expect(
      addSizeGuideRow(database.db, {
        organizationId: owner.organizationId,
        revisionId: guide.revisionId,
        expectedVersion: 0,
        displayLabel: '38',
        position: 0,
        sizeDefinitionId: wrongDefinition.id,
        actorId: owner.actorId,
      }),
    ).rejects.toMatchObject({
      code: 'SYSTEM_MISMATCH',
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(0);
    expect((await getAdminSizingWorkspace(database.db, other.organizationId)).domains).toEqual([]);
    expect((await getAdminSizingWorkspace(database.db, owner.organizationId)).domains).toEqual([
      expect.objectContaining({
        id: domain.id,
        name: 'Owner garment',
      }),
    ]);
  });

  it('supports atomic bulk matrix editing, optimistic concurrency, row editing, reordering, measurement clearing, and cascade row removal', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Matrix');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'matrix-domain',
      name: 'Matrix Garment',
      subjectType: 'GARMENT',
      actorId,
    });

    const system = await createSizeSystem(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'matrix-alpha',
      name: 'Matrix Alpha',
      actorId,
    });

    const sizeS = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 's',
      label: 'S',
      sortOrder: 0,
      actorId,
    });

    const sizeM = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 'm',
      label: 'M',
      sortOrder: 1,
      actorId,
    });

    const chest = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'matrix-chest',
      name: 'Chest',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      sortOrder: 0,
      actorId,
    });

    const waist = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'matrix-waist',
      name: 'Waist',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      sortOrder: 1,
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Matrix Guide',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
    });

    const small = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 0,
      displayLabel: 'S',
      position: 0,
      sizeDefinitionId: sizeS.id,
      actorId,
    });

    const medium = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: small.version,
      displayLabel: 'M',
      position: 1,
      sizeDefinitionId: sizeM.id,
      actorId,
    });

    expect(medium.version).toBe(2);

    await setSizeGuideMeasurementsBulk(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 2,
      actorId,
      changes: [
        {
          operation: 'SET',
          rowId: small.id,
          measurementDefinitionId: chest.id,
          unitCode: 'cm',
          exact: '90',
        },
        {
          operation: 'SET',
          rowId: small.id,
          measurementDefinitionId: waist.id,
          unitCode: 'cm',
          min: '68',
          max: '72',
        },
        {
          operation: 'SET',
          rowId: medium.id,
          measurementDefinitionId: chest.id,
          unitCode: 'cm',
          exact: '96',
        },
        {
          operation: 'SET',
          rowId: medium.id,
          measurementDefinitionId: waist.id,
          unitCode: 'cm',
          min: '74',
          max: '78',
          isApproximate: true,
        },
      ],
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(3);

    await updateSizeGuideRevisionMeta(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 3,
      instructions: 'Measure over light clothing.',
      fitNotes: 'Regular fit.',
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(4);

    await expect(
      setSizeGuideMeasurement(database.db, {
        organizationId,
        revisionId: guide.revisionId,
        rowId: small.id,
        measurementDefinitionId: chest.id,
        expectedVersion: 3,
        unitCode: 'cm',
        exact: '91',
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });

    await expect(
      setSizeGuideMeasurement(database.db, {
        organizationId,
        revisionId: guide.revisionId,
        rowId: small.id,
        measurementDefinitionId: chest.id,
        expectedVersion: 4,
        unitCode: 'cm',
        min: '100',
        max: '90',
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(4);

    await expect(
      setSizeGuideMeasurementsBulk(database.db, {
        organizationId,
        revisionId: guide.revisionId,
        expectedVersion: 4,
        actorId,
        changes: [
          {
            operation: 'SET',
            rowId: small.id,
            measurementDefinitionId: chest.id,
            unitCode: 'cm',
            exact: '95',
          },
          {
            operation: 'SET',
            rowId: medium.id,
            measurementDefinitionId: crypto.randomUUID(),
            unitCode: 'cm',
            exact: '99',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'DOMAIN_MISMATCH',
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(4);

    let detail = await getSizeGuideDetail(database.db, organizationId, guide.id);
    let draft = detail?.revisions.find((revision) => revision.id === guide.revisionId);
    const smallRow = draft?.rows.find((row) => row.id === small.id);

    expect(smallRow?.measurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurementDefinitionId: chest.id,
          exact: '90.000',
        }),
      ]),
    );

    await reorderSizeGuideRows(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 4,
      rows: [
        { rowId: medium.id, position: 0 },
        { rowId: small.id, position: 1 },
      ],
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(5);

    await updateSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: medium.id,
      expectedVersion: 5,
      displayLabel: 'Medium',
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(6);

    await removeSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: small.id,
      measurementDefinitionId: waist.id,
      expectedVersion: 6,
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(7);

    await removeSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: small.id,
      expectedVersion: 7,
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(8);

    const removedMeasurementCount = await sql<{ count: string }>`
      select count(*)::text as count
      from sizing.size_guide_measurements
      where row_id = ${small.id}
        and organization_id = ${organizationId}
    `.execute(database.db);

    expect(removedMeasurementCount.rows[0]!.count).toBe('0');

    detail = await getSizeGuideDetail(database.db, organizationId, guide.id);
    draft = detail?.revisions.find((revision) => revision.id === guide.revisionId);

    expect(draft).toMatchObject({
      version: 8,
      instructions: 'Measure over light clothing.',
      fitNotes: 'Regular fit.',
    });

    expect(draft?.rows).toEqual([
      expect.objectContaining({
        id: medium.id,
        displayLabel: 'Medium',
        position: 0,
      }),
    ]);
  });

  it('refuses to publish while any row is missing a measurement and then publishes after the matrix is complete', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Publish');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'publish-domain',
      name: 'Publish Domain',
      subjectType: 'GARMENT',
      actorId,
    });

    const system = await createSizeSystem(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'publish-system',
      name: 'Publish System',
      actorId,
    });

    const smallDefinition = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 's',
      label: 'S',
      actorId,
    });

    const mediumDefinition = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 'm',
      label: 'M',
      actorId,
    });

    const bust = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'bust',
      name: 'Bust',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Completeness Guide',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
    });

    const small = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 0,
      displayLabel: 'S',
      position: 0,
      sizeDefinitionId: smallDefinition.id,
      actorId,
    });

    const medium = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: small.version,
      displayLabel: 'M',
      position: 1,
      sizeDefinitionId: mediumDefinition.id,
      actorId,
    });

    await setSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: small.id,
      measurementDefinitionId: bust.id,
      expectedVersion: medium.version,
      unitCode: 'cm',
      exact: '88',
      actorId,
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(3);

    await expect(
      publishSizeGuideRevision(database.db, {
        organizationId,
        sizeGuideId: guide.id,
        revisionId: guide.revisionId,
        expectedVersion: 3,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(await getRevisionVersion(guide.revisionId)).toBe(3);

    await setSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: medium.id,
      measurementDefinitionId: bust.id,
      expectedVersion: 3,
      unitCode: 'cm',
      exact: '94',
      actorId,
    });

    await publishSizeGuideRevision(database.db, {
      organizationId,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
      expectedVersion: 4,
      actorId,
    });

    const detail = await getSizeGuideDetail(database.db, organizationId, guide.id);

    expect(detail).toMatchObject({
      currentPublishedRevisionId: guide.revisionId,
    });

    expect(detail?.revisions[0]).toMatchObject({
      id: guide.revisionId,
      status: 'PUBLISHED',
      version: 5,
    });

    const quality = await getSizingQualityChecks(database.db, organizationId);
    expect(quality.publishedRowsWithoutMeasurements).toBe(0);
    expect(quality.publishedRevisionsWithEmptyRows).toBe(0);
    expect(quality.guideRowsWithSystemMismatch).toBe(0);
  });

  it('archives and restores the sizing hierarchy in dependency-safe order', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Lifecycle');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'lifecycle-domain',
      name: 'Lifecycle Domain',
      subjectType: 'PRODUCT',
      actorId,
    });

    const system = await createSizeSystem(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'lifecycle-system',
      name: 'Lifecycle System',
      actorId,
    });

    const definition = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 'one',
      label: 'One',
      actorId,
    });

    const measurement = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'width',
      name: 'Width',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Lifecycle Guide',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
    });

    await archiveSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      actorId,
    });

    await archiveSizeDefinition(database.db, {
      organizationId,
      id: definition.id,
      actorId,
    });

    await archiveMeasurementDefinition(database.db, {
      organizationId,
      id: measurement.id,
      actorId,
    });

    await archiveSizeSystem(database.db, {
      organizationId,
      id: system.id,
      actorId,
    });

    await archiveSizingDomain(database.db, {
      organizationId,
      id: domain.id,
      actorId,
    });

    await expect(
      restoreSizeSystem(database.db, {
        organizationId,
        id: system.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });

    await expect(
      restoreSizeGuide(database.db, {
        organizationId,
        id: guide.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });

    await restoreSizingDomain(database.db, {
      organizationId,
      id: domain.id,
      actorId,
    });

    await expect(
      restoreSizeGuide(database.db, {
        organizationId,
        id: guide.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'SYSTEM_MISMATCH',
    });

    await restoreSizeSystem(database.db, {
      organizationId,
      id: system.id,
      actorId,
    });

    await restoreSizeDefinition(database.db, {
      organizationId,
      id: definition.id,
      actorId,
    });

    await restoreMeasurementDefinition(database.db, {
      organizationId,
      id: measurement.id,
      actorId,
    });

    await restoreSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      actorId,
    });

    const workspace = await getAdminSizingWorkspace(database.db, organizationId);

    expect(workspace.domains.find((item) => item.id === domain.id)?.status).toBe('ACTIVE');
    expect(workspace.systems.find((item) => item.id === system.id)?.status).toBe('ACTIVE');
    expect(
      workspace.sizeDefinitions.find((item) => item.id === definition.id)?.status,
    ).toBe('ACTIVE');
    expect(
      workspace.measurementDefinitions.find((item) => item.id === measurement.id)?.status,
    ).toBe('ACTIVE');
    expect(workspace.guides.find((item) => item.id === guide.id)?.status).toBe('ACTIVE');
  });

  it('duplicates a guide with its system binding, revision metadata, rows, and measurements', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Duplicate');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'duplicate-domain',
      name: 'Duplicate Domain',
      subjectType: 'GARMENT',
      actorId,
    });

    const system = await createSizeSystem(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'duplicate-system',
      name: 'Duplicate System',
      actorId,
    });

    const definition = await createSizeDefinition(database.db, {
      organizationId,
      sizeSystemId: system.id,
      code: 'l',
      label: 'L',
      actorId,
    });

    const measurement = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'duplicate-chest',
      name: 'Chest',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Original Guide',
      description: 'Original description',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
    });

    const row = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 0,
      displayLabel: 'L',
      position: 0,
      sizeDefinitionId: definition.id,
      actorId,
    });

    await setSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: row.id,
      measurementDefinitionId: measurement.id,
      expectedVersion: row.version,
      unitCode: 'cm',
      exact: '100',
      actorId,
    });

    await updateSizeGuideRevisionMeta(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 2,
      instructions: 'Use a soft tape.',
      fitNotes: 'Relaxed fit.',
      actorId,
    });

    await publishSizeGuideRevision(database.db, {
      organizationId,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
      expectedVersion: 3,
      actorId,
    });

    const duplicated = await duplicateSizeGuide(database.db, {
      organizationId,
      actorId,
      id: guide.id,
      name: 'Duplicated Guide',
    });

    expect(duplicated.id).not.toBe(guide.id);

    const detail = await getSizeGuideDetail(database.db, organizationId, duplicated.id);

    expect(detail).toMatchObject({
      name: 'Duplicated Guide',
      description: 'Original description',
      sizingDomainId: domain.id,
      sizeSystemId: system.id,
      currentPublishedRevisionId: null,
    });

    expect(detail?.revisions).toHaveLength(1);
    expect(detail?.revisions[0]).toMatchObject({
      id: duplicated.revisionId,
      revisionNumber: 1,
      status: 'DRAFT',
      version: 0,
      instructions: 'Use a soft tape.',
      fitNotes: 'Relaxed fit.',
    });

    expect(detail?.revisions[0]?.rows[0]).toMatchObject({
      displayLabel: 'L',
      sizeDefinitionId: definition.id,
      measurements: [
        expect.objectContaining({
          measurementDefinitionId: measurement.id,
          exact: '100.000',
        }),
      ],
    });
  });

  it('uses a published category default as the storefront fallback and blocks archival until the category is unlinked', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Category');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'category-domain',
      name: 'Category Domain',
      subjectType: 'GARMENT',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Category Default Guide',
      sizingDomainId: domain.id,
    });

    const measurement = await createMeasurementDefinition(database.db, {
      organizationId,
      sizingDomainId: domain.id,
      code: 'category-bust',
      name: 'Bust',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      sortOrder: 0,
      actorId,
    });

    const row = await addSizeGuideRow(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      expectedVersion: 0,
      displayLabel: 'M',
      position: 0,
      actorId,
    });

    await setSizeGuideMeasurement(database.db, {
      organizationId,
      revisionId: guide.revisionId,
      rowId: row.id,
      measurementDefinitionId: measurement.id,
      expectedVersion: row.version,
      unitCode: 'cm',
      exact: '90',
      actorId,
    });

    await publishSizeGuideRevision(database.db, {
      organizationId,
      sizeGuideId: guide.id,
      revisionId: guide.revisionId,
      expectedVersion: 2,
      actorId,
    });

    const category = await createCatalogCategory(database.db, {
      organizationId,
      handle: 'tops',
      name: 'Tops',
    });

    await setCategoryDefaultSizeGuide(database.db, {
      organizationId,
      categoryId: category.id,
      sizeGuideId: guide.id,
      actorId,
    });

    const product = await createTestProduct(organizationId, actorId, 'Basic Tee');

    await sql`
      insert into catalog.product_categories (
        organization_id,
        product_id,
        category_id
      )
      values (
        ${organizationId},
        ${product.id},
        ${category.id}
      )
    `.execute(database.db);

    const publicGuide = await getPublicSizeGuideForProduct(
      database.db,
      organizationId,
      product.id,
    );

    expect(publicGuide).toMatchObject({
      name: 'Category Default Guide',
      rows: [
        expect.objectContaining({
          label: 'M',
          measurements: [
            expect.objectContaining({
              name: 'Bust',
              exact: '90.000',
              unit: 'cm',
            }),
          ],
        }),
      ],
    });

    const defaults = await listCategorySizeGuideDefaults(database.db, {
      organizationId,
      page: 1,
      pageSize: 20,
      mappingStatus: 'MAPPED',
      search: 'tops',
    });

    expect(defaults.totalItems).toBe(1);
    expect(defaults.items).toEqual([
      expect.objectContaining({
        categoryId: category.id,
        categoryName: 'Tops',
        sizeGuideId: guide.id,
        sizeGuideName: 'Category Default Guide',
        sizeGuideStatus: 'ACTIVE',
        hasPublishedGuide: true,
      }),
    ]);

    await expect(
      archiveSizeGuide(database.db, {
        organizationId,
        id: guide.id,
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'DEPENDENCY_EXISTS',
    });

    await setCategoryDefaultSizeGuide(database.db, {
      organizationId,
      categoryId: category.id,
      sizeGuideId: null,
      actorId,
    });

    await archiveSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      actorId,
    });

    await expect(
      getPublicSizeGuideForProduct(database.db, organizationId, product.id),
    ).resolves.toBeNull();
  });

  it('enforces optimistic guide versions when editing guide metadata', async () => {
    const { organizationId, actorId } = await createTestOrganization('Sizing Guide Version');

    const domain = await createSizingDomain(database.db, {
      organizationId,
      code: 'guide-version-domain',
      name: 'Guide Version Domain',
      subjectType: 'BODY',
      actorId,
    });

    const guide = await createSizeGuide(database.db, {
      organizationId,
      actorId,
      name: 'Versioned Guide',
      sizingDomainId: domain.id,
    });

    const initialVersion = await getGuideVersion(guide.id);
    expect(initialVersion).toBe(1);

    await updateSizeGuide(database.db, {
      organizationId,
      id: guide.id,
      expectedVersion: initialVersion,
      name: 'Versioned Guide v2',
      actorId,
    });

    expect(await getGuideVersion(guide.id)).toBe(initialVersion + 1);

    await expect(
      updateSizeGuide(database.db, {
        organizationId,
        id: guide.id,
        expectedVersion: initialVersion,
        description: 'Stale write',
        actorId,
      }),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });

    const detail = await getSizeGuideDetail(database.db, organizationId, guide.id);

    expect(detail).toMatchObject({
      name: 'Versioned Guide v2',
      description: null,
      version: initialVersion + 1,
    });
  });
});
