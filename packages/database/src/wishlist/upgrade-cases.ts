/** Populated forward-upgrade fixtures for the Wishlist dependency chain. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { UpgradeCase } from '../upgrade-cases.js';
let productId = '';
let shareId = '';
let accountId = '';
let listId = '';
const view = Buffer.alloc(32, 31),
  manage = Buffer.alloc(32, 32);
export const wishlistUpgradeCases: Record<string, UpgradeCase> = {
  '3207_product_recommendations': {
    async before(db, organizationId) {
      const type = (
        await sql<{
          id: string;
        }>`insert into catalog.product_types(organization_id,code,name) values (${organizationId},'wishlist-upgrade','Upgrade') returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
      productId = (
        await sql<{
          id: string;
        }>`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
        values (${organizationId},${type}::uuid,'wishlist-upgrade','Upgrade piece','ACTIVE','PUBLISHED',now()) returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
    },
    async after(db, organizationId) {
      const placements = await sql<{
        code: string;
        target_count: number;
      }>`select code,target_count from recommendations.placements where organization_id=${organizationId} order by code`.execute(
        db,
      );
      assert.deepEqual(placements.rows, [
        { code: 'pdp_complementary', target_count: 3 },
        { code: 'pdp_similar', target_count: 4 },
      ]);
      await sql`insert into recommendations.product_settings(organization_id,source_product_id,placement_code) values (${organizationId},${productId}::uuid,'pdp_similar')`.execute(
        db,
      );
    },
  },
  '3208_wishlist_sharing': {
    async before() {},
    async after(db, organizationId) {
      shareId = (
        await sql<{
          id: string;
        }>`insert into wishlist.shares(organization_id,view_token_digest,manage_token_digest,expires_at)
        values (${organizationId},${view},${manage},now()+interval '30 days') returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
      await sql`insert into wishlist.share_items(organization_id,share_id,product_id,position) values (${organizationId},${shareId}::uuid,${productId}::uuid,1)`.execute(
        db,
      );
      await assert.rejects(
        () =>
          sql`insert into wishlist.share_items(organization_id,share_id,product_id,position) values (${organizationId},${shareId}::uuid,${productId}::uuid,2)`.execute(
            db,
          ),
        /unique/,
      );
    },
  },
  '3209_account_wishlist': {
    async before(db, organizationId) {
      const user = (
        await sql<{
          id: string;
        }>`insert into iam.users(name,email,email_verified) values ('Upgrade shopper','wishlist-upgrade@example.test',true) returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
      const customer = (
        await sql<{
          id: string;
        }>`insert into customers.customers(organization_id,customer_number,display_name) values (${organizationId},'UP-WL','Upgrade shopper') returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
      accountId = (
        await sql<{
          id: string;
        }>`insert into customers.customer_accounts(organization_id,customer_id,user_id,link_type,status) values (${organizationId},${customer}::uuid,${user}::uuid,'GUEST_CONVERSION','ACTIVE') returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
    },
    async after(db, organizationId) {
      listId = (
        await sql<{
          id: string;
        }>`insert into wishlist.account_lists(organization_id,owner_account_id) values (${organizationId},${accountId}::uuid) returning id::text`.execute(
          db,
        )
      ).rows[0]!.id;
      await sql`insert into wishlist.account_items(organization_id,wishlist_id,product_id) values (${organizationId},${listId}::uuid,${productId}::uuid)`.execute(
        db,
      );
      const share = (
        await sql<{
          view_token_digest: Buffer;
        }>`select view_token_digest from wishlist.shares where organization_id=${organizationId} and id=${shareId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      assert.deepEqual(share.view_token_digest, view);
      await assert.rejects(
        () =>
          sql`insert into wishlist.account_lists(organization_id,owner_account_id) values (${organizationId},${accountId}::uuid)`.execute(
            db,
          ),
        /unique/,
      );
    },
  },
  '3210_wishlist_share_lifecycle': {
    async before() {},
    async after(db, organizationId) {
      const share = (
        await sql<{
          owner_account_id: string | null;
          manage_token_digest: Buffer;
          view_token_ciphertext: Buffer | null;
          version: string;
        }>`select owner_account_id,manage_token_digest,view_token_ciphertext,version::text from wishlist.shares where organization_id=${organizationId} and id=${shareId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      assert.equal(share.owner_account_id, null);
      assert.deepEqual(share.manage_token_digest, manage);
      assert.equal(share.view_token_ciphertext, null);
      assert.equal(share.version, '1');
      await sql`insert into wishlist.share_create_receipts(organization_id,owner_scope,operation_id,request_digest,share_id,response_ciphertext,expires_at)
        values (${organizationId},'guest',${'x'.repeat(43)},${Buffer.alloc(32, 1)},${shareId}::uuid,${Buffer.from('synthetic encrypted receipt')},now()+interval '48 hours')`.execute(
        db,
      );
      const items = await sql<{
        count: number;
      }>`select count(*)::int count from wishlist.account_items where organization_id=${organizationId} and wishlist_id=${listId}::uuid`.execute(
        db,
      );
      assert.equal(items.rows[0]!.count, 1);
    },
  },
  '3211_wishlist_share_receipt_tombstones': {
    async before() {},
    async after(db, organizationId) {
      const receipt = (
        await sql<{
          request_expires_at: Date;
          expires_at: Date;
        }>`select request_expires_at,expires_at from wishlist.share_create_receipts where organization_id=${organizationId} and share_id=${shareId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      assert.ok(receipt.request_expires_at > receipt.expires_at);
      await sql`delete from wishlist.shares where organization_id=${organizationId} and id=${shareId}::uuid`.execute(
        db,
      );
      const tombstone = (
        await sql<{
          share_id: string | null;
          request_digest: Buffer;
        }>`select share_id,request_digest from wishlist.share_create_receipts where organization_id=${organizationId} and operation_id=${'x'.repeat(43)}`.execute(
          db,
        )
      ).rows[0]!;
      assert.equal(tombstone.share_id, null);
      assert.deepEqual(tombstone.request_digest, Buffer.alloc(32, 1));
      await assert.rejects(
        () =>
          sql`insert into wishlist.account_items(organization_id,wishlist_id,product_id) values (${organizationId},${listId}::uuid,${randomUUID()}::uuid)`.execute(
            db,
          ),
        /foreign key/,
      );
    },
  },
};
