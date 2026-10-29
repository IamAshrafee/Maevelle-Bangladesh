import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';

/**
 * Every post-baseline migration needs a case that seeds its pre-upgrade state
 * and proves its intended post-upgrade behavior. CI rejects uncovered names.
 */
export interface UpgradeCase {
  before(db: Kysely<DatabaseSchema>, organizationId: string): Promise<void>;
  after(db: Kysely<DatabaseSchema>, organizationId: string): Promise<void>;
}

let purgingAssetId = '';
let profileAssetId = '';
let customerId = '';
let archivedUrlAssetId = '';
let archivedObjectId = '';
let repairAssetId = '';

export const upgradeCases: Record<string, UpgradeCase> = {
  '3203_media_purge_recovery': {
    async before(db, organizationId) {
      purgingAssetId = randomUUID();
      await sql`
        insert into media.media_assets
          (id, organization_id, asset_type, visibility_class, status, original_filename, normalized_extension, trashed_at)
        values
          (${purgingAssetId}, ${organizationId}, 'IMAGE', 'PUBLIC', 'PURGING', 'legacy-purging.jpg', 'jpg', now())
      `.execute(db);
    },
    async after(db, organizationId) {
      const rows = await sql<{
        purge_retry_after: Date | null;
        purge_attempts: number;
        purge_claim_token: string | null;
        purge_lease_until: Date | null;
      }>`
        select purge_retry_after, purge_attempts, purge_claim_token, purge_lease_until
        from media.media_assets
        where id = ${purgingAssetId} and organization_id = ${organizationId}
      `.execute(db);

      assert.equal(rows.rows.length, 1);
      const row = rows.rows[0];
      assert.ok(row);
      assert.ok(row.purge_retry_after != null, 'purge_retry_after should be set for legacy PURGING assets');
      assert.equal(Number(row.purge_attempts), 0);
      assert.equal(row.purge_claim_token, null);
      assert.equal(row.purge_lease_until, null);

      await assert.rejects(
        () =>
          sql`
            update media.media_assets
            set purge_claim_token = ${randomUUID()}
            where id = ${purgingAssetId}
          `.execute(db),
        /media_purge_lease_pair/u,
      );

      const indexCheck = await sql<{ count: string }>`
        select count(*)::text as count from pg_indexes
        where schemaname = 'media' and indexname = 'media_assets_purge_due'
      `.execute(db);
      assert.equal(indexCheck.rows[0]?.count, '1');
    },
  },

  '3204_media_purge_reference_indexes': {
    async before(db, organizationId) {
      profileAssetId = randomUUID();
      customerId = randomUUID();
      await sql`
        insert into media.media_assets
          (id, organization_id, asset_type, visibility_class, status, original_filename, normalized_extension)
        values
          (${profileAssetId}, ${organizationId}, 'IMAGE', 'PUBLIC', 'READY', 'avatar.jpg', 'jpg')
      `.execute(db);

      await sql`
        insert into customers.customers
          (id, organization_id, customer_number, display_name, status, profile_image_asset_id)
        values
          (${customerId}, ${organizationId}, 'CUST-UPG-001', 'Upgrade Customer', 'ACTIVE', ${profileAssetId})
      `.execute(db);
    },
    async after(db, organizationId) {
      const indexes = await sql<{ indexname: string }>`
        select indexname from pg_indexes
        where indexname in ('assets_media_links_media_asset', 'customers_profile_image_asset')
      `.execute(db);
      assert.equal(indexes.rows.length, 2);

      const foundCustomer = await sql<{ id: string }>`
        select id from customers.customers
        where organization_id = ${organizationId} and profile_image_asset_id = ${profileAssetId}
      `.execute(db);
      assert.equal(foundCustomer.rows[0]?.id, customerId);

      const links = await sql<{ count: string }>`
        select count(*)::text as count from assets.media_links
        where organization_id = ${organizationId} and media_asset_id = ${profileAssetId}
      `.execute(db);
      assert.equal(links.rows[0]?.count, '0');
    },
  },

  '3205_external_media_imports': {
    async before(db, organizationId) {
      archivedUrlAssetId = randomUUID();
      archivedObjectId = randomUUID();
      await sql`
        insert into media.media_assets
          (id, organization_id, asset_type, visibility_class, status, original_filename, normalized_extension, archived_at, version)
        values
          (${archivedUrlAssetId}, ${organizationId}, 'IMAGE', 'PUBLIC', 'ARCHIVED', 'external-archived.jpg', 'jpg', now(), 1)
      `.execute(db);

      await sql`
        insert into media.media_objects
          (id, organization_id, asset_id, object_role, storage_provider, bucket_name, object_key, mime_type, byte_size)
        values
          (${archivedObjectId}, ${organizationId}, ${archivedUrlAssetId}, 'ORIGINAL', 'url', 'external', 'https://example.com/images/product.jpg', 'image/jpeg', 2048)
      `.execute(db);

      await sql`
        update media.media_assets
        set current_object_id = ${archivedObjectId}
        where id = ${archivedUrlAssetId}
      `.execute(db);
    },
    async after(db, organizationId) {
      const importRows = await sql<{
        asset_id: string;
        source_url: string;
        old_object_id: string;
        restore_archived: boolean;
        status: string;
      }>`
        select asset_id, source_url, old_object_id, restore_archived, status
        from media.external_image_imports
        where asset_id = ${archivedUrlAssetId} and organization_id = ${organizationId}
      `.execute(db);

      assert.equal(importRows.rows.length, 1);
      const importRow = importRows.rows[0];
      assert.ok(importRow);
      assert.equal(importRow.source_url, 'https://example.com/images/product.jpg');
      assert.equal(importRow.old_object_id, archivedObjectId);
      assert.equal(importRow.restore_archived, true);
      assert.equal(importRow.status, 'PENDING');

      const assetRows = await sql<{
        status: string;
        archived_at: Date | null;
        version: string | number;
      }>`
        select status, archived_at, version
        from media.media_assets
        where id = ${archivedUrlAssetId}
      `.execute(db);

      assert.equal(assetRows.rows.length, 1);
      const assetRow = assetRows.rows[0];
      assert.ok(assetRow);
      assert.equal(assetRow.status, 'PENDING_UPLOAD');
      assert.equal(assetRow.archived_at, null);
      assert.equal(Number(assetRow.version), 2);

      const claimIndex = await sql<{ count: string }>`
        select count(*)::text as count from pg_indexes
        where schemaname = 'media' and indexname = 'external_image_imports_claim'
      `.execute(db);
      assert.equal(claimIndex.rows[0]?.count, '1');
    },
  },

  '3206_media_rendition_repair': {
    async before(db, organizationId) {
      repairAssetId = randomUUID();
      await sql`
        insert into media.media_assets
          (id, organization_id, asset_type, visibility_class, status, original_filename, normalized_extension)
        values
          (${repairAssetId}, ${organizationId}, 'IMAGE', 'PUBLIC', 'READY', 'rendition-repair.jpg', 'jpg')
      `.execute(db);
    },
    async after(db, organizationId) {
      const rows = await sql<{ restore_archived_after_processing: boolean }>`
        select restore_archived_after_processing
        from media.media_assets
        where id = ${repairAssetId} and organization_id = ${organizationId}
      `.execute(db);

      assert.equal(rows.rows.length, 1);
      const row = rows.rows[0];
      assert.ok(row);
      assert.equal(row.restore_archived_after_processing, false);

      await sql`
        update media.media_assets
        set restore_archived_after_processing = true
        where id = ${repairAssetId}
      `.execute(db);

      const updatedRows = await sql<{ restore_archived_after_processing: boolean }>`
        select restore_archived_after_processing
        from media.media_assets
        where id = ${repairAssetId} and organization_id = ${organizationId}
      `.execute(db);
      assert.equal(updatedRows.rows.length, 1);
      assert.equal(updatedRows.rows[0]?.restore_archived_after_processing, true);
    },
  },
};
