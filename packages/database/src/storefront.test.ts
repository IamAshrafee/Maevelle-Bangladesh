import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  listPublicCategories,
  processStorefrontSearchOutbox,
  rebuildStorefrontSearch,
  resolveStorefrontContext,
  resolveProductRedirect,
  searchStorefront,
} from './storefront.js';
import {
  createCatalogVariant,
  createProductOptionAxis,
  createProductOptionValue,
} from './catalog.js';
import {
  registerUploadedMedia,
  syncProductMediaPlacements,
} from './media.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `storefront-${crypto.randomUUID().slice(0, 10)}`,
    displayName: 'Storefront search',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const productType = await sql<{
    id: string;
  }>`insert into catalog.product_types(organization_id,code,name) values(${organization.id},'dress','Dress') returning id`.execute(
    database.db,
  );
  const parent = await sql<{
    id: string;
  }>`insert into catalog.categories(organization_id,handle,name) values(${organization.id},'women','Women') returning id`.execute(
    database.db,
  );
  const child = await sql<{
    id: string;
  }>`insert into catalog.categories(organization_id,parent_category_id,handle,name) values(${organization.id},${parent.rows[0]!.id},'dresses','Dresses') returning id`.execute(
    database.db,
  );
  const leaf = await sql<{
    id: string;
  }>`insert into catalog.categories(organization_id,parent_category_id,handle,name) values(${organization.id},${child.rows[0]!.id},'summer','Summer') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products(organization_id,product_type_id,handle,title,description,status,publication_status,published_at,primary_category_id) values(${organization.id},${productType.rows[0]!.id},'sunset-dress','Sunset Linen Dress','Breathable summer dress','ACTIVE','PUBLISHED',now(),${leaf.rows[0]!.id}) returning id`.execute(
    database.db,
  );
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature) values(${organization.id},${product.rows[0]!.id},'SUMMER-01','SUMMER-01','default') returning id`.execute(
    database.db,
  );
  await sql`insert into catalog.product_categories(organization_id,product_id,category_id) values(${organization.id},${product.rows[0]!.id},${leaf.rows[0]!.id})`.execute(
    database.db,
  );
  await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount) values(${organization.id},${variant.rows[0]!.id},'BDT',1290)`.execute(
    database.db,
  );
  const location = await sql<{
    id: string;
  }>`insert into warehouse.locations(organization_id,code,name,location_type,status) values(${organization.id},'MAIN','Main','WAREHOUSE','ACTIVE') returning id`.execute(
    database.db,
  );
  const item = await sql<{
    id: string;
  }>`insert into inventory.inventory_items(organization_id,variant_id) values(${organization.id},${variant.rows[0]!.id}) returning id`.execute(
    database.db,
  );
  await sql`insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity) values(${organization.id},${item.rows[0]!.id},${location.rows[0]!.id},5)`.execute(
    database.db,
  );
  return {
    organizationId: organization.id,
    productId: product.rows[0]!.id,
    leafId: leaf.rows[0]!.id,
  };
}

