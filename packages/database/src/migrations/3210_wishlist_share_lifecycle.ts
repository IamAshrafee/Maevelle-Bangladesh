import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Extends 3208 in place; existing guest capabilities and rows remain valid. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table wishlist.shares
      add column owner_account_id uuid,
      add column view_token_ciphertext bytea,
      add column claim_token_digest bytea,
      add column version bigint not null default 1 check (version > 0),
      add constraint wishlist_share_owner_fk foreign key (organization_id,owner_account_id)
        references customers.customer_accounts(organization_id,id),
      add constraint wishlist_share_owner_credential_ck
        check ((owner_account_id is null and manage_token_digest is not null)
          or (owner_account_id is not null and manage_token_digest is null));
    alter table wishlist.shares alter column manage_token_digest drop not null;
    create index wishlist_shares_owner_history
      on wishlist.shares (organization_id,owner_account_id,created_at desc,id desc)
      where owner_account_id is not null;
    create index wishlist_shares_retention on wishlist.shares ((coalesce(revoked_at,expires_at)));
    alter table wishlist.share_items add column preferred_variant_id uuid;
    alter table wishlist.share_items add constraint wishlist_share_item_variant_fk
      foreign key (organization_id,product_id,preferred_variant_id)
      references catalog.product_variants(organization_id,product_id,id)
      on delete set null (preferred_variant_id);
    create table wishlist.share_create_receipts (
      organization_id uuid not null references platform.organizations(id),
      owner_scope text not null,
      operation_id text not null check (operation_id ~ '^[A-Za-z0-9_-]{43}$'),
      request_digest bytea not null check (octet_length(request_digest)=32),
      share_id uuid not null,
      response_ciphertext bytea not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      primary key (organization_id,owner_scope,operation_id),
      foreign key (organization_id,share_id) references wishlist.shares(organization_id,id)
        on delete cascade,
      check (expires_at > created_at)
    );
    create index wishlist_share_receipts_expiry on wishlist.share_create_receipts(expires_at);
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    drop table wishlist.share_create_receipts;
    alter table wishlist.share_items drop constraint wishlist_share_item_variant_fk;
    alter table wishlist.share_items drop column preferred_variant_id;
    drop index wishlist_shares_owner_history;
    drop index wishlist_shares_retention;
    alter table wishlist.shares drop constraint wishlist_share_owner_credential_ck;
    alter table wishlist.shares drop constraint wishlist_share_owner_fk;
    alter table wishlist.shares drop column version;
    alter table wishlist.shares drop column view_token_ciphertext;
    alter table wishlist.shares drop column claim_token_digest;
    alter table wishlist.shares drop column owner_account_id;
    alter table wishlist.shares alter column manage_token_digest set not null;
  `.execute(db);
}
