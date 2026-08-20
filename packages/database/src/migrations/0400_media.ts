import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Media assets keep business identity separate from local/S3/R2 object locations. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists media;
    create table media.media_assets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_type text not null check (asset_type in ('IMAGE')),
      visibility_class text not null default 'PRIVATE' check (visibility_class in ('PUBLIC', 'PRIVATE')),
      status text not null check (status in ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED')),
      current_object_id uuid,
      title text,
      alt_text text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1
    );
    create table media.media_objects (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null references media.media_assets(id),
      storage_provider text not null,
      object_key text not null,
      mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
      byte_size bigint not null check (byte_size > 0),
      checksum_sha256 text not null,
      width_px integer,
      height_px integer,
      metadata_json jsonb,
      created_at timestamptz not null default now(),
      unique (storage_provider, object_key),
      check (metadata_json is null or jsonb_typeof(metadata_json) = 'object')
    );
    alter table media.media_assets add constraint media_assets_current_object_fk foreign key (current_object_id) references media.media_objects(id);
    create index media_objects_asset on media.media_objects (asset_id, created_at desc);
    create table media.media_renditions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null references media.media_assets(id),
      source_object_id uuid not null references media.media_objects(id),
      rendition_key text not null,
      storage_provider text not null,
      object_key text not null,
      mime_type text not null,
      byte_size bigint not null check (byte_size > 0),
      width_px integer,
      height_px integer,
      processor_version text not null,
      created_at timestamptz not null default now(),
      unique (asset_id, rendition_key, processor_version),
      unique (storage_provider, object_key)
    );
    create table catalog.product_media (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null references catalog.products(id),
      variant_id uuid references catalog.product_variants(id),
      asset_id uuid not null references media.media_assets(id),
      role text not null check (role in ('GALLERY', 'THUMBNAIL', 'COLOR_GALLERY', 'SIZE_DIAGRAM')),
      position integer not null default 0,
      created_at timestamptz not null default now(),
      unique (product_id, variant_id, asset_id, role)
    );
    create index product_media_product_variant_position on catalog.product_media (product_id, variant_id, position, id);
    create table media.media_usage_projection (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null references media.media_assets(id),
      domain text not null,
      usage_type text not null,
      entity_id uuid not null,
      created_at timestamptz not null default now(),
      unique (asset_id, domain, usage_type, entity_id)
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Media asset history has no automatic down migration.');
}
