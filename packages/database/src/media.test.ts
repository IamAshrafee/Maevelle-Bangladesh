import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import {
  createCatalogProduct,
  createCatalogVariant,
  getCatalogProductWorkspace,
  createProductOptionAxis,
  createProductOptionValue,
} from './catalog.js';
import {
  archiveMediaAsset,
  attachMediaToProduct,
  bulkOrganizeMediaAssets,
  bulkTrashMediaAssets,
  createMediaFolder,
  createMediaTag,
  detachMediaFromProduct,
  findMediaAsset,
  listMediaHealthIssues,
  listMediaLibrary,
  organizeMediaAsset,
  registerUploadedMedia,
  replaceProductMediaAsset,
  restoreTrashedMediaAsset,
  syncProductMediaPlacements,
  trashUnusedMediaAsset,
  updateMediaAssetMetadata,
} from './media.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});
afterAll(async () => database.close());

describe('media tenant ownership', () => {
  it('manages one primary gallery per Variant and rejects a Variant from another Product', async () => {
    const owner = await createOrganization(database.db, {
      code: `variant-media-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Variant media owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${owner.id},'dress','Dress') returning id::text`.execute(
      database.db,
    );
    const products = await Promise.all(
      ['Primary dress', 'Other dress'].map((title, index) =>
        createCatalogProduct(database.db, {
          organizationId: owner.id,
          actorId: crypto.randomUUID(),
          productTypeId: productType.rows[0]!.id,
          title,
          handle: `variant-media-${index}-${crypto.randomUUID().slice(0, 8)}`,
        }),
      ),
    );
    const variants = await Promise.all(
      products.map((product, index) =>
        createCatalogVariant(database.db, {
          organizationId: owner.id,
          productId: product.id,
          sku: `VARIANT-MEDIA-${index}-${crypto.randomUUID().slice(0, 6)}`,
          optionValueIds: [],
        }),
      ),
    );
    const assets = await Promise.all(
      ['e', 'f'].map((checksum) =>
        registerUploadedMedia(database.db, {
          organizationId: owner.id,
          objectKey: `images/${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          byteSize: 100,
          checksumSha256: checksum.repeat(64),
          visibility: 'PUBLIC',
        }),
      ),
    );

    await attachMediaToProduct(database.db, {
      organizationId: owner.id,
      productId: products[0]!.id,
      variantId: variants[0]!.id,
      assetId: assets[0]!.id,
      role: 'GALLERY',
      isPrimary: true,
    });
    await attachMediaToProduct(database.db, {
      organizationId: owner.id,
      productId: products[0]!.id,
      variantId: variants[0]!.id,
      assetId: assets[1]!.id,
      role: 'GALLERY',
      isPrimary: true,
      position: 1,
    });
    await expect(
      attachMediaToProduct(database.db, {
        organizationId: owner.id,
        productId: products[0]!.id,
        variantId: variants[1]!.id,
        assetId: assets[0]!.id,
        role: 'GALLERY',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const placements = (await listMediaLibrary(database.db, owner.id))
      .flatMap((asset) => asset.usages.map((usage) => ({ ...usage, assetId: asset.id })))
      .filter((usage) => usage.variantId === variants[0]!.id);
    expect(placements).toHaveLength(2);
    expect(placements.filter((usage) => usage.isPrimary)).toEqual([
      expect.objectContaining({ assetId: assets[1]!.id, variantId: variants[0]!.id }),
    ]);
    const workspace = await getCatalogProductWorkspace(database.db, owner.id, products[0]!.id);
    expect(workspace?.variants[0]?.media).toHaveLength(2);
    expect(workspace?.variants[0]?.media.filter((item) => item.isPrimary)).toEqual([
      expect.objectContaining({ assetId: assets[1]!.id, variantId: variants[0]!.id }),
    ]);
  });

  it('registers ready object metadata only under the owning organization', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Media owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const other = await createOrganization(database.db, {
      code: `media-other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id,
      objectKey: `images/${crypto.randomUUID()}.png`,
      mimeType: 'image/png',
      byteSize: 12,
      checksumSha256: 'a'.repeat(64),
      visibility: 'PUBLIC',
    });
    expect(await findMediaAsset(database.db, asset.id, owner.id)).toMatchObject({
      id: asset.id,
      visibility: 'PUBLIC',
      status: 'READY',
    });
    expect(await findMediaAsset(database.db, asset.id, other.id)).toBeUndefined();
  });

  it('lists metadata and Product placements only inside the owning tenant', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-library-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media library owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const other = await createOrganization(database.db, {
      code: `media-library-other-${crypto.randomUUID().slice(0, 6)}`,
      displayName: 'Other media tenant',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const actor = await sql<{ id: string }>`
      insert into iam.users (name,email,email_normalized)
      values ('Media operator',${`media-${crypto.randomUUID()}@test.local`},${`media-${crypto.randomUUID()}@test.local`})
      returning id::text
    `.execute(database.db);
    const productType = await sql<{ id: string }>`
      insert into catalog.product_types (organization_id,code,name)
      values (${owner.id},${`dress-${crypto.randomUUID().slice(0, 6)}`},'Dress') returning id::text
    `.execute(database.db);
    const product = await createCatalogProduct(database.db, {
      organizationId: owner.id,
      actorId: actor.rows[0]!.id,
      productTypeId: productType.rows[0]!.id,
      title: 'Media dress',
      handle: `media-dress-${crypto.randomUUID().slice(0, 8)}`,
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id,
      objectKey: `images/${crypto.randomUUID()}.webp`,
      mimeType: 'image/webp',
      byteSize: 100,
      checksumSha256: 'b'.repeat(64),
      visibility: 'PRIVATE',
      widthPx: 800,
      heightPx: 1000,
    });
    await updateMediaAssetMetadata(database.db, {
      organizationId: owner.id,
      assetId: asset.id,
      title: 'Black dress front',
      altText: 'Front view of black dress',
      visibility: 'PUBLIC',
    });
    await attachMediaToProduct(database.db, {
      organizationId: owner.id,
      productId: product.id,
      assetId: asset.id,
      role: 'THUMBNAIL',
    });

    const ownerLibrary = await listMediaLibrary(database.db, owner.id);
    const listed = ownerLibrary.find((candidate) => candidate.id === asset.id);
    expect(listed).toMatchObject({
      title: 'Black dress front',
      altText: 'Front view of black dress',
      widthPx: 800,
      heightPx: 1000,
      visibility: 'PUBLIC',
    });
    expect(listed?.usages).toEqual([
      expect.objectContaining({
        productId: product.id,
        productTitle: product.title,
        role: 'THUMBNAIL',
      }),
    ]);
    expect(
      (await listMediaLibrary(database.db, other.id)).some((item) => item.id === asset.id),
    ).toBe(false);

    await expect(
      updateMediaAssetMetadata(database.db, {
        organizationId: other.id,
        assetId: asset.id,
        title: 'Cross-tenant change',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await detachMediaFromProduct(database.db, {
      organizationId: owner.id,
      productId: product.id,
      productMediaId: listed!.usages[0]!.id,
    });
    expect(
      (await listMediaLibrary(database.db, owner.id)).find((item) => item.id === asset.id)?.usages,
    ).toEqual([]);
  });

  it('shares a primary gallery through an option value and keeps one primary per scope', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-option-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Option gallery owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${owner.id},'shoe','Shoe') returning id::text`.execute(
      database.db,
    );
    const product = await createCatalogProduct(database.db, {
      organizationId: owner.id,
      actorId: crypto.randomUUID(),
      productTypeId: productType.rows[0]!.id,
      title: 'Gallery shoe',
      handle: `gallery-shoe-${crypto.randomUUID().slice(0, 8)}`,
    });
    const axis = await createProductOptionAxis(database.db, {
      organizationId: owner.id,
      productId: product.id,
      code: 'color',
      name: 'Color',
    });
    const red = await createProductOptionValue(database.db, {
      organizationId: owner.id,
      optionAxisId: axis.id,
      code: 'red',
      displayValue: 'Red',
    });
    const assets = await Promise.all(
      ['c', 'd'].map((checksum) =>
        registerUploadedMedia(database.db, {
          organizationId: owner.id,
          objectKey: `images/${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          byteSize: 100,
          checksumSha256: checksum.repeat(64),
          visibility: 'PUBLIC',
        }),
      ),
    );
    await attachMediaToProduct(database.db, {
      organizationId: owner.id,
      productId: product.id,
      optionValueId: red.id,
      assetId: assets[0]!.id,
      role: 'COLOR_GALLERY',
      isPrimary: true,
    });
    await attachMediaToProduct(database.db, {
      organizationId: owner.id,
      productId: product.id,
      optionValueId: red.id,
      assetId: assets[1]!.id,
      role: 'COLOR_GALLERY',
      isPrimary: true,
      position: 1,
    });

    const placements = (await listMediaLibrary(database.db, owner.id))
      .flatMap((asset) => asset.usages.map((usage) => ({ ...usage, assetId: asset.id })))
      .filter((usage) => usage.optionValueId === red.id);
    expect(placements).toHaveLength(2);
    expect(placements.filter((usage) => usage.isPrimary)).toEqual([
      expect.objectContaining({ assetId: assets[1]!.id, optionValueId: red.id }),
    ]);
  });

  it('organizes, diagnoses, archives, trashes, and restores an unused asset safely', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-lifecycle-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media lifecycle owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id,
      objectKey: `images/${crypto.randomUUID()}.webp`,
      mimeType: 'image/webp',
      byteSize: 100,
      checksumSha256: '9'.repeat(64),
      visibility: 'PUBLIC',
      widthPx: 800,
      heightPx: 1000,
    });
    const initial = (await listMediaLibrary(database.db, owner.id)).find(
      (candidate) => candidate.id === asset.id,
    )!;
    const folder = await createMediaFolder(database.db, {
      organizationId: owner.id,
      name: 'Campaign imagery',
    });
    const tag = await createMediaTag(database.db, {
      organizationId: owner.id,
      name: 'Editorial',
    });

    await organizeMediaAsset(database.db, {
      organizationId: owner.id,
      assetId: asset.id,
      expectedVersion: initial.version,
      folderId: folder.id,
      tagIds: [tag.id],
    });
    const filtered = await listMediaLibrary(database.db, {
      organizationId: owner.id,
      page: 1,
      pageSize: 1,
      folderId: folder.id,
      tagId: tag.id,
      unused: true,
    });
    expect(filtered.pagination).toMatchObject({ totalItems: 1, totalPages: 1 });
    expect(filtered.items[0]).toMatchObject({
      id: asset.id,
      folderId: folder.id,
      tags: [{ id: tag.id, name: 'Editorial' }],
    });
    expect(await listMediaHealthIssues(database.db, owner.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_IMAGE_RENDITIONS', assetId: asset.id }),
        expect.objectContaining({ code: 'MISSING_PUBLIC_ALT_TEXT', assetId: asset.id }),
      ]),
    );
    await expect(
      updateMediaAssetMetadata(database.db, {
        organizationId: owner.id,
        assetId: asset.id,
        visibility: 'PRIVATE',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await archiveMediaAsset(database.db, { organizationId: owner.id, assetId: asset.id });
    expect(await findMediaAsset(database.db, asset.id, owner.id)).toMatchObject({
      status: 'ARCHIVED',
    });
    await trashUnusedMediaAsset(database.db, {
      organizationId: owner.id,
      assetId: asset.id,
      retentionDays: 7,
    });
    expect(await findMediaAsset(database.db, asset.id, owner.id)).toBeUndefined();
    expect(
      (
        await listMediaLibrary(database.db, {
          organizationId: owner.id,
          page: 1,
          pageSize: 10,
          status: 'TRASHED',
        })
      ).items,
    ).toEqual([expect.objectContaining({ id: asset.id, status: 'TRASHED' })]);

    await restoreTrashedMediaAsset(database.db, { organizationId: owner.id, assetId: asset.id });
    expect(await findMediaAsset(database.db, asset.id, owner.id)).toMatchObject({
      status: 'ARCHIVED',
    });
  });

  it('atomically synchronizes and reorders product media placements while rejecting tenant mismatches', async () => {
    const ownerA = await createOrganization(database.db, {
      code: `sync-owner-a-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Sync Owner A',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const ownerB = await createOrganization(database.db, {
      code: `sync-owner-b-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Sync Owner B',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });

    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${ownerA.id},'apparel','Apparel') returning id::text`.execute(
      database.db,
    );

    const actor = await sql<{ id: string }>`
      insert into iam.users (name,email,email_normalized)
      values ('Sync operator',${`sync-${crypto.randomUUID()}@test.local`},${`sync-${crypto.randomUUID()}@test.local`})
      returning id::text
    `.execute(database.db);
    const actorId = actor.rows[0]!.id;

    const product = await createCatalogProduct(database.db, {
      organizationId: ownerA.id,
      actorId,
      productTypeId: productType.rows[0]!.id,
      title: 'Sync Dress',
      handle: `sync-dress-${crypto.randomUUID().slice(0, 8)}`,
    });

    const assetsA = await Promise.all(
      ['1', '2', '3'].map((checksum) =>
        registerUploadedMedia(database.db, {
          organizationId: ownerA.id,
          objectKey: `images/${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          byteSize: 100,
          checksumSha256: checksum.repeat(64),
          visibility: 'PUBLIC',
        }),
      ),
    );

    const foreignAsset = await registerUploadedMedia(database.db, {
      organizationId: ownerB.id,
      objectKey: `images/${crypto.randomUUID()}.webp`,
      mimeType: 'image/webp',
      byteSize: 100,
      checksumSha256: '9'.repeat(64),
      visibility: 'PUBLIC',
    });

    // 1. Initial Sync with 2 images
    await syncProductMediaPlacements(database.db, {
      organizationId: ownerA.id,
      actorId,
      productId: product.id,
      placements: [
        {
          assetId: assetsA[0]!.id,
          role: 'THUMBNAIL',
          position: 0,
          isPrimary: true,
          altTextOverride: 'Front cover',
        },
        {
          assetId: assetsA[1]!.id,
          role: 'GALLERY',
          position: 1,
          isPrimary: false,
        },
      ],
    });

    let workspace = await getCatalogProductWorkspace(database.db, ownerA.id, product.id);
    expect(workspace?.media).toHaveLength(2);
    expect(workspace?.media[0]).toMatchObject({
      assetId: assetsA[0]!.id,
      isPrimary: true,
      position: 0,
    });
    expect(workspace?.media[1]).toMatchObject({
      assetId: assetsA[1]!.id,
      isPrimary: false,
      position: 1,
    });

    // 2. Reorder & swap primary cover atomically (assetsA[1] becomes cover at pos 0, assetsA[2] is added, assetsA[0] removed)
    await syncProductMediaPlacements(database.db, {
      organizationId: ownerA.id,
      actorId,
      productId: product.id,
      placements: [
        {
          assetId: assetsA[1]!.id,
          role: 'THUMBNAIL',
          position: 0,
          isPrimary: true,
        },
        {
          assetId: assetsA[2]!.id,
          role: 'GALLERY',
          position: 1,
          isPrimary: false,
        },
      ],
    });

    workspace = await getCatalogProductWorkspace(database.db, ownerA.id, product.id);
    expect(workspace?.media).toHaveLength(2);
    expect(workspace?.media[0]).toMatchObject({
      assetId: assetsA[1]!.id,
      isPrimary: true,
      position: 0,
    });
    expect(workspace?.media[1]).toMatchObject({
      assetId: assetsA[2]!.id,
      isPrimary: false,
      position: 1,
    });

    // 3. Reject foreign asset from Owner B (tenant isolation MED-INV-001)
    await expect(
      syncProductMediaPlacements(database.db, {
        organizationId: ownerA.id,
        actorId,
        productId: product.id,
        placements: [
          {
            assetId: foreignAsset.id,
            role: 'GALLERY',
            position: 0,
            isPrimary: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // 4. Reject multiple primary covers in the same scope
    await expect(
      syncProductMediaPlacements(database.db, {
        organizationId: ownerA.id,
        actorId,
        productId: product.id,
        placements: [
          {
            assetId: assetsA[0]!.id,
            role: 'GALLERY',
            position: 0,
            isPrimary: true,
          },
          {
            assetId: assetsA[1]!.id,
            role: 'GALLERY',
            position: 1,
            isPrimary: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('performs bulk organize and bulk trash safely based on usage', async () => {
    const owner = await createOrganization(database.db, {
      code: `bulk-media-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Bulk Media Owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });

    const folder = await createMediaFolder(database.db, {
      organizationId: owner.id,
      name: 'Bulk Folder',
    });
    const tag = await createMediaTag(database.db, {
      organizationId: owner.id,
      name: 'Bulk Tag',
    });

    const assets = await Promise.all(
      ['a', 'b', 'c'].map((checksum) =>
        registerUploadedMedia(database.db, {
          organizationId: owner.id,
          objectKey: `images/${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          byteSize: 100,
          checksumSha256: checksum.repeat(64),
          visibility: 'PUBLIC',
        }),
      ),
    );

    // Bulk organize all 3
    const organizeResult = await bulkOrganizeMediaAssets(database.db, {
      organizationId: owner.id,
      assetIds: assets.map((a) => a.id),
      folderId: folder.id,
      tagIds: [tag.id],
    });
    expect(organizeResult.updatedCount).toBe(3);

    const library = await listMediaLibrary(database.db, {
      organizationId: owner.id,
      page: 1,
      pageSize: 10,
      folderId: folder.id,
      tagId: tag.id,
    });
    expect(library.items).toHaveLength(3);

    // Bulk trash 2 of them
    const trashResult = await bulkTrashMediaAssets(database.db, {
      organizationId: owner.id,
      assetIds: [assets[0]!.id, assets[1]!.id],
    });
    expect(trashResult.trashedCount).toBe(2);
    expect(trashResult.inUseCount).toBe(0);

    const trashedLibrary = await listMediaLibrary(database.db, {
      organizationId: owner.id,
      page: 1,
      pageSize: 10,
      status: 'TRASHED',
    });
    expect(trashedLibrary.items).toHaveLength(2);
  });
});
