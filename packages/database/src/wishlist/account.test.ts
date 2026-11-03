import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { createDatabase, type DatabaseClient } from '../index.js';
import { migrationProvider } from '../migrations/index.js';
import { createOrganization } from '../platform.js';
import { mergeCustomers } from '../customers.js';
import { createShare, openPublicShare, claimGuestShare, manageAccountShare, manageGuestShare, getAccountShareLink, rotateAccountShareLink, cleanupWishlistShares } from './share-lifecycle.js';
import { shareToken, tokenDigest } from './share-crypto.js';
import {
  getWishlistPage,
  getWishlistSavedState,
  mergeGuestWishlist,
  removeWishlistProduct,
  saveWishlistProduct,
  type WishlistOwner,
} from './account.js';

const testUrl = process.env.TEST_DATABASE_URL;
const enabled = testUrl && new URL(testUrl).pathname === '/maevelle_test';
const disposableName = `maevelle_wishlist_${crypto.randomUUID().replaceAll('-', '')}`;
let admin: Pool;
let database: DatabaseClient;
let legacy: { organizationId: string; shareId: string; productId: string; viewToken: string; manageToken: string; accountId: string; listId: string };

async function ownerFixture(): Promise<WishlistOwner> {
  const organization = await createOrganization(database.db, {
    code: `wl${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    displayName: 'Wishlist fixture',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const user = await sql<{ id: string }>`
    insert into iam.users (name,email,email_verified)
    values ('Shopper',${`${crypto.randomUUID()}@example.test`},true)
    returning id::text
  `.execute(database.db);
  const customer = await sql<{ id: string }>`
    insert into customers.customers (organization_id,customer_number,display_name)
    values (${organization.id},${`T-${crypto.randomUUID()}`},'Shopper') returning id::text
  `.execute(database.db);
  const account = await sql<{ id: string }>`
    insert into customers.customer_accounts
      (organization_id,customer_id,user_id,link_type,status)
    values (${organization.id},${customer.rows[0]!.id},${user.rows[0]!.id},'GUEST_CONVERSION','ACTIVE')
    returning id::text
  `.execute(database.db);
  return { organizationId: organization.id, accountId: account.rows[0]!.id };
}

async function productFixture(owner: WishlistOwner, suffix: string) {
  const type = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id,code,name)
    values (${owner.organizationId},${`test-${suffix}`},'Test') returning id::text
  `.execute(database.db);
  const product = await sql<{ id: string }>`
    insert into catalog.products
      (organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values (${owner.organizationId},${type.rows[0]!.id},${`wishlist-${suffix}`},'Saved item',
      'ACTIVE','PUBLISHED',now()) returning id::text
  `.execute(database.db);
  const variant = await sql<{ id: string }>`
    insert into catalog.product_variants
      (organization_id,product_id,sku,sku_normalized,option_signature)
    values (${owner.organizationId},${product.rows[0]!.id},${`SKU-${suffix}`},
      ${`SKU-${suffix.toUpperCase()}`},'default') returning id::text
  `.execute(database.db);
  return { productId: product.rows[0]!.id, variantId: variant.rows[0]!.id };
}

beforeAll(async () => {
  if (!enabled) throw new Error('Use the isolated maevelle_test database URL.');
  const adminUrl = new URL(testUrl!);
  adminUrl.pathname = '/postgres';
  admin = new Pool({ connectionString: adminUrl.toString() });
  await admin.query(`create database "${disposableName}"`);
  const url = new URL(testUrl!);
  url.pathname = `/${disposableName}`;
  database = createDatabase({ connectionString: url.toString(), maxConnections: 4 });
  const migrator = new Migrator({ db: database.db, provider: migrationProvider });
  const throughSharing = await migrator.migrateTo('3208_wishlist_sharing');
  if (throughSharing.error) throw throughSharing.error;
  const organization = await createOrganization(database.db, {
    code: `upgrade${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
    displayName: 'Pre-upgrade guest sharing',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const productType = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
    values (${organization.id},'legacy','Legacy') returning id::text`.execute(database.db);
  const product = await sql<{ id: string }>`insert into catalog.products
    (organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values (${organization.id},${productType.rows[0]!.id}::uuid,'legacy-share','Legacy share',
      'ACTIVE','PUBLISHED',now()) returning id::text`.execute(database.db);
  await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
    values (${organization.id},${product.rows[0]!.id}::uuid,'legacy-share','Legacy share','Legacy share',now())`.execute(database.db);
  const viewToken = shareToken();
  const manageToken = shareToken();
  const guestShare = await sql<{ id: string }>`
    insert into wishlist.shares
      (organization_id,view_token_digest,manage_token_digest,expires_at)
    values (${organization.id},${tokenDigest(viewToken)},
      ${tokenDigest(manageToken)},now()+interval '30 days')
    returning id::text
  `.execute(database.db);
  await sql`insert into wishlist.share_items(organization_id,share_id,product_id,position)
    values (${organization.id},${guestShare.rows[0]!.id}::uuid,${product.rows[0]!.id}::uuid,1)`.execute(database.db);
  const throughAccount = await migrator.migrateTo('3209_account_wishlist');
  if (throughAccount.error) throw throughAccount.error;
  const user = await sql<{ id: string }>`insert into iam.users(name,email,email_verified)
    values ('Legacy owner',${`${crypto.randomUUID()}@example.test`},true) returning id::text`.execute(database.db);
  const customer = await sql<{ id: string }>`insert into customers.customers(organization_id,customer_number,display_name)
    values (${organization.id},${`L-${crypto.randomUUID()}`},'Legacy owner') returning id::text`.execute(database.db);
  const account = await sql<{ id: string }>`insert into customers.customer_accounts
    (organization_id,customer_id,user_id,link_type,status)
    values (${organization.id},${customer.rows[0]!.id}::uuid,${user.rows[0]!.id}::uuid,'GUEST_CONVERSION','ACTIVE') returning id::text`.execute(database.db);
  const list = await sql<{ id: string }>`insert into wishlist.account_lists(organization_id,owner_account_id)
    values (${organization.id},${account.rows[0]!.id}::uuid) returning id::text`.execute(database.db);
  await sql`insert into wishlist.account_items(organization_id,wishlist_id,product_id)
    values (${organization.id},${list.rows[0]!.id}::uuid,${product.rows[0]!.id}::uuid)`.execute(database.db);
  await sql`insert into wishlist.merge_receipts
    (organization_id,wishlist_id,merge_id,request_digest,account_version,result,expires_at)
    values (${organization.id},${list.rows[0]!.id}::uuid,${crypto.randomUUID()}::uuid,
      ${Buffer.alloc(32, 1)},1,'{}'::jsonb,now()+interval '90 days')`.execute(database.db);
  const throughAnalytics = await migrator.migrateTo('3212_wishlist_analytics');
  if (throughAnalytics.error) throw throughAnalytics.error;
  expect(throughAnalytics.results?.map(({ migrationName, status }) => [migrationName, status])).toEqual([
    ['3210_wishlist_share_lifecycle', 'Success'],
    ['3211_wishlist_share_receipt_tombstones', 'Success'],
    ['3212_wishlist_analytics', 'Success'],
  ]);
  // Runtime CRM commands use the current cross-domain schema.
  const current = await migrator.migrateToLatest();
  if (current.error) throw current.error;
  legacy = { organizationId: organization.id, shareId: guestShare.rows[0]!.id,
    productId: product.rows[0]!.id, viewToken, manageToken,
    accountId: account.rows[0]!.id, listId: list.rows[0]!.id };
  const retained = await sql<{ id: string }>`
    select id::text from wishlist.shares where id=${guestShare.rows[0]!.id}::uuid
  `.execute(database.db);
  expect(retained.rows).toHaveLength(1);
});

afterAll(async () => {
  await database?.close();
  if (admin) {
    await admin.query(`drop database if exists "${disposableName}"`);
    await admin.end();
  }
});

describe('account Wishlist persistence', () => {
  it('exposes the migrated share lifecycle columns, constraints and cleanup indexes', async () => {
    const columns = await sql<{ column_name: string; is_nullable: string }>`
      select column_name,is_nullable from information_schema.columns
      where table_schema='wishlist' and table_name='share_create_receipts'
        and column_name in ('request_expires_at','response_ciphertext','share_id')
    `.execute(database.db);
    expect(new Map(columns.rows.map((row) => [row.column_name, row.is_nullable]))).toEqual(new Map([
      ['request_expires_at', 'NO'], ['response_ciphertext', 'YES'], ['share_id', 'YES'],
    ]));
    const indexes = await sql<{ indexname: string }>`select indexname from pg_indexes
      where schemaname='wishlist' and indexname in
        ('wishlist_shares_owner_history','wishlist_shares_retention',
          'wishlist_share_receipts_ciphertext_cleanup','wishlist_share_receipts_tombstone_cleanup')`.execute(database.db);
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual([
      'wishlist_share_receipts_ciphertext_cleanup', 'wishlist_share_receipts_tombstone_cleanup',
      'wishlist_shares_owner_history', 'wishlist_shares_retention',
    ]);
    const constraints = await sql<{ conname: string }>`select conname from pg_constraint
      where connamespace='wishlist'::regnamespace and conname in
        ('wishlist_share_owner_fk','wishlist_share_owner_credential_ck',
          'wishlist_share_item_variant_fk','wishlist_share_receipt_share_fk')`.execute(database.db);
    expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
      'wishlist_share_item_variant_fk', 'wishlist_share_owner_credential_ck',
      'wishlist_share_owner_fk', 'wishlist_share_receipt_share_fk',
    ]);
  });
  it('preserves populated 3208/3209 guest shares and account rows through 3210', async () => {
    expect((await openPublicShare(database.db, legacy.organizationId, legacy.viewToken)).products.map((item) => item.id)).toEqual([legacy.productId]);
    expect((await manageGuestShare(database.db, legacy.organizationId, legacy.manageToken, 'inspect')).id).toBe(legacy.shareId);
    const rows = await sql<{ account_items: number; merge_receipts: number; share_items: number }>`
      select (select count(*)::int from wishlist.account_items where organization_id=${legacy.organizationId}) account_items,
        (select count(*)::int from wishlist.merge_receipts where organization_id=${legacy.organizationId}) merge_receipts,
        (select count(*)::int from wishlist.share_items where organization_id=${legacy.organizationId}) share_items
    `.execute(database.db);
    expect(rows.rows[0]).toEqual({ account_items: 1, merge_receipts: 1, share_items: 1 });
  });
  it('enforces share tenant, ownership, order, credential, version and receipt constraints', async () => {
    const foreign = await ownerFixture();
    const foreignProduct = await productFixture(foreign, `constraint-${crypto.randomUUID().slice(0, 8)}`);
    const share = await sql<{ id: string }>`insert into wishlist.shares
      (organization_id,view_token_digest,manage_token_digest,expires_at)
      values (${legacy.organizationId},${tokenDigest(shareToken())},${tokenDigest(shareToken())},now()+interval '30 days')
      returning id::text`.execute(database.db);
    const id = share.rows[0]!.id;
    await expect(sql`update wishlist.shares set owner_account_id=${foreign.accountId}::uuid,
      manage_token_digest=null where id=${id}::uuid`.execute(database.db)).rejects.toMatchObject({ code: '23503' });
    await expect(sql`update wishlist.shares set owner_account_id=${legacy.accountId}::uuid
      where id=${id}::uuid`.execute(database.db)).rejects.toMatchObject({ code: '23514' });
    await expect(sql`update wishlist.shares set version=0 where id=${id}::uuid`.execute(database.db)).rejects.toMatchObject({ code: '23514' });
    await expect(sql`insert into wishlist.share_items(organization_id,share_id,product_id,position)
      values (${legacy.organizationId},${id}::uuid,${foreignProduct.productId}::uuid,1)`.execute(database.db)).rejects.toMatchObject({ code: '23503' });
    await sql`insert into wishlist.share_items(organization_id,share_id,product_id,position)
      values (${legacy.organizationId},${id}::uuid,${legacy.productId}::uuid,1)`.execute(database.db);
    await expect(sql`insert into wishlist.share_items(organization_id,share_id,product_id,position)
      values (${legacy.organizationId},${id}::uuid,${legacy.productId}::uuid,2)`.execute(database.db)).rejects.toMatchObject({ code: '23505' });
    const secondProduct = await productFixture({ organizationId: legacy.organizationId, accountId: legacy.accountId },
      `position-${crypto.randomUUID().slice(0, 8)}`);
    await expect(sql`insert into wishlist.share_items(organization_id,share_id,product_id,position)
      values (${legacy.organizationId},${id}::uuid,${secondProduct.productId}::uuid,1)`.execute(database.db))
      .rejects.toMatchObject({ code: '23505' });
    await expect(sql`update wishlist.share_items set preferred_variant_id=${secondProduct.variantId}::uuid
      where share_id=${id}::uuid and product_id=${legacy.productId}::uuid`.execute(database.db))
      .rejects.toMatchObject({ code: '23503' });
    await expect(sql`insert into wishlist.share_create_receipts
      (organization_id,owner_scope,operation_id,request_digest,share_id,response_ciphertext,expires_at,request_expires_at)
      values (${legacy.organizationId},'guest','short',${Buffer.alloc(32)},${id}::uuid,${Buffer.alloc(40)},now()+interval '1 day',now()+interval '30 days')
      `.execute(database.db)).rejects.toMatchObject({ code: '23514' });
  });
  it('purges encrypted recovery after 48 hours but keeps a creation tombstone until requested expiry', async () => {
    const operationId = shareToken();
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const options = { operationId, expiresAt, key: Buffer.alloc(32, 8) };
    const first = await createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }], options);
    await sql`update wishlist.share_create_receipts set created_at=now()-interval '2 days',
      expires_at=now()-interval '1 minute'
      where organization_id=${legacy.organizationId} and operation_id=${operationId}`.execute(database.db);
    const cleaned = await cleanupWishlistShares(database.db);
    expect(cleaned.receipts).toBeGreaterThanOrEqual(1);
    const receipt = await sql<{ response_ciphertext: Buffer | null }>`select response_ciphertext
      from wishlist.share_create_receipts where organization_id=${legacy.organizationId} and operation_id=${operationId}`.execute(database.db);
    expect(receipt.rows[0]!.response_ciphertext).toBeNull();
    await expect(createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }], options))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    await sql`update wishlist.shares set revoked_at=now()-interval '31 days' where id=${first.id}::uuid`.execute(database.db);
    const purged = await cleanupWishlistShares(database.db);
    expect(purged.shares).toBeGreaterThanOrEqual(1);
    const retained = await sql<{ share_id: string | null }>`select share_id::text from wishlist.share_create_receipts
      where organization_id=${legacy.organizationId} and operation_id=${operationId}`.execute(database.db);
    expect(retained.rows[0]!.share_id).toBeNull();
    await expect(createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }], options))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('serializes concurrent guest and account creation under one operation identity', async () => {
    const key = Buffer.alloc(32, 6);
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const guestOperation = shareToken();
    const guestCalls = await Promise.all(Array.from({ length: 8 }, () => createShare(database.db,
      legacy.organizationId, [{ productId: legacy.productId }], { key, expiresAt, operationId: guestOperation })));
    expect(new Set(guestCalls.map((result) => result.id)).size).toBe(1);
    expect(new Set(guestCalls.map((result) => result.manageToken)).size).toBe(1);
    const guestCount = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${legacy.organizationId} and id=${guestCalls[0]!.id}::uuid`.execute(database.db);
    expect(guestCount.rows[0]!.count).toBe(1);
    await expect(createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }],
      { key: Buffer.alloc(32, 10), expiresAt, operationId: guestOperation })).rejects.toThrow();
    const owner = { organizationId: legacy.organizationId, accountId: legacy.accountId };
    const accountOperation = shareToken();
    const accountCalls = await Promise.all(Array.from({ length: 6 }, () => createShare(database.db,
      legacy.organizationId, [], { key, expiresAt, operationId: accountOperation, owner, selection: 'all' })));
    expect(new Set(accountCalls.map((result) => result.id)).size).toBe(1);
    expect(accountCalls[0]!.manageToken).toBeUndefined();
    await expect(createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }],
      { key, expiresAt, operationId: accountOperation, owner, selection: 'selected' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('serializes distinct account creations at the 50-active-share limit', async () => {
    const owner = await ownerFixture();
    const product = await productFixture(owner, `active-cap-${crypto.randomUUID().slice(0, 8)}`);
    await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
      select organization_id,id,handle,title,title,now() from catalog.products where id=${product.productId}::uuid`.execute(database.db);
    await saveWishlistProduct(database.db, owner, product.productId, {});
    await sql`insert into wishlist.shares(organization_id,owner_account_id,view_token_digest,expires_at)
      select ${owner.organizationId}::uuid,${owner.accountId}::uuid,
        decode(replace(uuidv7()::text,'-',''),'hex'),now()+interval '30 days'
      from generate_series(1,49)`.execute(database.db);
    const options = () => ({ owner, key: Buffer.alloc(32, 7), selection: 'all' as const,
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), operationId: shareToken() });
    const attempts = await Promise.allSettled([createShare(database.db, owner.organizationId, [], options()),
      createShare(database.db, owner.organizationId, [], options())]);
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const count = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid
        and revoked_at is null and expires_at>now()`.execute(database.db);
    expect(count.rows[0]!.count).toBe(50);
  });
  it('rejects share-all when more than 100 eligible account items exist', async () => {
    const owner = await ownerFixture();
    const suffix = crypto.randomUUID().slice(0, 8);
    const type = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
      values (${owner.organizationId},${`all-${suffix}`},'Share all') returning id::text`.execute(database.db);
    await sql`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select ${owner.organizationId}::uuid,${type.rows[0]!.id}::uuid,${`all-${suffix}-`} || n::text,
        'Item ' || n::text,'ACTIVE','PUBLISHED',now() from generate_series(1,101) n`.execute(database.db);
    await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
      select organization_id,id,handle,title,title,now() from catalog.products
      where organization_id=${owner.organizationId} and product_type_id=${type.rows[0]!.id}::uuid`.execute(database.db);
    const list = await sql<{ id: string }>`insert into wishlist.account_lists(organization_id,owner_account_id)
      values (${owner.organizationId},${owner.accountId}::uuid) returning id::text`.execute(database.db);
    await sql`insert into wishlist.account_items(organization_id,wishlist_id,product_id)
      select organization_id,${list.rows[0]!.id}::uuid,id from catalog.products
      where organization_id=${owner.organizationId} and product_type_id=${type.rows[0]!.id}::uuid`.execute(database.db);
    await expect(createShare(database.db, owner.organizationId, [], { owner, selection: 'all',
      key: Buffer.alloc(32, 7), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      operationId: shareToken() })).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
    const count = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid`.execute(database.db);
    expect(count.rows[0]!.count).toBe(0);
  });
  it('keeps view and guest management authority separate across expiry and revocation', async () => {
    const key = Buffer.alloc(32, 9);
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const guest = await createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }],
      { key, expiresAt, operationId: shareToken() });
    await expect(manageGuestShare(database.db, legacy.organizationId, guest.viewToken, 'revoke')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const renewedAt = new Date(Date.now() + 40 * 86400_000).toISOString();
    const first = await manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'set-expiry', renewedAt);
    const second = await manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'set-expiry', renewedAt);
    expect(second.version).toBe(first.version);
    await manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'revoke');
    await manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'revoke');
    await expect(manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'set-expiry', renewedAt))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(openPublicShare(database.db, legacy.organizationId, guest.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const expired = await createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }],
      { key, expiresAt, operationId: shareToken() });
    await sql`update wishlist.shares set expires_at=now() where id=${expired.id}::uuid`.execute(database.db);
    await expect(openPublicShare(database.db, legacy.organizationId, expired.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(manageGuestShare(database.db, legacy.organizationId, expired.manageToken!, 'set-expiry', renewedAt))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('allows only one account to claim a guest share under concurrent attempts', async () => {
    const secondUser = await sql<{ id: string }>`insert into iam.users(name,email,email_verified)
      values ('Second claimant',${`${crypto.randomUUID()}@example.test`},true) returning id::text`.execute(database.db);
    const secondCustomer = await sql<{ id: string }>`insert into customers.customers(organization_id,customer_number,display_name)
      values (${legacy.organizationId},${`C-${crypto.randomUUID()}`},'Second claimant') returning id::text`.execute(database.db);
    const secondAccount = await sql<{ id: string }>`insert into customers.customer_accounts
      (organization_id,customer_id,user_id,link_type,status)
      values (${legacy.organizationId},${secondCustomer.rows[0]!.id}::uuid,${secondUser.rows[0]!.id}::uuid,
        'GUEST_CONVERSION','ACTIVE') returning id::text`.execute(database.db);
    const guest = await createShare(database.db, legacy.organizationId, [{ productId: legacy.productId }],
      { key: Buffer.alloc(32, 3), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), operationId: shareToken() });
    await expect(claimGuestShare(database.db, { organizationId: legacy.organizationId, accountId: legacy.accountId },
      guest.id, guest.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const contenders = [legacy.accountId, secondAccount.rows[0]!.id];
    const results = await Promise.allSettled(contenders.map((accountId) => claimGuestShare(database.db,
      { organizationId: legacy.organizationId, accountId }, guest.id, guest.manageToken!)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winner = contenders[results.findIndex((result) => result.status === 'fulfilled')]!;
    expect(await claimGuestShare(database.db, { organizationId: legacy.organizationId, accountId: winner },
      guest.id, guest.manageToken!)).toEqual({ id: guest.id, claimed: true });
    await expect(manageGuestShare(database.db, legacy.organizationId, guest.manageToken!, 'inspect')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await openPublicShare(database.db, legacy.organizationId, guest.viewToken)).products).toHaveLength(1);
  });
  it('creates and opens a bounded 100-product snapshot without truncation', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const type = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
      values (${legacy.organizationId},${`bulk-${suffix}`},'Bulk test') returning id::text`.execute(database.db);
    const products = await sql<{ id: string }>`insert into catalog.products
      (organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select ${legacy.organizationId}::uuid,${type.rows[0]!.id}::uuid,
        ${`bulk-${suffix}-`} || n::text,'Bulk ' || n::text,'ACTIVE','PUBLISHED',now()
      from generate_series(1,100) n returning id::text`.execute(database.db);
    await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
      select organization_id,id,handle,title,title,now() from catalog.products
      where organization_id=${legacy.organizationId} and product_type_id=${type.rows[0]!.id}::uuid`.execute(database.db);
    const guest = await createShare(database.db, legacy.organizationId,
      products.rows.map((row) => ({ productId: row.id })),
      { key: Buffer.alloc(32, 4), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), operationId: shareToken() });
    expect(guest.itemCount).toBe(100);
    expect((await openPublicShare(database.db, legacy.organizationId, guest.viewToken)).products).toHaveLength(100);
    await expect(createShare(database.db, legacy.organizationId,
      [...products.rows, { id: legacy.productId }].map((row) => ({ productId: row.id })),
      { key: Buffer.alloc(32, 4), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), operationId: shareToken() }))
      .rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });
  it('cleans expired shares in bounded retryable batches', async () => {
    await sql`insert into wishlist.shares
      (organization_id,view_token_digest,manage_token_digest,created_at,expires_at)
      select ${legacy.organizationId}::uuid,
        decode(replace(uuidv7()::text,'-',''),'hex'),
        decode(replace(uuidv7()::text,'-',''),'hex'),
        now()-interval '100 days',now()-interval '31 days'
      from generate_series(1,150)`.execute(database.db);
    const before = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${legacy.organizationId} and expires_at<now()-interval '30 days'`.execute(database.db);
    expect(before.rows[0]!.count).toBeGreaterThanOrEqual(150);
    expect((await cleanupWishlistShares(database.db, 100)).shares).toBe(100);
    const afterFirst = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${legacy.organizationId} and expires_at<now()-interval '30 days'`.execute(database.db);
    expect(afterFirst.rows[0]!.count).toBe(before.rows[0]!.count - 100);
    expect((await cleanupWishlistShares(database.db, 100)).shares).toBe(afterFirst.rows[0]!.count);
    expect((await cleanupWishlistShares(database.db, 100)).shares).toBe(0);
  });
  it('blocks a CRM merge that would delete an account owning a share', async () => {
    const sourceUser = await sql<{ id: string }>`insert into iam.users(name,email,email_verified)
      values ('Merge source',${`${crypto.randomUUID()}@example.test`},true) returning id::text`.execute(database.db);
    const targetUser = await sql<{ id: string }>`insert into iam.users(name,email,email_verified)
      values ('Merge target',${`${crypto.randomUUID()}@example.test`},true) returning id::text`.execute(database.db);
    const source = await sql<{ id: string; version: string }>`insert into customers.customers
      (organization_id,customer_number,display_name) values (${legacy.organizationId},${`MS-${crypto.randomUUID()}`},
        'Merge source') returning id::text,version::text`.execute(database.db);
    const target = await sql<{ id: string; version: string }>`insert into customers.customers
      (organization_id,customer_number,display_name) values (${legacy.organizationId},${`MT-${crypto.randomUUID()}`},
        'Merge target') returning id::text,version::text`.execute(database.db);
    await sql`insert into customers.customer_accounts(organization_id,customer_id,user_id,link_type,status)
      values (${legacy.organizationId},${source.rows[0]!.id}::uuid,${sourceUser.rows[0]!.id}::uuid,
        'GUEST_CONVERSION','ACTIVE')`.execute(database.db);
    const targetAccount = await sql<{ id: string }>`insert into customers.customer_accounts
      (organization_id,customer_id,user_id,link_type,status)
      values (${legacy.organizationId},${target.rows[0]!.id}::uuid,${targetUser.rows[0]!.id}::uuid,
        'GUEST_CONVERSION','SUSPENDED') returning id::text`.execute(database.db);
    const share = await sql<{ id: string }>`insert into wishlist.shares
      (organization_id,owner_account_id,view_token_digest,expires_at)
      values (${legacy.organizationId},${targetAccount.rows[0]!.id}::uuid,${tokenDigest(shareToken())},
        now()+interval '30 days') returning id::text`.execute(database.db);
    await expect(mergeCustomers(database.db, { organizationId: legacy.organizationId,
      actorId: sourceUser.rows[0]!.id, sourceCustomerId: source.rows[0]!.id,
      targetCustomerId: target.rows[0]!.id, sourceExpectedVersion: Number(source.rows[0]!.version),
      targetExpectedVersion: Number(target.rows[0]!.version), reason: 'Verified duplicate review',
      idempotencyKey: crypto.randomUUID() })).rejects.toThrow('Resolve account-owned Wishlist shares');
    const retained = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where id=${share.rows[0]!.id}::uuid and owner_account_id=${targetAccount.rows[0]!.id}::uuid`.execute(database.db);
    expect(retained.rows[0]!.count).toBe(1);
  });
  it('creates recoverable guest and account snapshots with guarded ownership and revocation', async () => {
    const owner = await ownerFixture();
    const product = await productFixture(owner, `share-${crypto.randomUUID().slice(0, 8)}`);
    await sql`insert into search.catalog_documents
      (organization_id,product_id,handle,title,search_text,published_at)
      select organization_id,id,handle,title,title,now() from catalog.products where id=${product.productId}::uuid`.execute(database.db);
    const key = Buffer.alloc(32, 7);
    const operationId = () => crypto.getRandomValues(new Uint8Array(32)).reduce((text, value) => text + String.fromCharCode(value), '');
    const guestId = Buffer.from(operationId(), 'binary').toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const guest = await createShare(database.db, owner.organizationId, [{ productId: product.productId }], { operationId: guestId, expiresAt, key });
    const replay = await createShare(database.db, owner.organizationId, [{ productId: product.productId }], { operationId: guestId, expiresAt, key });
    expect(replay).toEqual(guest);
    await expect(createShare(database.db, owner.organizationId, [{ productId: product.productId, preferredVariantId: product.variantId }], { operationId: guestId, expiresAt, key })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await openPublicShare(database.db, owner.organizationId, guest.viewToken)).products.map((item) => item.id)).toEqual([product.productId]);
    await claimGuestShare(database.db, owner, guest.id, guest.manageToken!);
    await claimGuestShare(database.db, owner, guest.id, guest.manageToken!);
    const another = await ownerFixture();
    await expect(claimGuestShare(database.db, another, guest.id, guest.manageToken!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getAccountShareLink(database.db, another, guest.id, key)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getAccountShareLink(database.db, owner, guest.id, key)).viewToken).toBe(guest.viewToken);
    const beforeRotation = await manageAccountShare(database.db, owner, guest.id, 'inspect');
    const rotated = await rotateAccountShareLink(database.db, owner, guest.id, key, beforeRotation.version);
    expect(rotated.viewToken).not.toBe(guest.viewToken);
    await expect(rotateAccountShareLink(database.db, owner, guest.id, key, beforeRotation.version)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(openPublicShare(database.db, owner.organizationId, guest.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getAccountShareLink(database.db, owner, guest.id, key)).viewToken).toBe(rotated.viewToken);
    await saveWishlistProduct(database.db, owner, product.productId, {});
    const hidden = await productFixture(owner, `share-hidden-${crypto.randomUUID().slice(0, 8)}`);
    await saveWishlistProduct(database.db, owner, hidden.productId, {});
    await sql`update catalog.products set publication_status='UNPUBLISHED' where id=${hidden.productId}::uuid`.execute(database.db);
    const account = await createShare(database.db, owner.organizationId, [], { operationId: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'), expiresAt, key, owner, selection: 'all' });
    expect(account.manageToken).toBeUndefined();
    expect(account.itemCount).toBe(1);
    await manageAccountShare(database.db, owner, account.id, 'revoke');
    await manageAccountShare(database.db, owner, account.id, 'revoke');
    await expect(openPublicShare(database.db, owner.organizationId, account.viewToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await sql`update catalog.products set publication_status='UNPUBLISHED' where id=${product.productId}::uuid`.execute(database.db);
    expect((await openPublicShare(database.db, owner.organizationId, rotated.viewToken)).products).toEqual([]);
  });
  it('merges atomically with durable replay, preference policy, and exact version conflicts', async () => {
    const owner = await ownerFixture();
    const existing = await productFixture(owner, 'merge-existing');
    const incoming = await productFixture(owner, 'merge-incoming');
    const wrongVariant = await productFixture(owner, 'merge-wrong-variant');
    const foreignOwner = await ownerFixture();
    const foreign = await productFixture(foreignOwner, 'merge-foreign');
    await saveWishlistProduct(database.db, owner, existing.productId, {
      preferredVariantId: existing.variantId,
    });
    const baseVersion = (await getWishlistPage(database.db, owner)).version;
    const unavailable = crypto.randomUUID();
    const input = {
      mergeId: crypto.randomUUID(),
      baseVersion,
      items: [
        {
          productId: existing.productId,
          preferredVariantId: incoming.variantId,
          savedAt: new Date().toISOString(),
        },
        {
          productId: incoming.productId,
          preferredVariantId: incoming.variantId,
          savedAt: new Date().toISOString(),
        },
        { productId: unavailable, preferredVariantId: null, savedAt: new Date().toISOString() },
        {
          productId: wrongVariant.productId,
          preferredVariantId: existing.variantId,
          savedAt: new Date().toISOString(),
        },
        {
          productId: foreign.productId,
          preferredVariantId: null,
          savedAt: new Date().toISOString(),
        },
      ],
    };
    const [first, replay] = await Promise.all([
      mergeGuestWishlist(database.db, owner, input),
      mergeGuestWishlist(database.db, owner, input),
    ]);
    expect([first.previouslyApplied, replay.previouslyApplied].sort()).toEqual([false, true]);
    expect(first.acceptedProductIds).toEqual([incoming.productId]);
    expect(first.alreadyPresentProductIds).toEqual([existing.productId]);
    expect(first.rejectedItems).toEqual(
      expect.arrayContaining([
        { productId: unavailable, reason: 'UNAVAILABLE_PRODUCT' },
        { productId: wrongVariant.productId, reason: 'UNAVAILABLE_VARIANT' },
        { productId: foreign.productId, reason: 'UNAVAILABLE_PRODUCT' },
      ]),
    );
    const page = await getWishlistPage(database.db, owner);
    expect(page.count).toBe(2);
    expect(
      page.items.find((item) => item.productId === existing.productId)?.preferredVariantId,
    ).toBe(existing.variantId);
    await expect(
      mergeGuestWishlist(database.db, owner, { ...input, items: [] }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await removeWishlistProduct(database.db, owner, incoming.productId);
    await expect(
      mergeGuestWishlist(database.db, owner, { ...input, mergeId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(
      (await getWishlistPage(database.db, owner)).items.some(
        (item) => item.productId === incoming.productId,
      ),
    ).toBe(false);
    await saveWishlistProduct(database.db, owner, wrongVariant.productId);
    const fillVersion = (await getWishlistPage(database.db, owner)).version;
    const filled = await mergeGuestWishlist(database.db, owner, {
      mergeId: crypto.randomUUID(),
      baseVersion: fillVersion,
      items: [
        {
          productId: wrongVariant.productId,
          preferredVariantId: wrongVariant.variantId,
          savedAt: new Date().toISOString(),
        },
      ],
    });
    expect(filled.acceptedProductIds).toEqual([wrongVariant.productId]);
    expect(
      (await getWishlistPage(database.db, owner)).items.find(
        (item) => item.productId === wrongVariant.productId,
      )?.preferredVariantId,
    ).toBe(wrongVariant.variantId);
  });

  it('keeps one entry per product and preserves preference and ordering on repeated PUT', async () => {
    const owner = await ownerFixture();
    const product = await productFixture(owner, 'a');
    const first = await saveWishlistProduct(database.db, owner, product.productId, {
      preferredVariantId: product.variantId,
    });
    const repeated = await saveWishlistProduct(database.db, owner, product.productId);
    expect(repeated).toEqual(first);
    const page = await getWishlistPage(database.db, owner);
    expect(page.count).toBe(1);
    expect(page.items[0]?.preferredVariantId).toBe(product.variantId);
    expect(page.items[0]?.savedAt).toBeDefined();
    const cleared = await saveWishlistProduct(database.db, owner, product.productId, {
      preferredVariantId: null,
      expectedVersion: first.version,
    });
    expect(cleared.preferredVariantId).toBeNull();
    expect(cleared.version).toBe(first.version + 1);
    expect((await getWishlistPage(database.db, owner)).items[0]?.savedAt).toBe(
      page.items[0]?.savedAt,
    );
    await saveWishlistProduct(database.db, owner, product.productId, {
      preferredVariantId: product.variantId,
    });
    await sql`delete from catalog.product_variants
      where organization_id=${owner.organizationId} and id=${product.variantId}`.execute(
      database.db,
    );
    expect((await getWishlistPage(database.db, owner)).items[0]?.preferredVariantId).toBeNull();
  });

  it('serializes saves, checks ownership and publication, and pages with stable cursor', async () => {
    const owner = await ownerFixture();
    const other = await ownerFixture();
    const a = await productFixture(owner, 'b');
    const b = await productFixture(owner, 'c');
    await Promise.all([
      saveWishlistProduct(database.db, owner, a.productId),
      saveWishlistProduct(database.db, owner, a.productId),
    ]);
    await saveWishlistProduct(database.db, owner, b.productId);
    expect((await getWishlistPage(database.db, owner, { limit: 1 })).nextCursor).toBeTruthy();
    const first = await getWishlistPage(database.db, owner, { limit: 1 });
    const second = await getWishlistPage(database.db, owner, {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(new Set([...first.items, ...second.items].map((item) => item.productId)).size).toBe(2);
    expect(
      (await getWishlistSavedState(database.db, owner, [a.productId, b.productId])).count,
    ).toBe(2);
    expect(
      (await getWishlistSavedState(database.db, other, [a.productId])).savedProductIds,
    ).toEqual([]);
    await expect(saveWishlistProduct(database.db, other, a.productId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      saveWishlistProduct(database.db, owner, b.productId, { preferredVariantId: a.variantId }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      getWishlistPage(database.db, owner, { cursor: 'tampered!' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await sql`update catalog.products set publication_status='UNPUBLISHED'
      where organization_id=${owner.organizationId} and id=${a.productId}`.execute(database.db);
    expect(
      (await getWishlistPage(database.db, owner)).items.find(
        (item) => item.productId === a.productId,
      )?.product,
    ).toBeNull();
    await expect(
      saveWishlistProduct(database.db, owner, a.productId, { preferredVariantId: a.variantId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const removed = await removeWishlistProduct(database.db, owner, a.productId);
    expect(await removeWishlistProduct(database.db, owner, a.productId)).toEqual(removed);
  });

  it('pages every item when saved timestamps share microseconds', async () => {
    const owner = await ownerFixture();
    const products = await Promise.all(['cursor-a', 'cursor-b', 'cursor-c'].map((suffix) =>
      productFixture(owner, suffix)));
    for (const product of products)
      await saveWishlistProduct(database.db, owner, product.productId);
    await sql`update wishlist.account_items set saved_at='2026-10-31T12:34:56.123456Z'::timestamptz
      where organization_id=${owner.organizationId}`.execute(database.db);
    const found: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await getWishlistPage(database.db, owner, {
        limit: 1, ...(cursor ? { cursor } : {}),
      });
      found.push(...page.items.map((item) => item.productId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(found).toHaveLength(3);
    expect(new Set(found)).toEqual(new Set(products.map((product) => product.productId)));
  });

  it('rejects inactive account mapping and stale list version', async () => {
    const owner = await ownerFixture();
    const product = await productFixture(owner, 'd');
    await expect(
      saveWishlistProduct(database.db, owner, product.productId, { expectedVersion: 99 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await sql`update customers.customer_accounts set status='SUSPENDED'
      where organization_id=${owner.organizationId} and id=${owner.accountId}`.execute(database.db);
    await expect(getWishlistPage(database.db, owner)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await sql`update customers.customer_accounts set status='ACTIVE'
      where organization_id=${owner.organizationId} and id=${owner.accountId}`.execute(database.db);
    await sql`update iam.users set email_verified=false
      where id=(select user_id from customers.customer_accounts where id=${owner.accountId}::uuid)`.execute(
      database.db,
    );
    await expect(getWishlistPage(database.db, owner)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
