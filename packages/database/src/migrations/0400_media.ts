import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Stable asset identity, quarantine uploads, immutable originals, and derived delivery objects. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists media;

    create table media.media_folders (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      parent_id uuid,
      name text not null check (length(trim(name)) between 1 and 120),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      unique nulls not distinct (organization_id, parent_id, name),
      foreign key (organization_id, parent_id)
        references media.media_folders(organization_id, id)
    );
    create index media_folders_parent on media.media_folders (organization_id, parent_id, name);

    create table media.media_assets (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_type text not null check (asset_type in ('IMAGE', 'DOCUMENT')),
      visibility_class text not null default 'PRIVATE'
        check (visibility_class in ('PUBLIC', 'PRIVATE')),
      status text not null default 'PENDING_UPLOAD'
        check (status in (
          'PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED',
          'QUARANTINED', 'ARCHIVED', 'TRASHED', 'PURGING'
        )),
      current_object_id uuid,
      folder_id uuid,
      original_filename text not null check (length(original_filename) between 1 and 255),
      normalized_extension text not null check (normalized_extension ~ '^[a-z0-9]{1,10}$'),
      title text check (title is null or length(title) <= 160),
      alt_text text check (alt_text is null or length(alt_text) <= 500),
      caption text check (caption is null or length(caption) <= 1000),
      internal_description text check (internal_description is null or length(internal_description) <= 4000),
      upload_source text not null default 'ADMIN_UPLOAD'
        check (upload_source in ('ADMIN_UPLOAD', 'CUSTOMER_REVIEW', 'SUPPLIER_IMPORT', 'API', 'MIGRATION', 'SYSTEM_GENERATED')),
      uploaded_by uuid references iam.users(id),
      guest_owner_hash text check (guest_owner_hash is null or guest_owner_hash ~ '^[0-9a-f]{64}$'),
      processing_error_code text,
      processing_error_message text,
      archived_at timestamptz,
      trashed_at timestamptz,
      purge_after timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      foreign key (organization_id, folder_id)
        references media.media_folders(organization_id, id),
      check ((status = 'ARCHIVED') = (archived_at is not null)),
      check ((status in ('TRASHED', 'PURGING')) = (trashed_at is not null))
    );
    create index media_assets_library on media.media_assets
      (organization_id, status, created_at desc, id desc);
    create index media_assets_type_visibility on media.media_assets
      (organization_id, asset_type, visibility_class, created_at desc);
    create index media_assets_processing on media.media_assets
      (status, updated_at, id) where status in ('UPLOADED', 'PROCESSING', 'FAILED', 'PURGING');
    create index media_assets_guest_owner on media.media_assets
      (organization_id, guest_owner_hash, created_at desc) where guest_owner_hash is not null;

    create table media.media_objects (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      object_role text not null check (object_role in ('ORIGINAL')),
      storage_provider text not null,
      bucket_name text not null,
      object_key text not null,
      mime_type text not null,
      byte_size bigint not null check (byte_size > 0),
      checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
      width_px integer check (width_px is null or width_px > 0),
      height_px integer check (height_px is null or height_px > 0),
      file_format text,
      metadata_json jsonb,
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, storage_provider, bucket_name, object_key),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id),
      check (metadata_json is null or jsonb_typeof(metadata_json) = 'object')
    );
    create index media_objects_asset on media.media_objects
      (organization_id, asset_id, created_at desc);
    create index media_objects_checksum on media.media_objects
      (organization_id, checksum_sha256);
    alter table media.media_assets add constraint media_assets_current_object_fk
      foreign key (organization_id, current_object_id)
      references media.media_objects(organization_id, id);

    create table media.media_renditions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      source_object_id uuid not null,
      rendition_key text not null check (rendition_key in ('thumbnail', 'card', 'pdp', 'zoom')),
      storage_provider text not null,
      bucket_name text not null,
      object_key text not null,
      mime_type text not null check (mime_type in ('image/webp', 'image/avif', 'image/jpeg', 'image/png')),
      byte_size bigint not null check (byte_size > 0),
      checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      width_px integer not null check (width_px > 0),
      height_px integer not null check (height_px > 0),
      processor_version text not null,
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, asset_id, rendition_key, processor_version),
      unique (organization_id, storage_provider, bucket_name, object_key),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id),
      foreign key (organization_id, source_object_id)
        references media.media_objects(organization_id, id)
    );
    create index media_renditions_asset on media.media_renditions
      (organization_id, asset_id, rendition_key);

    create table media.media_upload_sessions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      status text not null default 'PENDING'
        check (status in ('PENDING', 'UPLOADED', 'COMPLETED', 'EXPIRED', 'FAILED')),
      declared_mime_type text not null,
      declared_byte_size bigint not null check (declared_byte_size > 0),
      storage_provider text not null,
      bucket_name text not null,
      object_key text not null,
      expires_at timestamptz not null,
      uploaded_at timestamptz,
      completed_at timestamptz,
      failure_code text,
      created_by uuid references iam.users(id),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, asset_id),
      unique (organization_id, storage_provider, bucket_name, object_key),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id),
      check (expires_at > created_at)
    );
    create index media_upload_sessions_expiry on media.media_upload_sessions
      (expires_at, id) where status = 'PENDING';

    create table media.media_processing_records (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      attempt integer not null check (attempt > 0),
      status text not null check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
      processor_version text not null,
      error_code text,
      error_message text,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      unique (organization_id, asset_id, attempt),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id)
    );

    create table media.media_tags (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      name text not null check (length(trim(name)) between 1 and 80),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, name)
    );
    create table media.media_asset_tags (
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      tag_id uuid not null,
      created_at timestamptz not null default now(),
      primary key (organization_id, asset_id, tag_id),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id),
      foreign key (organization_id, tag_id)
        references media.media_tags(organization_id, id)
    );

    create table catalog.product_media (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      product_id uuid not null,
      variant_id uuid,
      option_value_id uuid,
      asset_id uuid not null,
      role text not null check (role in ('GALLERY', 'THUMBNAIL', 'COLOR_GALLERY', 'SIZE_DIAGRAM')),
      alt_text_override text check (alt_text_override is null or length(alt_text_override) <= 500),
      crop_json jsonb,
      is_primary boolean not null default false,
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, product_id)
        references catalog.products(organization_id, id),
      foreign key (organization_id, variant_id)
        references catalog.product_variants(organization_id, id),
      foreign key (organization_id, option_value_id)
        references catalog.product_option_values(organization_id, id),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id),
      check (num_nonnulls(variant_id, option_value_id) <= 1),
      check (position >= 0),
      check (crop_json is null or jsonb_typeof(crop_json) = 'object')
    );
    create unique index product_media_unique_placement on catalog.product_media
      (organization_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(option_value_id, '00000000-0000-0000-0000-000000000000'::uuid), asset_id, role);
    create unique index product_media_one_primary_per_scope on catalog.product_media
      (organization_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(option_value_id, '00000000-0000-0000-0000-000000000000'::uuid))
      where is_primary;
    create index product_media_product_variant_position on catalog.product_media
      (organization_id, product_id, variant_id, option_value_id, position, id);
    create index product_media_asset on catalog.product_media (organization_id, asset_id);

    create table media.media_usage_projection (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      domain text not null,
      usage_type text not null,
      entity_id uuid not null,
      relationship_id uuid,
      label text,
      created_at timestamptz not null default now(),
      unique nulls not distinct (organization_id, asset_id, domain, usage_type, entity_id, relationship_id),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id)
    );
    create index media_usage_projection_entity on media.media_usage_projection
      (organization_id, domain, entity_id);

    create table media.media_usage_history (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      asset_id uuid not null,
      action text not null check (action in ('ATTACHED', 'DETACHED', 'RELINKED')),
      domain text not null,
      usage_type text not null,
      entity_id uuid not null,
      relationship_id uuid,
      actor_id uuid references iam.users(id),
      occurred_at timestamptz not null default now(),
      foreign key (organization_id, asset_id)
        references media.media_assets(organization_id, id)
    );
    create index media_usage_history_asset on media.media_usage_history
      (organization_id, asset_id, occurred_at desc);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Media asset history has no automatic down migration.');
}
