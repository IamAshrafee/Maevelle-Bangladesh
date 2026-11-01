import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Additive to 3208: guest share rows and credentials are unchanged. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table customers.customer_accounts
      add constraint customer_accounts_organization_id_unique unique (organization_id, id);

    create table wishlist.account_lists (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      owner_account_id uuid not null,
      version bigint not null default 1 check (version > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, owner_account_id),
      foreign key (organization_id, owner_account_id)
        references customers.customer_accounts(organization_id, id)
    );

    create table wishlist.account_items (
      id uuid primary key default uuidv7(),
      organization_id uuid not null,
      wishlist_id uuid not null,
      product_id uuid not null,
      preferred_variant_id uuid,
      saved_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1 check (version > 0),
      unique (organization_id, wishlist_id, product_id),
      foreign key (organization_id, wishlist_id)
        references wishlist.account_lists(organization_id, id) on delete cascade,
      foreign key (organization_id, product_id)
        references catalog.products(organization_id, id) on delete cascade,
      foreign key (organization_id, product_id, preferred_variant_id)
        references catalog.product_variants(organization_id, product_id, id)
        on delete set null (preferred_variant_id)
    );
    create index account_items_recent
      on wishlist.account_items (organization_id, wishlist_id, saved_at desc, id desc);
    create index account_items_product
      on wishlist.account_items (organization_id, product_id);

    create table wishlist.merge_receipts (
      organization_id uuid not null,
      wishlist_id uuid not null,
      merge_id uuid not null,
      request_digest bytea not null check (octet_length(request_digest) = 32),
      account_version bigint not null check (account_version > 0),
      result jsonb not null check (jsonb_typeof(result) = 'object'),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      primary key (organization_id, wishlist_id, merge_id),
      check (expires_at > created_at),
      foreign key (organization_id, wishlist_id)
        references wishlist.account_lists(organization_id, id) on delete cascade
    );
    create index merge_receipts_expiry on wishlist.merge_receipts (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    drop table wishlist.merge_receipts;
    drop table wishlist.account_items;
    drop table wishlist.account_lists;
    alter table customers.customer_accounts
      drop constraint customer_accounts_organization_id_unique;
  `.execute(db);
}
