import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { MediaDomainError } from './types.js';

export interface MediaHealthIssue {
  readonly code:
    | 'MISSING_CURRENT_OBJECT'
    | 'MISSING_IMAGE_RENDITIONS'
    | 'STALE_PROCESSING'
    | 'PURGE_RETRY_PENDING'
    | 'STALE_PURGE'
    | 'USAGE_PROJECTION_DRIFT'
    | 'MISSING_PUBLIC_ALT_TEXT'
    | 'LARGE_ORIGINAL'
    | 'DUPLICATE_CHECKSUM';
  readonly assetId: string;
  readonly detail: string;
}

export async function listMediaHealthIssues(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly MediaHealthIssue[]> {
  const result = await sql<{ code: MediaHealthIssue['code']; asset_id: string; detail: string }>`
    select 'MISSING_CURRENT_OBJECT' code,asset.id::text asset_id,
      'Ready or archived asset has no current original object.' detail
    from media.media_assets asset
    where asset.organization_id=${organizationId}
      and asset.status in ('READY','ARCHIVED') and asset.current_object_id is null
    union all
    select 'MISSING_IMAGE_RENDITIONS',asset.id::text,
      'Ready or archived image is missing required processed renditions.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.asset_type='IMAGE'
      and asset.status in ('READY','ARCHIVED')
      and (select count(distinct rendition.rendition_key) from media.media_renditions rendition
        where rendition.organization_id=asset.organization_id and rendition.asset_id=asset.id
          and rendition.source_object_id=asset.current_object_id
          and rendition.storage_provider<>'url'
          and rendition.mime_type in ('image/webp','image/avif')
          and (asset.upload_source<>'MESSAGING_ATTACHMENT' or
            rendition.rendition_key in ('thumbnail','card')))
        < case when asset.upload_source='MESSAGING_ATTACHMENT' then 2 else 4 end
    union all
    select 'STALE_PROCESSING',asset.id::text,
      'Processing lease is older than ten minutes and is eligible for recovery.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.status='PROCESSING'
      and asset.updated_at<now()-interval '10 minutes'
    union all
    select 'PURGE_RETRY_PENDING',asset.id::text,
      'A purge attempt failed and is queued for retry.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.status='PURGING'
      and asset.purge_last_error is not null
    union all
    select 'STALE_PURGE',asset.id::text,
      'A purge lease expired and can be reclaimed by a worker.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.status='PURGING'
      and asset.purge_lease_until<=now()
    union all
    select 'MISSING_PUBLIC_ALT_TEXT',asset.id::text,
      'Public image has no default alternative text.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.asset_type='IMAGE'
      and asset.visibility_class='PUBLIC' and asset.status in ('READY','ARCHIVED')
      and (asset.alt_text is null or length(trim(asset.alt_text))=0)
    union all
    select 'LARGE_ORIGINAL',asset.id::text,
      'Original object is larger than 8 MB; verify that retaining it is intentional.'
    from media.media_assets asset join media.media_objects object
      on object.organization_id=asset.organization_id and object.id=asset.current_object_id
    where asset.organization_id=${organizationId} and object.byte_size>8388608
      and asset.status not in ('TRASHED','PURGING')
    union all
    select 'DUPLICATE_CHECKSUM',object.asset_id::text,
      'Another asset in this organization has the same original checksum.'
    from media.media_objects object
    where object.organization_id=${organizationId} and object.checksum_sha256 is not null
      and exists(select 1 from media.media_objects duplicate
        where duplicate.organization_id=object.organization_id
          and duplicate.checksum_sha256=object.checksum_sha256 and duplicate.id<object.id)
    union all
    select 'USAGE_PROJECTION_DRIFT',authoritative.asset_id::text,
      'An authoritative relationship is absent from the Media usage projection.'
    from (
      select product.organization_id,product.asset_id,'catalog' domain,product.id relationship_id
      from catalog.product_media product where product.organization_id=${organizationId}
      union all
      select review.organization_id,review.media_asset_id,'reviews',review.id
      from reviews.review_media review where review.organization_id=${organizationId}
    ) authoritative
    where not exists(select 1 from media.media_usage_projection projection
      where projection.organization_id=authoritative.organization_id
        and projection.asset_id=authoritative.asset_id
        and projection.domain=authoritative.domain
        and projection.relationship_id=authoritative.relationship_id)
    order by code,asset_id
  `.execute(db);
  return result.rows.map((row) => ({
    code: row.code,
    assetId: row.asset_id,
    detail: row.detail,
  }));
}

export async function listMediaStorageInventory(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; pageSize: number; cursor?: string },
) {
  type Cursor = { assetId: string; kind: 'ORIGINAL' | 'RENDITION'; objectKey: string; recordId: string };
  let cursor: Cursor | undefined;
  if (input.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as Cursor;
      if (!/^[0-9a-f-]{36}$/i.test(parsed.assetId) ||
        !/^[0-9a-f-]{36}$/i.test(parsed.recordId) ||
        !['ORIGINAL', 'RENDITION'].includes(parsed.kind) ||
        typeof parsed.objectKey !== 'string' || parsed.objectKey.length > 1000)
        throw new Error('Invalid cursor');
      cursor = parsed;
    } catch {
      throw new MediaDomainError('VALIDATION_FAILED', 'Invalid media health scan cursor.');
    }
  }
  const result = await sql<{
    asset_id: string;
    kind: 'ORIGINAL' | 'RENDITION';
    record_id: string;
    provider: string;
    bucket: string;
    object_key: string;
    byte_size: string;
  }>`select * from (
      select object.asset_id::text asset_id,'ORIGINAL'::text kind,object.id::text record_id,
        object.storage_provider provider,object.bucket_name bucket,object.object_key,
        object.byte_size::text byte_size
      from media.media_objects object join media.media_assets asset
        on asset.organization_id=object.organization_id and asset.id=object.asset_id
      where object.organization_id=${input.organizationId} and asset.status<>'PURGING'
      union all
      select rendition.asset_id::text,'RENDITION'::text,rendition.id::text,
        rendition.storage_provider,rendition.bucket_name,rendition.object_key,
        rendition.byte_size::text
      from media.media_renditions rendition join media.media_assets asset
        on asset.organization_id=rendition.organization_id and asset.id=rendition.asset_id
      where rendition.organization_id=${input.organizationId} and asset.status<>'PURGING'
    ) inventory
    where ${cursor ? sql`(asset_id,kind,object_key,record_id) >
      (${cursor.assetId},${cursor.kind},${cursor.objectKey},${cursor.recordId})` : sql`true`}
    order by asset_id,kind,object_key,record_id limit ${input.pageSize + 1}`.execute(db);
  const page = result.rows.slice(0, input.pageSize);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      assetId: row.asset_id,
      kind: row.kind,
      provider: row.provider,
      bucket: row.bucket,
      objectKey: row.object_key,
      byteSize: Number(row.byte_size),
    })),
    hasMore: result.rows.length > input.pageSize,
    nextCursor: result.rows.length > input.pageSize && last
      ? Buffer.from(JSON.stringify({ assetId: last.asset_id, kind: last.kind,
        objectKey: last.object_key, recordId: last.record_id })).toString('base64url')
      : null,
  };
}
