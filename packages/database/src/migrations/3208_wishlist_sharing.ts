import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Guest share snapshots are independent of private browser state. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema wishlist;
    create table wishlist.shares (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      view_token_digest bytea not null unique,
      manage_token_digest bytea not null unique,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      check (expires_at > created_at),
      unique (organization_id,id)
    );
    create index wishlist_shares_expiry on wishlist.shares (expires_at) where revoked_at is null;
    create table wishlist.share_items (
      organization_id uuid not null,
      share_id uuid not null,
      product_id uuid not null,
      position integer not null check (position between 1 and 100),
      primary key (share_id,product_id),
      unique (share_id,position),
      foreign key (organization_id,share_id) references wishlist.shares(organization_id,id) on delete cascade,
      foreign key (organization_id,product_id) references catalog.products(organization_id,id) on delete cascade
    );
    create index wishlist_share_items_product on wishlist.share_items (organization_id,product_id);
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop schema wishlist cascade`.execute(db);
}
