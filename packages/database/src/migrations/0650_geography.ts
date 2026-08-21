import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Forward-only reconciliation: the original blueprint placed Geography before
 * Catalog, but production migration history already reached 0601.  Keep that
 * applied history immutable and append Geography at the next safe position.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
          create schema if not exists geography;

          create table geography.datasets (
            id uuid primary key default uuidv7(),
            code text not null,
            version text not null,
            source_name text not null,
            source_url text,
            imported_at timestamptz not null default now(),
            metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
            unique (code, version)
          );

          create table geography.nodes (
            id uuid primary key default uuidv7(),
            dataset_id uuid references geography.datasets(id) on delete restrict,
            parent_id uuid references geography.nodes(id) on delete restrict,
            node_type text not null check (node_type in ('COUNTRY','DIVISION','DISTRICT','UPAZILA','THANA','CITY_CORPORATION','MUNICIPALITY','UNION','WARD','LOCALITY','VILLAGE','OTHER')),
            canonical_name text not null,
            local_name text,
            source_code text,
            status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','HISTORICAL')),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            version bigint not null default 1,
            unique nulls not distinct (dataset_id, source_code)
          );
          create index geography_nodes_parent_index on geography.nodes(parent_id);
          create index geography_nodes_name_index on geography.nodes(lower(canonical_name));

          create table geography.node_aliases (
            id uuid primary key default uuidv7(),
            node_id uuid not null references geography.nodes(id) on delete cascade,
            alias text not null,
            normalized_alias text not null,
            language_code text,
            source_name text,
            created_at timestamptz not null default now(),
            unique (node_id, normalized_alias)
          );
          create index geography_node_aliases_search_index on geography.node_aliases(lower(normalized_alias));
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop schema if exists geography cascade;`.execute(db);
}
