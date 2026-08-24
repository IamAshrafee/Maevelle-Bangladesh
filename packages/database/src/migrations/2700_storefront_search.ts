import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Rebuildable public search projection; Catalog/Pricing/Inventory remain authoritative. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists search;
    create table search.catalog_documents (
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      handle text not null,
      title text not null,
      description text,
      search_text text not null,
      document tsvector generated always as (to_tsvector('simple', search_text)) stored,
      category_ids uuid[] not null default '{}',
      minimum_price numeric(20,4),
      currency_code text,
      available boolean not null default false,
      published_at timestamptz not null,
      projection_version integer not null default 1,
      rebuilt_at timestamptz not null default now(),
      primary key (organization_id, product_id),
      unique (organization_id, handle),
      check (currency_code is null or currency_code ~ '^[A-Z]{3}$')
    );
    create index catalog_documents_fts on search.catalog_documents using gin (document);
    create index catalog_documents_title_trgm on search.catalog_documents using gin (title gin_trgm_ops);
    create index catalog_documents_categories on search.catalog_documents using gin (category_ids);
    create index catalog_documents_browse on search.catalog_documents
      (organization_id, available, minimum_price, published_at desc, product_id);
    create table search.projection_receipts (
      source_event_id bigint primary key references platform.outbox_events(id),
      organization_id uuid not null references platform.organizations(id),
      processed_at timestamptz not null default now()
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Storefront search projections have no automatic down migration.');
}
