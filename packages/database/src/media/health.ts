import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export interface MediaHealthIssue {
  readonly code:
    | 'MISSING_CURRENT_OBJECT'
    | 'MISSING_IMAGE_RENDITIONS'
    | 'STALE_PROCESSING'
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
      'Ready or archived image has no generated rendition.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.asset_type='IMAGE'
      and asset.status in ('READY','ARCHIVED')
      and not exists(select 1 from media.media_renditions rendition
        where rendition.organization_id=asset.organization_id and rendition.asset_id=asset.id)
    union all
    select 'STALE_PROCESSING',asset.id::text,
      'Processing lease is older than ten minutes and is eligible for recovery.'
    from media.media_assets asset
    where asset.organization_id=${organizationId} and asset.status='PROCESSING'
      and asset.updated_at<now()-interval '10 minutes'
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
    order by code,asset_id limit 500
  `.execute(db);
  return result.rows.map((row) => ({
    code: row.code,
    assetId: row.asset_id,
    detail: row.detail,
  }));
}

export async function listMediaStorageInventory(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  const result = await sql<{
    asset_id: string;
    kind: 'ORIGINAL' | 'RENDITION';
    provider: string;
    bucket: string;
    object_key: string;
  }>`select object.asset_id::text,'ORIGINAL' kind,object.storage_provider provider,
      object.bucket_name bucket,object.object_key
    from media.media_objects object join media.media_assets asset
      on asset.organization_id=object.organization_id and asset.id=object.asset_id
    where object.organization_id=${organizationId} and asset.status<>'PURGING'
    union all
    select rendition.asset_id::text,'RENDITION',rendition.storage_provider,
      rendition.bucket_name,rendition.object_key
    from media.media_renditions rendition join media.media_assets asset
      on asset.organization_id=rendition.organization_id and asset.id=rendition.asset_id
    where rendition.organization_id=${organizationId} and asset.status<>'PURGING'
    order by asset_id,kind,object_key limit 2000`.execute(db);
  return result.rows.map((row) => ({
    assetId: row.asset_id,
    kind: row.kind,
    provider: row.provider,
    bucket: row.bucket,
    objectKey: row.object_key,
  }));
}
