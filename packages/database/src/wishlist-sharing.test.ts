import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Pool } from 'pg';
import { createDatabase, type DatabaseClient } from './index.js';
import { runMigrations } from './migrate.js';
import { createOrganization } from './platform.js';
import { createGuestWishlistShare, manageWishlistShare, openWishlistShare } from './wishlist-sharing.js';

const testUrl = process.env.TEST_DATABASE_URL;
const disposableName = `maevelle_legacy_share_${crypto.randomUUID().replaceAll('-', '')}`;
let admin: Pool;
let database: DatabaseClient;
beforeAll(async () => {
  if (!testUrl || new URL(testUrl).pathname !== '/maevelle_test')
    throw new Error('Use the isolated maevelle_test database URL.');
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  admin = new Pool({ connectionString: adminUrl.toString() });
  await admin.query(`create database "${disposableName}"`);
  const url = new URL(testUrl);
  url.pathname = `/${disposableName}`;
  database = createDatabase({ connectionString: url.toString(), maxConnections: 2 });
  await runMigrations(database.db);
});
afterAll(async () => {
  await database?.close();
  if (admin) {
    await admin.query(`drop database if exists "${disposableName}"`);
    await admin.end();
  }
});

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `wishlist-${crypto.randomUUID().slice(0, 8)}`, displayName: 'Wishlist test',
    timezone: 'Asia/Dhaka', defaultLocale: 'en', defaultCurrency: 'BDT',
  });
  const type = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
    values(${organization.id},'test','Test') returning id::text`.execute(database.db);
  const product = await sql<{ id: string }>`insert into catalog.products
    (organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values(${organization.id},${type.rows[0]!.id},'shareable','Shareable','ACTIVE','PUBLISHED',now())
    returning id::text`.execute(database.db);
  await sql`insert into search.catalog_documents
    (organization_id,product_id,handle,title,search_text,published_at)
    values(${organization.id},${product.rows[0]!.id},'shareable','Shareable','Shareable',now())`.execute(database.db);
  return { organizationId: organization.id, productId: product.rows[0]!.id };
}

describe('guest wishlist snapshot sharing', () => {
  it('stores digests, enforces the management capability, renews and revokes', async () => {
    const { organizationId, productId } = await fixture();
    const share = await createGuestWishlistShare(database.db, organizationId, [productId]);
    expect(share.viewToken).not.toBe(share.manageToken);
    const row = await sql<{ view_token_digest: Buffer; manage_token_digest: Buffer }>`
      select view_token_digest,manage_token_digest from wishlist.shares where id=${share.id}
    `.execute(database.db);
    expect(row.rows[0]!.view_token_digest.toString('utf8')).not.toContain(share.viewToken);
    expect(row.rows[0]!.manage_token_digest.toString('utf8')).not.toContain(share.manageToken);
    expect((await openWishlistShare(database.db, share.viewToken)).productIds).toEqual([productId]);
    await expect(manageWishlistShare(database.db, share.viewToken, 'revoke')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const expiresAt = new Date(Date.now() + 40 * 86400_000).toISOString();
    const renewed = await manageWishlistShare(database.db, share.manageToken, 'renew', expiresAt);
    expect(new Date(renewed.expiresAt).getTime()).toBeGreaterThan(new Date(share.expiresAt).getTime());
    expect(await manageWishlistShare(database.db, share.manageToken, 'renew', expiresAt)).toEqual(renewed);
    await manageWishlistShare(database.db, share.manageToken, 'revoke');
    await expect(openWishlistShare(database.db, share.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects duplicate and unpublished products', async () => {
    const { organizationId, productId } = await fixture();
    await expect(createGuestWishlistShare(database.db, organizationId, [productId, productId])).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
    await sql`update catalog.products set publication_status='UNPUBLISHED' where id=${productId}`.execute(database.db);
    await expect(createGuestWishlistShare(database.db, organizationId, [productId])).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });
});
