import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Keep the operation identity after encrypted recovery expires, even if its share is purged. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table wishlist.share_create_receipts
      add column request_expires_at timestamptz;
    update wishlist.share_create_receipts receipt
      set request_expires_at=share.expires_at
      from wishlist.shares share
      where share.organization_id=receipt.organization_id and share.id=receipt.share_id;
    alter table wishlist.share_create_receipts
      alter column request_expires_at set not null,
      alter column response_ciphertext drop not null,
      alter column share_id drop not null;
    alter table wishlist.share_create_receipts
      drop constraint share_create_receipts_organization_id_share_id_fkey;
    alter table wishlist.share_create_receipts
      add constraint wishlist_share_receipt_share_fk
      foreign key (organization_id,share_id) references wishlist.shares(organization_id,id)
      on delete set null (share_id);
    create index wishlist_share_receipts_ciphertext_cleanup
      on wishlist.share_create_receipts(expires_at) where response_ciphertext is not null;
    create index wishlist_share_receipts_tombstone_cleanup
      on wishlist.share_create_receipts(request_expires_at)
      where response_ciphertext is null;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Share creation tombstones must not be removed automatically.');
}
