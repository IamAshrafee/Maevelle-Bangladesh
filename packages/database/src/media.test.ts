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
  attachMediaToProduct,
  detachMediaFromProduct,
  findMediaAsset,
  listMediaLibrary,
  registerUploadedMedia,
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
});
