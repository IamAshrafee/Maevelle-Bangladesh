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
  claimExternalImageImport,
  completeMediaProcessing,
  completeExternalImageImport,
  claimDueMediaPurge,
  completeMediaPurge,
  attachMediaToProduct,
  bulkOrganizeMediaAssets,
  bulkTrashMediaAssets,
  createMediaFolder,
  createMediaTag,
  detachMediaFromProduct,
  findMediaAsset,
  findPublicMediaRendition,
  queueMissingPublicMediaRenditions,
  failMediaPurge,
  failExternalImageImport,
  listMediaHealthIssues,
  listMediaStorageInventory,
  listMediaLibrary,
  organizeMediaAsset,
  registerUploadedMedia,
  registerUrlMedia,
  restoreTrashedMediaAsset,
  retryFailedMediaPurge,
  retryExternalImageImport,
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
  it('serves only the requested processed public rendition', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-public-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Public rendition test', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'USD',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id, objectKey: `images/${crypto.randomUUID()}.jpg`,
      mimeType: 'image/jpeg', byteSize: 100, checksumSha256: 'a'.repeat(64), visibility: 'PUBLIC',
    });
    expect(await findPublicMediaRendition(database.db, asset.id, 'pdp')).toBeUndefined();
    const original = await sql<{ current_object_id: string }>`select current_object_id::text
      from media.media_assets where id=${asset.id}::uuid`.execute(database.db);
    await sql`insert into media.media_renditions
      (organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,
        object_key,mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version)
      values(${owner.id},${asset.id},${original.rows[0]!.current_object_id},'thumbnail',
        'local','public',${`organizations/${owner.id}/assets/${asset.id}/renditions/thumb.webp`},
        'image/webp',20,${'b'.repeat(64)},100,100,'sharp-1')`.execute(database.db);
    expect(await findPublicMediaRendition(database.db, asset.id, 'pdp')).toBeUndefined();
    expect(await findPublicMediaRendition(database.db, asset.id, 'thumbnail')).toMatchObject({
      renditionKey: 'thumbnail',mimeType: 'image/webp',byteSize: 20,
      contentVersion: 'b'.repeat(64),
    });
    expect((await listMediaLibrary(database.db, owner.id)).find((item) => item.id === asset.id))
      .toMatchObject({ missingPublicRenditions: true });
    expect(await listMediaHealthIssues(database.db, owner.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_IMAGE_RENDITIONS', assetId: asset.id }),
    ]));
    await archiveMediaAsset(database.db, { organizationId: owner.id, assetId: asset.id });
    await queueMissingPublicMediaRenditions(database.db, {
      organizationId: owner.id, assetId: asset.id,
    });
    expect(await findPublicMediaRendition(database.db, asset.id, 'thumbnail')).toBeUndefined();
    await sql`update media.media_assets set status='PROCESSING' where id=${asset.id}::uuid`.execute(database.db);
    await completeMediaProcessing(database.db, {
      asset: {
        assetId: asset.id,organizationId: owner.id,assetType: 'IMAGE',uploadSource: 'MIGRATION',
        visibility: 'PUBLIC',attempt: 1,
        original: { id: original.rows[0]!.current_object_id,provider: 'local',bucket: 'private',
          objectKey: asset.objectKey,mimeType: 'image/jpeg',byteSize: 100 },
      },
      processorVersion: 'test',checksumSha256: 'a'.repeat(64),fileFormat: 'jpeg',renditions: [],
    });
    const repaired = await sql<{ status: string }>`select status from media.media_assets
      where id=${asset.id}::uuid`.execute(database.db);
    expect(repaired.rows[0]?.status).toBe('ARCHIVED');
    const replacement = await sql<{ id: string }>`insert into media.media_objects
      (organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,
        mime_type,byte_size)
      values(${owner.id},${asset.id},'ORIGINAL','local','private',
        ${`organizations/${owner.id}/assets/${asset.id}/replacement.jpg`},'image/jpeg',100)
      returning id::text`.execute(database.db);
    await sql`update media.media_assets set current_object_id=${replacement.rows[0]!.id}::uuid
      where id=${asset.id}::uuid`.execute(database.db);
    expect(await findPublicMediaRendition(database.db, asset.id, 'thumbnail')).toBeUndefined();
  });
  it('requeues a restored legacy URL image instead of exposing its remote source', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-legacy-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Legacy image test', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'USD',
    });
    const created = await sql<{ id: string }>`insert into media.media_assets
      (organization_id,asset_type,visibility_class,status,original_filename,
        normalized_extension,upload_source,trashed_at,purge_after)
      values(${owner.id},'IMAGE','PUBLIC','TRASHED','legacy.jpg','jpg','MIGRATION',
        now(),now()+interval '7 days') returning id::text`.execute(database.db);
    const assetId = created.rows[0]!.id;
    const original = await sql<{ id: string }>`insert into media.media_objects
      (organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,
        mime_type,byte_size)
      values(${owner.id},${assetId},'ORIGINAL','url','external',
        ${`https://images.example.test/${assetId}.jpg`},'image/jpeg',100)
      returning id::text`.execute(database.db);
    await sql`update media.media_assets set current_object_id=${original.rows[0]!.id}::uuid
      where id=${assetId}::uuid`.execute(database.db);
    await restoreTrashedMediaAsset(database.db, { organizationId: owner.id, assetId });
    const state = await sql<{ status: string; import_status: string; restore_archived: boolean }>`
      select asset.status,job.status import_status,job.restore_archived
      from media.media_assets asset join media.external_image_imports job on job.asset_id=asset.id
      where asset.id=${assetId}::uuid`.execute(database.db);
    expect(state.rows[0]).toMatchObject({
      status: 'PENDING_UPLOAD', import_status: 'PENDING', restore_archived: true,
    });
    expect(await findMediaAsset(database.db, assetId)).toBeUndefined();
    const claim = await claimExternalImageImport(database.db);
    expect(claim?.assetId).toBe(assetId);
    await failExternalImageImport(database.db, {
      ...claim!, code: 'UNSAFE_MEDIA_HOST', retryable: false,
    });
  });
  it('queues external images, fences imports, and exposes only local bytes', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-import-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media import test', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'USD',
    });
    const sourceUrl = `https://images.example.test/${crypto.randomUUID()}.jpg`;
    const asset = await registerUrlMedia(database.db, {
      organizationId: owner.id, url: sourceUrl, visibility: 'PUBLIC',
    });
    expect(await findMediaAsset(database.db, asset.id)).toBeUndefined();
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values(${owner.id},'imported','Imported') returning id::text`
      .execute(database.db);
    const product = await createCatalogProduct(database.db, {
      organizationId: owner.id, actorId: crypto.randomUUID(),
      productTypeId: productType.rows[0]!.id,
      title: 'Imported image product', handle: `import-media-${crypto.randomUUID().slice(0, 8)}`,
    });
    await attachMediaToProduct(database.db, {
      organizationId: owner.id, productId: product.id, assetId: asset.id, role: 'GALLERY',
    });
    const workspace = await getCatalogProductWorkspace(database.db, owner.id, product.id);
    expect(workspace?.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: asset.id, pendingImport: true }),
    ]));
    const claim = await claimExternalImageImport(database.db);
    expect(claim).toMatchObject({ assetId: asset.id, sourceUrl, attempt: 1 });
    await failExternalImageImport(database.db, { ...claim!, code: 'UNSAFE_MEDIA_HOST', retryable: false });
    const failed = await listMediaLibrary(database.db, owner.id);
    expect(failed.find((item) => item.id === asset.id)).toMatchObject({
      status: 'FAILED', processingErrorCode: 'EXTERNAL_IMPORT_FAILED',
    });
    await retryExternalImageImport(database.db, { organizationId: owner.id, assetId: asset.id });
    const retried = await claimExternalImageImport(database.db);
    expect(retried).toMatchObject({ assetId: asset.id, attempt: 1 });
    await expect(completeExternalImageImport(database.db, {
      ...claim!, provider: 'local', bucket: 'public', objectKey: 'stale.jpg',
      mimeType: 'image/jpeg', byteSize: 8, checksumSha256: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    await completeExternalImageImport(database.db, {
      ...retried!, provider: 'local', bucket: 'public',
      objectKey: `organizations/${owner.id}/assets/${asset.id}/source-test.jpg`,
      mimeType: 'image/jpeg', byteSize: 8, checksumSha256: 'a'.repeat(64),
    });
    expect(await findMediaAsset(database.db, asset.id)).toBeUndefined();
    await sql`update media.media_assets set status='READY' where id=${asset.id}::uuid`.execute(database.db);
    expect(await findMediaAsset(database.db, asset.id)).toMatchObject({ provider: 'local' });
  });
  it('pages through more than 2,000 storage records without truncation or duplicates', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-inventory-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media inventory test', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'USD',
    });
    await sql`insert into media.media_assets
      (organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,upload_source)
      select ${owner.id},'IMAGE','PRIVATE','READY',
        'scan-' || number::text || '.webp','webp','MIGRATION'
      from generate_series(1,2005) number`.execute(database.db);
    await sql`insert into media.media_objects
      (organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,
        byte_size,checksum_sha256,file_format)
      select ${owner.id},asset.id,'ORIGINAL','local','private',
        'organizations/' || ${owner.id} || '/assets/' || asset.id::text || '/source.webp',
        'image/webp',10,${'a'.repeat(64)},'webp'
      from media.media_assets asset where asset.organization_id=${owner.id}`.execute(database.db);

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await listMediaStorageInventory(database.db, {
        organizationId: owner.id, pageSize: 100, ...(cursor ? { cursor } : {}),
      });
      pages += 1;
      for (const item of page.items) seen.add(item.objectKey);
      if (!page.hasMore) break;
      expect(page.nextCursor).toBeTruthy();
      cursor = page.nextCursor!;
    }
    expect(seen.size).toBe(2005);
    expect(pages).toBe(21);
    await expect(listMediaStorageInventory(database.db, {
      organizationId: owner.id, pageSize: 100, cursor: 'not-a-cursor',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('retries failed and stale purge claims with fencing, then removes the asset', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-purge-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Media purge owner', timezone: 'UTC', defaultLocale: 'en', defaultCurrency: 'USD',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id,
      objectKey: `organizations/${owner.id}/assets/${crypto.randomUUID()}/original.webp`,
      mimeType: 'image/webp', byteSize: 100, checksumSha256: 'f'.repeat(64), visibility: 'PRIVATE',
    });
    await trashUnusedMediaAsset(database.db, { organizationId: owner.id, assetId: asset.id });
    await sql`update media.media_assets set purge_after=now()-interval '100 years'
      where organization_id=${owner.id} and id=${asset.id}::uuid`.execute(database.db);

    const first = await claimDueMediaPurge(database.db);
    expect(first).toMatchObject({ assetId: asset.id, attempt: 1 });
    await failMediaPurge(database.db, { ...first!, error: 'Storage unavailable' });
    const failed = await sql<{ purge_attempts: number; purge_last_error: string; purge_retry_after: Date }>`
      select purge_attempts,purge_last_error,purge_retry_after from media.media_assets
      where organization_id=${owner.id} and id=${asset.id}::uuid`.execute(database.db);
    expect(failed.rows[0]).toMatchObject({ purge_attempts: 1, purge_last_error: 'Storage unavailable' });
    expect(failed.rows[0]!.purge_retry_after.getTime()).toBeGreaterThan(Date.now());
    expect(await listMediaHealthIssues(database.db, owner.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PURGE_RETRY_PENDING', assetId: asset.id }),
    ]));
    expect(await retryFailedMediaPurge(database.db, { organizationId: owner.id, assetId: asset.id })).toBe(true);

    const second = await claimDueMediaPurge(database.db);
    expect(second).toMatchObject({ assetId: asset.id, attempt: 2 });
    await sql`update media.media_assets set purge_lease_until=now()-interval '1 second'
      where organization_id=${owner.id} and id=${asset.id}::uuid`.execute(database.db);
    const third = await claimDueMediaPurge(database.db);
    expect(third).toMatchObject({ assetId: asset.id, attempt: 3 });
    await expect(completeMediaPurge(database.db, second!)).rejects.toThrow('no longer current');
    await completeMediaPurge(database.db, third!);
    const remaining = await sql<{ count: string }>`select count(*)::text count from media.media_assets
      where organization_id=${owner.id} and id=${asset.id}::uuid`.execute(database.db);
    expect(remaining.rows[0]?.count).toBe('0');
  });
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
      isVisual: true,
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