describe('public Storefront projection', () => {
  it('resolves the configured active store without asking customers for a tenant identifier', async () => {
    const code = `public-store-${crypto.randomUUID().slice(0, 8)}`;
    const organization = await createOrganization(database.db, {
      code,
      displayName: 'Public Maevelle Store',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en-BD',
      defaultCurrency: 'BDT',
    });
    await sql`insert into settings.organization_profiles(organization_id,storefront_profile) values(${organization.id},${JSON.stringify({ publicStoreName: 'Maevelle', announcement: 'New collection available' })}::jsonb)`.execute(
      database.db,
    );
    await expect(resolveStorefrontContext(database.db, code)).resolves.toEqual({
      organizationId: organization.id,
      storeName: 'Maevelle',
      currency: 'BDT',
      locale: 'en-BD',
      announcement: 'New collection available',
    });
  });

  it('rebuilds authoritative price/availability and ranks typo, partial-title, and SKU searches', async () => {
    const value = await fixture();
    expect(await rebuildStorefrontSearch(database.db, value.organizationId)).toBe(1);
    for (const query of ['sunst dress', 'Sunset', 'SUMMER-01']) {
      const result = await searchStorefront(database.db, {
        organizationId: value.organizationId,
        query,
      });
      expect(result.items[0]).toMatchObject({
        handle: 'sunset-dress',
        minimumPrice: '1290.0000',
        currency: 'BDT',
        available: true,
      });
    }
    expect(
      (
        await searchStorefront(database.db, {
          organizationId: value.organizationId,
          query: 'totally unrelated hiking boots',
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await searchStorefront(database.db, {
          organizationId: value.organizationId,
          categoryId: value.leafId,
          availability: 'IN_STOCK',
          sort: 'PRICE_ASC',
        })
      ).total,
    ).toBe(1);
    await sql`delete from search.catalog_documents where organization_id=${value.organizationId}`.execute(
      database.db,
    );
    expect(
      (await searchStorefront(database.db, { organizationId: value.organizationId })).total,
    ).toBe(0);
    expect(await rebuildStorefrontSearch(database.db, value.organizationId)).toBe(1);
    expect(
      (await searchStorefront(database.db, { organizationId: value.organizationId })).total,
    ).toBe(1);
  });

  it('resolves deep category paths, canonical product redirects, and outbox replay once', async () => {
    const value = await fixture();
    expect(
      (await listPublicCategories(database.db, value.organizationId)).find(
        (category) => category.id === value.leafId,
      ),
    ).toMatchObject({ path: 'women/dresses/summer', depth: 2 });
    await sql`insert into catalog.product_handle_history(organization_id,product_id,old_handle) values(${value.organizationId},${value.productId},'old-sunset-dress')`.execute(
      database.db,
    );
    expect(
      await resolveProductRedirect(database.db, value.organizationId, 'old-sunset-dress'),
    ).toBe('sunset-dress');
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${value.organizationId},'catalog.product.updated',1,'catalog.product',${value.productId},1,'{}',now())`.execute(
      database.db,
    );
    expect(await processStorefrontSearchOutbox(database.db, 10_000)).toBeGreaterThan(0);
    expect(await processStorefrontSearchOutbox(database.db, 10_000)).toBe(0);
  });

  it('refreshes the Storefront price projection after a committed pricing event', async () => {
    const value = await fixture();
    await rebuildStorefrontSearch(database.db, value.organizationId);
    const price = await sql<{ id: string }>`
      update pricing.price_definitions definition set amount=1490
      from catalog.product_variants variant
      where definition.organization_id=${value.organizationId}
        and variant.organization_id=definition.organization_id
        and variant.id=definition.variant_id and variant.product_id=${value.productId}
      returning definition.id::text
    `.execute(database.db);
    await sql`
      insert into platform.outbox_events(
        organization_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,payload,occurred_at
      ) values(
        ${value.organizationId},'pricing.price_definition.replaced',1,
        'pricing.price_definition',${price.rows[0]!.id},1,'{}',now()
      )
    `.execute(database.db);

    expect(await processStorefrontSearchOutbox(database.db, 10_000)).toBe(1);
    expect(
      (
        await searchStorefront(database.db, {
          organizationId: value.organizationId,
          query: 'Sunset',
        })
      ).items[0],
    ).toMatchObject({ minimumPrice: '1490.0000' });
  });

  it('refreshes projected availability once for committed inventory lifecycle events', async () => {
    const value = await fixture();
    await rebuildStorefrontSearch(database.db, value.organizationId);
    await sql`update inventory.inventory_levels set sellable_quantity = 0 where organization_id = ${value.organizationId}`.execute(
      database.db,
    );
    const events = [
      'inventory.adjusted',
      'inventory.condition_moved',
      'inventory.reservation.created',
      'inventory.reservation.released',
      'inventory.stocktake.posted',
      'warehouse.transfer.dispatched',
      'warehouse.transfer.partially_received',
      'warehouse.transfer.received',
      'receiving.inbound_receipt.posted',
      'fulfillment.dispatched',
      'returns.received',
    ];
    for (const eventType of events)
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${value.organizationId},${eventType},1,'inventory.inventory_item',${value.productId},1,'{}',now())`.execute(
        database.db,
      );

    expect(await processStorefrontSearchOutbox(database.db, 10_000)).toBe(events.length);
    expect(
      (
        await searchStorefront(database.db, {
          organizationId: value.organizationId,
          query: 'Sunset',
        })
      ).items[0],
    ).toMatchObject({ available: false });
    expect(await processStorefrontSearchOutbox(database.db, 10_000)).toBe(0);
  });

  it('prioritizes shared product cover photo over default visual option in catalog search when designated as primary', async () => {
    const owner = await createOrganization(database.db, {
      code: `cover-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Cover Store',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const productType = await sql<{ id: string }>`insert into catalog.product_types
      (organization_id,code,name) values (${owner.id},'apparel','Apparel') returning id::text`.execute(
      database.db,
    );
    const category = await sql<{ id: string }>`insert into catalog.categories
      (organization_id,handle,name) values (${owner.id},'bandanas','Bandanas') returning id::text`.execute(
      database.db,
    );
    const product = await sql<{ id: string }>`insert into catalog.products
      (organization_id,product_type_id,handle,title,description,status,publication_status,published_at,primary_category_id)
      values (${owner.id},${productType.rows[0]!.id},'bandana-print','Bandana Print','All-weather printed bandana','ACTIVE','UNPUBLISHED',now(),${category.rows[0]!.id})
      returning id::text`.execute(database.db);
    const productId = product.rows[0]!.id;

    // 1. Create a visual axis (e.g. Pattern) with 2 options
    const axis = await createProductOptionAxis(database.db, {
      organizationId: owner.id,
      productId,
      code: 'pattern',
      name: 'Pattern',
      isVisual: true,
    });
    const pattern1 = await createProductOptionValue(database.db, {
      organizationId: owner.id,
      optionAxisId: axis.id,
      code: 'floral',
      displayValue: 'Floral Pattern',
      isPrimary: true,
    });
    const pattern2 = await createProductOptionValue(database.db, {
      organizationId: owner.id,
      optionAxisId: axis.id,
      code: 'geometric',
      displayValue: 'Geometric Pattern',
      isPrimary: false,
    });

    // 2. Create variants with these option values
    const variant1 = await createCatalogVariant(database.db, {
      organizationId: owner.id,
      productId,
      sku: 'BANDANA-FLORAL',
      optionValueIds: [pattern1.id],
    });
    const variant2 = await createCatalogVariant(database.db, {
      organizationId: owner.id,
      productId,
      sku: 'BANDANA-GEOM',
      optionValueIds: [pattern2.id],
    });

    // 3. Set prices and inventory so it is coherent
    for (const vId of [variant1.id, variant2.id]) {
      await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount)
        values(${owner.id},${vId},'BDT',450)`.execute(database.db);
      const loc = await sql<{ id: string }>`insert into warehouse.locations(organization_id,code,name,location_type,status)
        values(${owner.id},${crypto.randomUUID().slice(0, 8)},'Main','WAREHOUSE','ACTIVE') returning id::text`.execute(database.db);
      const item = await sql<{ id: string }>`select id::text from inventory.inventory_items
        where organization_id=${owner.id} and variant_id=${vId}::uuid`.execute(database.db);
      await sql`insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity)
        values(${owner.id},${item.rows[0]!.id},${loc.rows[0]!.id},10)`.execute(database.db);
    }

    // 4. Publish product and build search document
    await sql`update catalog.products set publication_status='PUBLISHED' where id=${productId}`.execute(database.db);
    await rebuildStorefrontSearch(database.db, owner.id);

    // 5. Upload 3 assets: Pattern 1 photo, Pattern 2 photo, and Shared group cover photo
    const [pattern1Asset, pattern2Asset, sharedCoverAsset] = await Promise.all(
      ['1', '2', '3'].map((checksum) =>
        registerUploadedMedia(database.db, {
          organizationId: owner.id,
          objectKey: `images/bandana-${checksum}-${crypto.randomUUID()}.webp`,
          mimeType: 'image/webp',
          byteSize: 100,
          checksumSha256: checksum.repeat(64),
          visibility: 'PUBLIC',
        }),
      ),
    );

    const actor = await sql<{ id: string }>`
      insert into iam.users (name,email,email_normalized)
      values ('Sync operator',${`sync-${crypto.randomUUID()}@test.local`},${`sync-${crypto.randomUUID()}@test.local`})
      returning id::text
    `.execute(database.db);
    const actorId = actor.rows[0]!.id;

    // 6. Sync placements:
    // Pattern 1 has lead photo (isPrimary: true in its scope)
    // Pattern 2 has lead photo (isPrimary: true in its scope)
    // Shared product has cover photo (isPrimary: true in product scope)
    await syncProductMediaPlacements(database.db, {
      organizationId: owner.id,
      actorId,
      productId,
      placements: [
        {
          assetId: pattern1Asset!.id,
          optionValueId: pattern1.id,
          role: 'COLOR_GALLERY',
          position: 0,
          isPrimary: true,
        },
        {
          assetId: pattern2Asset!.id,
          optionValueId: pattern2.id,
          role: 'COLOR_GALLERY',
          position: 0,
          isPrimary: true,
        },
        {
          assetId: sharedCoverAsset!.id,
          role: 'GALLERY',
          position: 0,
          isPrimary: true,
        },
      ],
    });

    // 7. Search storefront catalog
    const searchResult = await searchStorefront(database.db, {
      organizationId: owner.id,
      query: 'Bandana',
    });
    expect(searchResult.items[0]).toBeDefined();
    // Primary media MUST be the shared cover asset (Photo 3)
    expect(searchResult.items[0]?.primaryMediaAssetId).toBe(sharedCoverAsset!.id);
    // Secondary media (for hover flip) MUST be Pattern 1 asset
    expect(searchResult.items[0]?.secondaryMediaAssetId).toBe(pattern1Asset!.id);

    // 8. Test fallback: If shared photo is NOT primary, default visual option lead becomes primary
    await syncProductMediaPlacements(database.db, {
      organizationId: owner.id,
      actorId,
      productId,
      placements: [
        {
          assetId: pattern1Asset!.id,
          optionValueId: pattern1.id,
          role: 'COLOR_GALLERY',
          position: 0,
          isPrimary: true,
        },
        {
          assetId: pattern2Asset!.id,
          optionValueId: pattern2.id,
          role: 'COLOR_GALLERY',
          position: 0,
          isPrimary: true,
        },
        {
          assetId: sharedCoverAsset!.id,
          role: 'GALLERY',
          position: 1,
          isPrimary: false,
        },
      ],
    });

    const fallbackResult = await searchStorefront(database.db, {
      organizationId: owner.id,
      query: 'Bandana',
    });
    expect(fallbackResult.items[0]?.primaryMediaAssetId).toBe(pattern1Asset!.id);
  });
});

