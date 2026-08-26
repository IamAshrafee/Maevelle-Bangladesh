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
  }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature) values(${organization.id},${product.rows[0]!.id},'SUMMER-01','SUMMER-01','summer') returning id`.execute(
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
});
