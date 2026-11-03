/** Synthetic acceptance data only. Guarded to the assignment-owned tmpfs PostgreSQL instance. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { createOrganization } from '../packages/database/src/platform.ts';
import { createAuth } from '../apps/api/src/auth/auth.ts';
import { resolveOrEnrollShopper } from '../packages/database/src/shopper.ts';
import { saveWishlistProduct } from '../packages/database/src/wishlist/account.ts';
import { createShare } from '../packages/database/src/wishlist/share-lifecycle.ts';
import { shareKey, shareToken } from '../packages/database/src/wishlist/share-crypto.ts';
import { inspectAndProcessImage } from '../packages/media/src/image-processing.ts';
import {
  phase07aConfig as config,
  assertPhase07aTarget,
  phase07aFixturePassword,
} from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const database = createDatabase({ connectionString: config.databaseUrl, maxConnections: 6 });
const password = phase07aFixturePassword;
try {
  const organizationId = (
    await sql<{
      id: string;
    }>`select id::text from platform.organizations where code='maevelle'`.execute(database.db)
  ).rows[0]!.id;
  const other = (
    await createOrganization(database.db, {
      code: 'other-07a',
      displayName: 'Other synthetic organization',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
  const type = (
    await sql<{
      id: string;
    }>`select id::text from catalog.product_types where organization_id=${organizationId} limit 1`.execute(
      database.db,
    )
  ).rows[0]!.id;
  const categories: string[] = [];
  for (let n = 1; n <= 28; n++)
    categories.push(
      (
        await sql<{ id: string }>`insert into catalog.categories(organization_id,handle,name)
    values (${organizationId},${`qa-category-${n}`},${`QA category ${n}`}) returning id::text`.execute(
          database.db,
        )
      ).rows[0]!.id,
    );
  for (let n = 1; n <= 104; n++) {
    const p = (
      await sql<{
        id: string;
      }>`insert into catalog.products(organization_id,product_type_id,primary_category_id,handle,title,status,publication_status,published_at)
      values (${organizationId},${type}::uuid,${categories[(n - 1) % 28]}::uuid,${`qa-accessory-${n}`},${`Atelier accessory ${String(n).padStart(3, '0')}`},'ACTIVE','PUBLISHED',now()) returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    const v = (
      await sql<{
        id: string;
      }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
      values (${organizationId},${p}::uuid,${`QA-${n}`},${`QA-${n}`},'default') returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount) values (${organizationId},${v}::uuid,'BDT',750)`.execute(
      database.db,
    );
    await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,minimum_price,currency_code,available,published_at)
      values (${organizationId},${p}::uuid,${`qa-accessory-${n}`},${`Atelier accessory ${String(n).padStart(3, '0')}`},'Synthetic accessory',750,'BDT',false,now())`.execute(
      database.db,
    );
  }
  const auth = createAuth(config, database, true);
  const users: Record<string, string> = {};
  for (const key of [
    'shopper-a',
    'shopper-b',
    'cohort-1',
    'cohort-2',
    'analyst',
    'no-analytics',
    'other-analyst',
  ]) {
    const created = await auth.api.signUpEmail({
      body: { email: `${key}-07a@example.test`, password, name: `Synthetic ${key}` },
    });
    const id = created.user!.id!;
    users[key] = id;
    await sql`update iam.users set email_verified=true where id=${id}::uuid`.execute(database.db);
  }
  const products = (
    await sql<{
      id: string;
      handle: string;
    }>`select id::text,handle from catalog.products where organization_id=${organizationId} and status='ACTIVE' and publication_status='PUBLISHED' order by handle`.execute(
      database.db,
    )
  ).rows;
  const owners: Record<string, { organizationId: string; accountId: string }> = {};
  for (const key of ['shopper-a', 'shopper-b', 'cohort-1', 'cohort-2']) {
    const principal = await resolveOrEnrollShopper(database.db, organizationId, users[key]!);
    if (!principal) throw new Error('Fixture enrollment failed');
    owners[key] = { organizationId, accountId: principal.accountId };
    for (const product of key === 'shopper-b' ? [] : products)
      await saveWishlistProduct(database.db, owners[key]!, product.id);
  }
  for (const key of ['analyst', 'no-analytics', 'other-analyst']) {
    const membership = (
      await sql<{
        id: string;
      }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status,display_name,activated_at)
      values (${key === 'other-analyst' ? other : organizationId},${users[key]}::uuid,'STANDARD','ACTIVE',${`Synthetic ${key}`},now()) returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    if (key !== 'no-analytics')
      await sql`insert into iam.membership_capability_grants(membership_id,capability_code) values (${membership}::uuid,'analytics.view')`.execute(
        database.db,
      );
  }
  const source = readFileSync('Stitch/stitch_maevelle_mobile_design_system (4)/code.html', 'utf8');
  const urls = [...source.matchAll(/<img[^>]+src="(https:\/\/lh3.googleusercontent.com\/[^"]+)"/g)]
    .slice(0, 4)
    .map((m) => m[1]!);
  const assets: string[] = [];
  for (const [n, url] of urls.entries()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fixture media fetch failed');
    const content = Buffer.from(await response.arrayBuffer());
    const processed = await inspectAndProcessImage(content);
    const asset = (
      await sql<{
        id: string;
      }>`insert into media.media_assets(organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,alt_text,upload_source)
      values (${organizationId},'IMAGE','PUBLIC','READY',${`editorial-fixture-${n}.png`},'png','Editorial accessory photograph','SYSTEM_GENERATED') returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    const key = `organizations/${organizationId}/assets/${asset}/original.png`;
    mkdirSync(
      `${config.mediaStoragePath}/public/organizations/${organizationId}/assets/${asset}/renditions`,
      { recursive: true },
    );
    writeFileSync(`${config.mediaStoragePath}/public/${key}`, content);
    const object = (
      await sql<{
        id: string;
      }>`insert into media.media_objects(organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,byte_size)
      values (${organizationId},${asset}::uuid,'ORIGINAL','local','public',${key},'image/png',${content.length}) returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    await sql`update media.media_assets set current_object_id=${object}::uuid where id=${asset}::uuid`.execute(
      database.db,
    );
    for (const r of processed.renditions) {
      const renditionKey = `organizations/${organizationId}/assets/${asset}/renditions/${r.key}.webp`;
      writeFileSync(`${config.mediaStoragePath}/public/${renditionKey}`, r.content);
      await sql`insert into media.media_renditions(organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,object_key,mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version)
        values (${organizationId},${asset}::uuid,${object}::uuid,${r.key},'local','public',${renditionKey},${r.mimeType},${r.byteSize},${createHash('sha256').update(r.content).digest('hex')},${r.width},${r.height},'qa07a')`.execute(
        database.db,
      );
    }
    assets.push(asset);
  }
  if (assets.length !== 4) throw new Error('Four fixture images required');
  for (const [n, p] of products.entries())
    await sql`insert into catalog.product_media(organization_id,product_id,asset_id,role,is_primary)
    values (${organizationId},${p.id}::uuid,${assets[n % 4]}::uuid,'GALLERY',true)`.execute(
      database.db,
    );
  const key = shareKey(config.authEncryptionKey);
  const shares = [];
  for (let n = 0; n < 22; n++)
    shares.push(
      await createShare(database.db, organizationId, [{ productId: products[n]!.id }], {
        owner: owners['shopper-a']!,
        selection: 'selected',
        operationId: shareToken(),
        key,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      }),
    );
  const guest = await createShare(
    database.db,
    organizationId,
    products.slice(0, 3).map((p) => ({ productId: p.id })),
    {
      operationId: shareToken(),
      key,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      creationScope: 'SELECTED',
    },
  );
  writeFileSync(
    '/tmp/maevelle-phase07a/fixture.json',
    JSON.stringify(
      { organizationId, other, users, owners, products, shares, guest, password },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      products: products.length,
      images: assets.length,
      accountASaved: products.length,
      shares: shares.length,
      organizations: 2,
    }),
  );
} finally {
  await database.close();
}
