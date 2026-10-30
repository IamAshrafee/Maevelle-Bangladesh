import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  evaluateProductRecommendations,
  recommendationPerformance,
  saveProductRecommendationSettings,
} from './recommendations.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 2,
});
afterAll(async () => database.close());

describe('PDP recommendations', () => {
  it('selects an eligible Product and removes it after stock loss', async () => {
    const organization = await createOrganization(database.db, {
      code: `recommend-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Recommendations test',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const type = await sql<{
      id: string;
    }>`insert into catalog.product_types(organization_id,code,name) values(${organization.id},'dress','Dress') returning id::text`.execute(
      database.db,
    );
    const source = await sql<{
      id: string;
    }>`insert into catalog.products(organization_id,product_type_id,handle,title,description,status,publication_status,published_at)
      values(${organization.id},${type.rows[0]!.id}::uuid,'source-dress','Source dress','Source','ACTIVE','PUBLISHED',now()) returning id::text`.execute(
      database.db,
    );
    const target = await sql<{
      id: string;
    }>`insert into catalog.products(organization_id,product_type_id,handle,title,description,status,publication_status,published_at)
      values(${organization.id},${type.rows[0]!.id}::uuid,'target-dress','Target dress','Target','ACTIVE','PUBLISHED',now()) returning id::text`.execute(
      database.db,
    );
    const category = await sql<{
      id: string;
    }>`insert into catalog.categories(organization_id,handle,name)
      values(${organization.id},'dresses','Dresses') returning id::text`.execute(database.db);
    for (const productId of [source.rows[0]!.id, target.rows[0]!.id])
      await sql`insert into catalog.product_categories(organization_id,product_id,category_id)
        values(${organization.id},${productId}::uuid,${category.rows[0]!.id}::uuid)`.execute(
        database.db,
      );
    for (const [id, sku] of [
      [source.rows[0]!.id, 'SRC-01'],
      [target.rows[0]!.id, 'TGT-01'],
    ] as const) {
      await sql`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
        values(${organization.id},${id}::uuid,${sku},${sku},'default')`.execute(database.db);
    }
    const variant = await sql<{
      id: string;
    }>`select id::text from catalog.product_variants where organization_id=${organization.id} and product_id=${target.rows[0]!.id}::uuid`.execute(
      database.db,
    );
    await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount)
      values(${organization.id},${variant.rows[0]!.id}::uuid,'BDT',1290)`.execute(database.db);
    const location = await sql<{
      id: string;
    }>`insert into warehouse.locations(organization_id,code,name,location_type,status)
      values(${organization.id},'MAIN','Main','WAREHOUSE','ACTIVE') returning id::text`.execute(
      database.db,
    );
    const item = await sql<{
      id: string;
    }>`insert into inventory.inventory_items(organization_id,variant_id)
      values(${organization.id},${variant.rows[0]!.id}::uuid) returning id::text`.execute(
      database.db,
    );
    await sql`insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity)
      values(${organization.id},${item.rows[0]!.id}::uuid,${location.rows[0]!.id}::uuid,5)`.execute(
      database.db,
    );
    const media = await sql<{
      id: string;
    }>`insert into media.media_assets(organization_id,asset_type,visibility_class,status,original_filename,normalized_extension)
      values(${organization.id},'IMAGE','PUBLIC','READY','dress.jpg','jpg') returning id::text`.execute(
      database.db,
    );
    const object = await sql<{
      id: string;
    }>`insert into media.media_objects(organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,byte_size)
      values(${organization.id},${media.rows[0]!.id}::uuid,'ORIGINAL','local','test',${`source/${crypto.randomUUID()}.jpg`},'image/jpeg',100) returning id::text`.execute(
      database.db,
    );
    await sql`update media.media_assets set current_object_id=${object.rows[0]!.id}::uuid where id=${media.rows[0]!.id}::uuid`.execute(
      database.db,
    );
    await sql`insert into media.media_renditions(organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,object_key,mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version)
      values(${organization.id},${media.rows[0]!.id}::uuid,${object.rows[0]!.id}::uuid,'card','local','test',${`card/${crypto.randomUUID()}.webp`},'image/webp',80,${'a'.repeat(64)},400,500,'test')`.execute(
      database.db,
    );
    await sql`insert into catalog.product_media(organization_id,product_id,asset_id,role,is_primary)
      values(${organization.id},${target.rows[0]!.id}::uuid,${media.rows[0]!.id}::uuid,'GALLERY',true)`.execute(
      database.db,
    );
    const result = await evaluateProductRecommendations(database.db, {
      organizationId: organization.id,
      productId: source.rows[0]!.id,
      currency: 'BDT',
      preview: true,
    });
    expect(result.sections).toHaveLength(2);
    expect(
      result.sections.find((section) => section.placement === 'pdp_similar')?.items[0],
    ).toMatchObject({
      productId: target.rows[0]!.id,
      handle: 'target-dress',
      price: { currency: 'BDT' },
    });
    const draft = await sql<{
      id: string;
    }>`insert into catalog.products(organization_id,product_type_id,handle,title,description)
      values(${organization.id},${type.rows[0]!.id}::uuid,'draft-dress','Draft dress','Draft') returning id::text`.execute(
      database.db,
    );
    await expect(
      evaluateProductRecommendations(database.db, {
        organizationId: organization.id,
        productId: draft.rows[0]!.id,
        currency: 'BDT',
        preview: true,
      }),
    ).resolves.toMatchObject({ productId: draft.rows[0]!.id });
    await expect(
      evaluateProductRecommendations(database.db, {
        organizationId: organization.id,
        productId: draft.rows[0]!.id,
        currency: 'BDT',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const proposed = await evaluateProductRecommendations(database.db, {
      organizationId: organization.id,
      productId: source.rows[0]!.id,
      currency: 'BDT',
      preview: true,
      proposed: {
        placement: 'pdp_similar',
        mode: 'HYBRID',
        enabled: null,
        targetCount: null,
        minimumScore: null,
        version: 0,
        actions: [
          {
            targetProductId: target.rows[0]!.id,
            action: 'EXCLUDE',
            pinPosition: null,
            boost: null,
          },
        ],
      },
    });
    expect(
      proposed.sections.find((section) => section.placement === 'pdp_similar')?.items,
    ).toHaveLength(0);
    expect('explanations' in proposed && proposed.explanations).toContainEqual(
      expect.objectContaining({ productId: target.rows[0]!.id, outcome: 'EXCLUDED' }),
    );
    const saved = await saveProductRecommendationSettings(database.db, {
      organizationId: organization.id,
      productId: source.rows[0]!.id,
      actorId: crypto.randomUUID(),
      placement: 'pdp_similar',
      expectedVersion: 0,
      mode: 'MANUAL',
      enabled: null,
      targetCount: null,
      minimumScore: null,
      actions: [
        { targetProductId: target.rows[0]!.id, action: 'PIN', pinPosition: 1, boost: null },
      ],
    });
    expect(saved.version).toBe(1);
    await expect(
      saveProductRecommendationSettings(database.db, {
        organizationId: organization.id,
        productId: source.rows[0]!.id,
        actorId: crypto.randomUUID(),
        placement: 'pdp_similar',
        expectedVersion: 0,
        mode: 'MANUAL',
        enabled: null,
        targetCount: null,
        minimumScore: null,
        actions: [],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const otherOrganization = await createOrganization(database.db, {
      code: `recommend-other-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Other recommendations test',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const otherType = await sql<{
      id: string;
    }>`insert into catalog.product_types(organization_id,code,name)
      values(${otherOrganization.id},'dress','Dress') returning id::text`.execute(database.db);
    const otherProduct = await sql<{
      id: string;
    }>`insert into catalog.products(organization_id,product_type_id,handle,title,description)
      values(${otherOrganization.id},${otherType.rows[0]!.id}::uuid,'other-dress','Other dress','Other') returning id::text`.execute(
      database.db,
    );
    await expect(
      saveProductRecommendationSettings(database.db, {
        organizationId: organization.id,
        productId: source.rows[0]!.id,
        actorId: crypto.randomUUID(),
        placement: 'pdp_similar',
        expectedVersion: 1,
        mode: 'MANUAL',
        enabled: null,
        targetCount: null,
        minimumScore: null,
        actions: [
          { targetProductId: otherProduct.rows[0]!.id, action: 'PIN', pinPosition: 1, boost: null },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await sql`update inventory.inventory_levels set sellable_quantity=0 where organization_id=${organization.id} and inventory_item_id=${item.rows[0]!.id}::uuid`.execute(
      database.db,
    );
    const after = await evaluateProductRecommendations(database.db, {
      organizationId: organization.id,
      productId: source.rows[0]!.id,
      currency: 'BDT',
    });
    expect(after.sections.every((section) => section.items.length === 0)).toBe(true);
    const sessionId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    await sql`insert into analytics.storefront_sessions(organization_id,session_id,analytics_consent,marketing_consent,started_at,last_seen_at)
      values(${organization.id},${sessionId}::uuid,'GRANTED','DENIED',now()-interval '3 minutes',now())`.execute(
      database.db,
    );
    for (const [name, minutes] of [
      ['PRODUCT_LIST_VIEWED', 3],
      ['PRODUCT_SELECTED', 2],
      ['PRODUCT_SELECTED', 1],
      ['PRODUCT_VIEWED', 0],
    ] as const) {
      await sql`insert into analytics.storefront_events(organization_id,event_id,schema_version,event_name,origin,session_id,product_id,analytics_consent,marketing_consent,payload,occurred_at)
        values(${organization.id},${crypto.randomUUID()}::uuid,1,${name},'BROWSER',${sessionId}::uuid,${target.rows[0]!.id}::uuid,'GRANTED','DENIED',
          ${JSON.stringify({ placement: name === 'PRODUCT_VIEWED' ? undefined : 'pdp_similar', recommendationRequestId: requestId })}::jsonb,
          now()-${minutes}*interval '1 minute')`.execute(database.db);
    }
    const performance = await recommendationPerformance(database.db, {
      organizationId: organization.id,
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(performance.placements).toContainEqual(
      expect.objectContaining({
        placement: 'pdp_similar',
        impressions: 1,
        clicks: 2,
        clickedImpressions: 1,
        productPageContinuations: 2,
        ctr: 1,
      }),
    );
  });
});
