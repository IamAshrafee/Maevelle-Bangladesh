import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Replace URL-backed ready assets with queued, owned-byte imports. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table media.external_image_imports (
      asset_id uuid primary key,
      organization_id uuid not null,
      source_url text not null check (length(source_url) > 0),
      old_object_id uuid,
      restore_archived boolean not null default false,
      status text not null default 'PENDING'
        check (status in ('PENDING','PROCESSING','RETRY_WAIT','COMPLETE','FAILED')),
      attempt_count integer not null default 0 check (attempt_count >= 0),
      next_attempt_at timestamptz,
      claim_token uuid,
      lease_until timestamptz,
      last_error_code text,
      last_error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz,
      unique (organization_id,asset_id),
      foreign key (organization_id,asset_id) references media.media_assets(organization_id,id)
        on delete cascade,
      check ((claim_token is null) = (lease_until is null))
    );
    create index external_image_imports_claim on media.external_image_imports
      (status,next_attempt_at,lease_until,created_at,asset_id)
      where status in ('PENDING','PROCESSING','RETRY_WAIT');

    insert into media.external_image_imports
      (asset_id,organization_id,source_url,old_object_id,restore_archived)
    select asset.id,asset.organization_id,object.object_key,object.id,asset.status='ARCHIVED'
    from media.media_assets asset join media.media_objects object
      on object.organization_id=asset.organization_id and object.id=asset.current_object_id
    where object.storage_provider='url'
      and asset.status in ('READY','ARCHIVED','FAILED','UPLOADED','PROCESSING');

    update media.media_assets asset set status='PENDING_UPLOAD',archived_at=null,
      processing_error_code=null,processing_error_message=null,updated_at=now(),version=version+1
    from media.external_image_imports job
    where job.organization_id=asset.organization_id and job.asset_id=asset.id
      and asset.status in ('READY','ARCHIVED','FAILED','UPLOADED','PROCESSING');
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop table if exists media.external_image_imports`.execute(db);
}
